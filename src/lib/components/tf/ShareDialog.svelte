<script lang="ts">
	import type { Database } from '$lib/types/database';
	import type { Mitnutzer, Rolle } from '$lib/utils/mitnutzer';
	import Icon from './Icon.svelte';

	type List = Database['public']['Tables']['lists']['Row'];

	/**
	 * Teilen-Popover nach A-klar-spec.md, Abschnitt 6.
	 *
	 * Wichtigste Aenderung gegenueber der v2-Fassung: hier steht **keine
	 * UUID** mehr. Namen, Initialen und Farben kommen fertig aus
	 * `src/lib/utils/mitnutzer.ts` — Anzeigename, sonst E-Mail, sonst
	 * „Mitnutzer", niemals die ID. Die alte Fassung zeigte `share.user_id`
	 * als Namen und baute die Avatar-Initiale aus dessen erstem Zeichen.
	 */
	let {
		list,
		beteiligte,
		shareIdVon,
		eigeneEmail = null,
		x,
		y,
		onClose,
		onShare,
		onRemoveShare,
		onChangeRole
	}: {
		list: List;
		/** Besitzer zuerst, danach die Geteilten — anzeigefertig. */
		beteiligte: Mitnutzer[];
		/** userId -> id der Freigabezeile. Der Besitzer hat keine. */
		shareIdVon: Map<string, string>;
		/** Nur die eigene Adresse ist bekannt — `profiles` fuehrt keine E-Mail. */
		eigeneEmail?: string | null;
		/** Anker: rechte Kante und Unterkante des ausloesenden Knopfes. */
		x: number;
		y: number;
		onClose: () => void;
		onShare: (email: string, role: 'editor' | 'viewer') => void;
		onRemoveShare: (shareId: string) => void;
		onChangeRole: (shareId: string, role: 'editor' | 'viewer') => void;
	} = $props();

	let eingabe = $state('');
	let neueRolle = $state<'editor' | 'viewer'>('editor');
	let fehler = $state('');

	let panelEl: HTMLDivElement | undefined = $state();

	const rollenNamen: Record<Rolle, string> = {
		owner: 'Besitzer',
		editor: 'Bearbeiter',
		viewer: 'Betrachter'
	};

	/**
	 * Zweitzeile unter dem Namen (Mockup: 12 px unter jeder Zeile).
	 *
	 * Eine E-Mail gibt es nur fuer die eigene Person — `profiles` fuehrt keine
	 * Adresse. Fuer alle anderen traegt die Rolle die Zeile, als Satz
	 * formuliert, damit sie sich von der Rollen-Pille rechts unterscheidet.
	 * Ganz ohne Zweitzeile waeren zwei gleich benannte Mitnutzer im Popover
	 * nicht auseinanderzuhalten.
	 */
	const rollenZeile: Record<Rolle, string> = {
		owner: 'Besitzer',
		editor: 'darf bearbeiten',
		viewer: 'darf lesen'
	};

	function zweitzeile(m: Mitnutzer): string {
		if (m.ich) return eigeneEmail ? `du \u00b7 ${eigeneEmail}` : 'du';
		return rollenZeile[m.rolle];
	}

	// Verankerung nach Spezifikation Abschnitt 3 und 6: das Popover gehoert in
	// die LISTENSPALTE — `top:58px; right:20px`, bezogen auf `.tf-main`.
	// Vorher hing es an der rechten Kante der Geteilt-Pille und verdeckte
	// damit die erste Aufgabenzeile samt ASAP-Chip (rechte Kante bei 533 px
	// statt 702 px). `x`/`y` bleiben der Rueckfall, solange keine
	// Listenspalte im Baum steht (mobiler Unterschirm, Smart-Ansichten).
	// Unter 900 px setzt die Medienabfrage in tf.css linke und rechte Kante.
	$effect(() => {
		const px = x;
		const py = y;
		if (!panelEl) return;
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const bw = panelEl.offsetWidth;
		const bh = panelEl.offsetHeight;
		const spalte = vw >= 900 ? document.querySelector('.tf-main')?.getBoundingClientRect() : null;
		const kanteRechts = spalte ? spalte.right - 20 : px;
		const kanteOben = spalte ? spalte.top + 58 : py;
		const links = Math.max(12, Math.min(kanteRechts - bw, vw - bw - 12));
		const oben = Math.max(12, Math.min(kanteOben, vh - bh - 12));
		panelEl.style.left = `${links}px`;
		panelEl.style.top = `${oben}px`;
	});

	function einladen() {
		const wert = eingabe.trim();
		if (!wert.includes('@')) {
			fehler = 'Bitte eine E-Mail-Adresse eingeben.';
			return;
		}
		fehler = '';
		onShare(wert, neueRolle);
		eingabe = '';
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.stopPropagation();
			onClose();
			return;
		}
		if (e.key === 'Enter') {
			e.preventDefault();
			e.stopPropagation();
			einladen();
		}
	}
</script>

<div class="tf-share-hinter" onclick={onClose} role="presentation"></div>

<div
	bind:this={panelEl}
	class="tf-share"
	style="left:{x}px; top:{y}px"
	role="dialog"
	tabindex="-1"
	aria-label="{list.title} teilen"
	onkeydown={handleKeydown}
>
	<h4>{list.title} teilen</h4>
	<p>Wer die Liste &ouml;ffnet, sieht &Auml;nderungen sofort.</p>

	{#each beteiligte as m (m.id)}
		{@const shareId = shareIdVon.get(m.id)}
		<div class="mem">
			<span class="tf-avatar" style="background:{m.farbe}">{m.initialen}</span>
			<div class="who">
				{m.name}
				<small>{zweitzeile(m)}</small>
			</div>
			{#if m.rolle === 'owner' || !shareId}
				<span class="besitzer">{rollenNamen[m.rolle]}</span>
			{:else}
				<span class="tf-rolle">
					<select
						value={m.rolle}
						aria-label="Rolle von {m.name}"
						onchange={(e) => onChangeRole(shareId, (e.currentTarget as HTMLSelectElement).value as 'editor' | 'viewer')}
					>
						<option value="editor">Bearbeiter</option>
						<option value="viewer">Betrachter</option>
					</select>
					<Icon name="chevron-ab" size={14} />
				</span>
				<button class="weg" onclick={() => onRemoveShare(shareId)} aria-label="{m.name} entfernen">
					<Icon name="leeren" size={16} />
				</button>
			{/if}
		</div>
	{/each}

	<div class="inv">
		<span class="fld">
			<Icon name="person" size={16} />
			<!-- svelte-ignore a11y_autofocus -->
			<input type="text" bind:value={eingabe} placeholder="Name oder E-Mail" aria-label="Name oder E-Mail" autofocus />
		</span>
		<span class="tf-rolle">
			<select bind:value={neueRolle} aria-label="Rolle der Einladung">
				<option value="editor">Bearbeiter</option>
				<option value="viewer">Betrachter</option>
			</select>
			<Icon name="chevron-ab" size={14} />
		</span>
	</div>
	{#if fehler}
		<p class="fehler">{fehler}</p>
	{/if}
	<div class="foot">
		<button class="tf-btn primary" onclick={einladen} disabled={!eingabe.trim()}>Einladen</button>
	</div>
</div>
