<script lang="ts" module>
	import type { Eintrag, Eintragsart } from '$lib/utils/verlauf';
	import type { Mitnutzer } from '$lib/utils/mitnutzer';

	/**
	 * Was die Shell dem Verlauf einer Aufgabe mitgibt. Ein Objekt statt
	 * acht einzelner Props, weil `DetailSheet` alles an `TaskDetail`
	 * durchreicht — so waechst dort nur eine Zeile.
	 */
	export type VerlaufAnbindung = {
		/** Alle Eintraege der Aufgabe, neueste zuerst. */
		eintraege: Eintrag[];
		/** Ersteller, Listenbesitzer, Rolle owner/editor. Betrachter lesen nur. */
		darfSchreiben: boolean;
		/** Anzeigename, Initiale, Avatarfarbe zu einer Benutzer-ID — nie die ID selbst. */
		person: (id: string | null) => Mitnutzer;
		/** Neuer Eintrag; `false`, wenn er nicht gespeichert wurde. */
		onNeu: (art: Eintragsart, text: string) => Promise<boolean>;
		onAendern: (id: string, text: string) => void;
		onLoeschen: (id: string) => void;
		onIstDa: (id: string) => void;
		onIstDaZurueck: (id: string) => void;
	};
</script>

<script lang="ts">
	import { tick, untrack } from 'svelte';
	import Icon from './Icon.svelte';
	import { EINTRAG_MAX } from '$lib/utils/verlauf';
	import { formatVerlaufZeit, formatZeitpunkt } from '$lib/utils/datum';

	/**
	 * Gruppe „Verlauf" im Aufgabendetail — direkt unter der Notiz.
	 * Spezifikation: docs/superpowers/specs/2026-09-24-aufgabenhistorie-design.md
	 *
	 * Oben die Eingabe (Segment „Stand | Wartet auf", mitwachsendes Feld,
	 * „Eintragen"), darunter die Eintraege, neueste zuerst. Die Historie ist
	 * optional: ohne Eintraege steht nur die Eingabe, kein Leer-Text, der zum
	 * Ausfuellen draengt. Wer nur lesen darf, sieht keine Eingabe und keine
	 * Aktionen — und ohne Eintraege gar nichts.
	 *
	 * Rechte „Alle alles": wer schreiben darf, darf JEDEN Eintrag bearbeiten,
	 * loeschen und „Ist da" setzen oder zuruecknehmen, nicht nur die eigenen.
	 */
	let {
		aufgabeId,
		sheet = false,
		eintraege,
		darfSchreiben,
		person,
		onNeu,
		onAendern,
		onLoeschen,
		onIstDa,
		onIstDaZurueck
	}: { aufgabeId: string; sheet?: boolean } & VerlaufAnbindung = $props();

	const uid = $props.id();

	const ARTEN: { wert: Eintragsart; label: string; platzhalter: string }[] = [
		{ wert: 'stand', label: 'Stand', platzhalter: 'Was ist passiert?' },
		{ wert: 'wartet', label: 'Wartet auf', platzhalter: 'Worauf wartet ihr?' }
	];

	// ==================================================================
	// RELATIVE ZEITEN — „gerade eben" soll nicht stehen bleiben
	// ==================================================================
	let jetztMs = $state(Date.now());
	$effect(() => {
		const uhr = setInterval(() => (jetztMs = Date.now()), 30_000);
		return () => clearInterval(uhr);
	});

	// ==================================================================
	// EINGABE
	// ==================================================================
	let art = $state<Eintragsart>('stand');
	let entwurf = $state('');
	let feld = $state<HTMLTextAreaElement | undefined>(undefined);
	let platzhalter = $derived(ARTEN.find((a) => a.wert === art)?.platzhalter ?? '');

	/**
	 * Angefangene Eingaben je Aufgabe. Die Detailspalte bleibt beim Wechsel
	 * der Auswahl stehen (kein {#key}); ohne diesen Merkzettel ginge ein
	 * halb getippter Eintrag verloren — oder landete an der falschen Aufgabe.
	 * Bewusst KEIN $state: nur dieser Effekt liest und schreibt ihn.
	 */
	const entwuerfe: Record<string, { art: Eintragsart; text: string }> = {};
	let entwurfFuer = '';

	$effect(() => {
		const id = aufgabeId;
		untrack(() => {
			if (entwurfFuer === id) return;
			if (entwurfFuer) {
				if (entwurf.trim()) entwuerfe[entwurfFuer] = { art, text: entwurf };
				else delete entwuerfe[entwurfFuer];
			}
			art = entwuerfe[id]?.art ?? 'stand';
			entwurf = entwuerfe[id]?.text ?? '';
			bearbeitetId = null;
			entwurfFuer = id;
		});
	});

	/** Felder wachsen mit dem Inhalt (wie die Notiz); die Mindesthoehe kommt aus dem CSS. */
	function anpassen(el: HTMLTextAreaElement | undefined) {
		if (!el) return;
		el.style.height = 'auto';
		el.style.height = `${el.scrollHeight}px`;
	}
	$effect(() => {
		void entwurf;
		anpassen(feld);
	});

	async function senden() {
		const text = entwurf.trim();
		if (!text || !darfSchreiben) return;
		const fuer = aufgabeId;
		const gewaehlt = art;
		// Sofort leeren, der Fokus bleibt im Feld: der naechste Eintrag kann
		// gleich folgen. Die Art springt auf „Stand" zurueck — ein Warte-
		// Eintrag ist die Ausnahme und soll nicht aus Versehen entstehen.
		entwurf = '';
		art = 'stand';
		const ok = await onNeu(gewaehlt, text);
		// Nicht gespeichert: den Text zurueckgeben, solange das Feld noch leer
		// ist und dieselbe Aufgabe offen steht. Steht inzwischen eine andere
		// offen, wartet er als Entwurf der alten Aufgabe.
		if (ok) return;
		if (entwurfFuer === fuer) {
			if (entwurf === '') {
				entwurf = text;
				art = gewaehlt;
			}
		} else if (!entwuerfe[fuer]) {
			entwuerfe[fuer] = { art: gewaehlt, text };
		}
	}

	function eingabeTaste(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
			e.preventDefault();
			void senden();
			return;
		}
		if (e.key === 'Escape') {
			// Escape verlaesst nur das Feld; der Entwurf bleibt. Ohne
			// stopPropagation schloesse die Seite gleich das ganze Detail.
			e.stopPropagation();
			feld?.blur();
		}
	}

	/**
	 * Segment als Radiogruppe: Pfeiltasten wechseln die Art. stopPropagation,
	 * sonst wechselte die Seite mit ←/→ zugleich die Liste.
	 */
	function segTaste(e: KeyboardEvent) {
		if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
		e.preventDefault();
		e.stopPropagation();
		const i = ARTEN.findIndex((a) => a.wert === art);
		const schritt = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
		const n = (i + schritt + ARTEN.length) % ARTEN.length;
		art = ARTEN[n].wert;
		const gruppe = (e.currentTarget as HTMLElement).closest('[role="radiogroup"]');
		gruppe?.querySelectorAll<HTMLElement>('[role="radio"]')[n]?.focus();
	}

	/**
	 * Ein Druck auf „Eintragen" soll dem Feld den Fokus nicht nehmen — am
	 * Handy klappte sonst die Tastatur zu und gleich wieder auf.
	 */
	function fokusHalten(e: MouseEvent) {
		e.preventDefault();
	}

	// ==================================================================
	// BEARBEITEN — an Ort und Stelle
	// ==================================================================
	let bearbeitetId = $state<string | null>(null);
	let bearbeitetText = $state('');
	let bearbeitetFeld = $state<HTMLTextAreaElement | undefined>(undefined);

	$effect(() => {
		void bearbeitetText;
		anpassen(bearbeitetFeld);
	});

	async function bearbeiten(e: Eintrag) {
		bearbeitetId = e.id;
		bearbeitetText = e.body;
		await tick();
		bearbeitetFeld?.focus();
		const ende = bearbeitetText.length;
		bearbeitetFeld?.setSelectionRange(ende, ende);
	}

	/** Leer oder unveraendert: nichts schreiben, nur schliessen. */
	function sichern() {
		const id = bearbeitetId;
		if (!id) return;
		bearbeitetId = null;
		const text = bearbeitetText.trim();
		const alt = eintraege.find((x) => x.id === id);
		if (text && alt && text !== alt.body) onAendern(id, text);
	}

	function abbrechen() {
		bearbeitetId = null;
	}

	function bearbeitetTaste(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
			e.preventDefault();
			sichern();
			return;
		}
		if (e.key === 'Escape') {
			e.stopPropagation();
			abbrechen();
		}
	}

	function bearbeitetHinweis(e: Eintrag): string {
		const wer = person(e.edited_by).name;
		const wann = formatZeitpunkt(e.edited_at);
		return wann ? `bearbeitet von ${wer} · ${wann}` : `bearbeitet von ${wer}`;
	}

	let sichtbar = $derived(darfSchreiben || eintraege.length > 0);
</script>

{#if sichtbar}
	<div class="tf-grp tf-verlauf" class:tight={sheet}>
		<div class="tf-lbl" id="{uid}-titel">Verlauf</div>

		{#if darfSchreiben}
			<form
				class="tf-hist-neu"
				onsubmit={(e) => {
					e.preventDefault();
					void senden();
				}}
			>
				<div class="tf-seg klein" role="radiogroup" aria-label="Art des Eintrags">
					{#each ARTEN as a (a.wert)}
						<button
							type="button"
							role="radio"
							aria-checked={art === a.wert}
							tabindex={art === a.wert ? 0 : -1}
							class="tf-segopt"
							class:on={art === a.wert}
							onclick={() => (art = a.wert)}
							onkeydown={segTaste}
						>
							{#if a.wert === 'wartet'}<Icon name="sanduhr" size={14} />{/if}{a.label}
						</button>
					{/each}
				</div>
				<div class="zeile">
					<textarea
						bind:this={feld}
						bind:value={entwurf}
						class="tf-hist-feld"
						rows="1"
						maxlength={EINTRAG_MAX}
						placeholder={platzhalter}
						aria-label={platzhalter}
						onkeydown={eingabeTaste}
					></textarea>
					<button type="submit" class="tf-btn primary" disabled={!entwurf.trim()} onmousedown={fokusHalten}>
						Eintragen
					</button>
				</div>
			</form>
		{/if}

		{#if eintraege.length > 0}
			<ol class="tf-hist-liste" aria-labelledby="{uid}-titel">
				{#each eintraege as e (e.id)}
					{@const autor = person(e.created_by)}
					{@const wartet = e.kind === 'wartet'}
					{@const geloest = wartet && !!e.resolved_at}
					<li class="tf-hist" class:wartet class:geloest data-tf-eintrag={e.id}>
						<span class="tf-avatar" style="background:{autor.farbe}" aria-hidden="true">{autor.initialen}</span>
						<div class="inhalt">
							<div class="kopf">
								<span class="wer">{autor.name}</span>
								<span class="wann" title={formatZeitpunkt(e.created_at)}>
									{formatVerlaufZeit(e.created_at, jetztMs)}
								</span>
								{#if e.edited_at}
									<span class="bearb" title={bearbeitetHinweis(e)}>(bearbeitet)</span>
								{/if}
								{#if darfSchreiben && bearbeitetId !== e.id}
									<span class="akts">
										<button class="akt" aria-label="Eintrag bearbeiten" onclick={() => bearbeiten(e)}>
											<Icon name="umbenennen" size={16} />
										</button>
										<button class="akt loe" aria-label="Eintrag l&ouml;schen" onclick={() => onLoeschen(e.id)}>
											<Icon name="loeschen" size={16} />
										</button>
									</span>
								{/if}
							</div>

							{#if bearbeitetId === e.id}
								<textarea
									bind:this={bearbeitetFeld}
									bind:value={bearbeitetText}
									class="tf-hist-feld"
									rows="1"
									maxlength={EINTRAG_MAX}
									aria-label="Eintrag bearbeiten"
									onkeydown={bearbeitetTaste}
									onblur={sichern}
								></textarea>
								<div class="bearb-akts">
									<button class="tf-btn primary" onmousedown={fokusHalten} onclick={sichern}>Sichern</button>
									<button class="tf-btn ghost" onmousedown={fokusHalten} onclick={abbrechen}>Abbrechen</button>
								</div>
							{:else}
								<p class="txt">{#if wartet}<Icon name="sanduhr" size={14} class="uhr" /><span class="praefix">Wartet auf&nbsp;</span>{/if}{e.body}</p>
							{/if}

							{#if wartet && !geloest && darfSchreiben}
								<button class="tf-btn istda" onclick={() => onIstDa(e.id)}>
									<Icon name="haken" size={16} />Ist da
								</button>
							{:else if geloest}
								{@const loeser = person(e.resolved_by)}
								<div class="geloest-zeile">
									<Icon name="haken" size={14} />
									<span>
										Ist da &middot; {loeser.name} &middot;
										<span title={formatZeitpunkt(e.resolved_at)}>{formatVerlaufZeit(e.resolved_at, jetztMs)}</span>
									</span>
									{#if darfSchreiben}
										<button
											class="zurueck"
											aria-label="&bdquo;Ist da&ldquo; zur&uuml;cknehmen"
											onclick={() => onIstDaZurueck(e.id)}
										>
											Zur&uuml;cknehmen
										</button>
									{/if}
								</div>
							{/if}
						</div>
					</li>
				{/each}
			</ol>
		{/if}
	</div>
{/if}
