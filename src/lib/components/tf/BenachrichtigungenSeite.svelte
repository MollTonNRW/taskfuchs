<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import type { Database } from '$lib/types/database';
	import {
		browserUmgebung,
		einschalten,
		ausschalten,
		pushStatus,
		type PushStatus,
		type PushUmgebung
	} from '$lib/push/abo';
	import { setzeStumm, statusText } from '$lib/push/seite';
	import { toasts } from '$lib/stores/toast';
	import Icon from '$lib/components/tf/Icon.svelte';
	import ToastContainer from '$lib/components/tf/ToastContainer.svelte';

	type List = Database['public']['Tables']['lists']['Row'];

	/**
	 * Einstellungen für Benachrichtigungen: dieses Gerät ein-/ausschalten und
	 * je geteilter Liste stummschalten.
	 *
	 * Steht als Komponente, weil `/app/benachrichtigungen` (echter Zugang) und
	 * die Dev-Vorschau `/vorschau/benachrichtigungen` (Attrappen) dieselbe
	 * Oberfläche zeigen sollen — wie bei der Shell. Daten und Zugang kommen
	 * als Props; die Browser-Umgebung ist ersetzbar, damit die Vorschau jeden
	 * Zustand stellen kann, ohne eine echte Berechtigung anzufragen.
	 *
	 * Die Berechtigung wird NUR hier und NUR nach einem Klick angefragt.
	 */
	let {
		supabase,
		benutzerId,
		listen,
		stummIds,
		umgebung = browserUmgebung()
	}: {
		supabase: SupabaseClient;
		benutzerId: string | null;
		/** Nur geteilte Listen, in Navigationsreihenfolge (`geteilteListen`). */
		listen: List[];
		/** Listen, die diese Person stummgeschaltet hat. */
		stummIds: string[];
		umgebung?: PushUmgebung;
	} = $props();

	/** `null`: der Status wird noch ermittelt. */
	let status = $state<PushStatus | null>(null);
	let beschaeftigt = $state(false);
	let stumm = $state<string[]>(untrack(() => [...stummIds]));

	onMount(async () => {
		status = await pushStatus(umgebung);
	});

	async function geraetUmschalten() {
		if (beschaeftigt || status === null) return;
		const willAn = status !== 'an';
		beschaeftigt = true;
		try {
			if (willAn) {
				// Als Erstes im Klick: die Berechtigungsabfrage braucht die Nutzergeste.
				status = await einschalten(supabase, umgebung);
			} else {
				const vollstaendig = await ausschalten(supabase, umgebung);
				status = await pushStatus(umgebung);
				// Die Anzeige folgt dem Browser („aus"); die Server-Zeile kann trotzdem noch stehen.
				if (!vollstaendig) toasts.error('Ausschalten hat nicht vollständig geklappt.');
			}
		} catch {
			toasts.error(willAn ? 'Einschalten hat nicht geklappt.' : 'Ausschalten hat nicht geklappt.');
			status = await pushStatus(umgebung);
		} finally {
			beschaeftigt = false;
		}
	}

	function istAn(listId: string): boolean {
		return !stumm.includes(listId);
	}

	function lokalSetzen(listId: string, nunStumm: boolean) {
		stumm = nunStumm ? [...stumm.filter((id) => id !== listId), listId] : stumm.filter((id) => id !== listId);
	}

	/** Optimistisch umschalten; bei einem Fehler nur diese Liste zurücknehmen. */
	async function listeUmschalten(liste: List, angehakt: boolean) {
		if (!benutzerId) return;
		const nunStumm = !angehakt;
		lokalSetzen(liste.id, nunStumm);
		try {
			await setzeStumm(supabase, benutzerId, liste.id, nunStumm);
		} catch {
			lokalSetzen(liste.id, !nunStumm);
			toasts.error('Einstellung nicht gespeichert.');
		}
	}
</script>

<svelte:head>
	<title>Benachrichtigungen — TaskFuchs</title>
</svelte:head>

<main class="tf-bn">
	<header class="tf-bn-kopf">
		<a class="tf-ib gross" href="/app" aria-label="Zurück zur App">
			<Icon name="chevron-links" size={24} />
		</a>
		<h1>Benachrichtigungen</h1>
	</header>

	<p class="tf-bn-lead">
		Du bekommst eine Meldung, wenn jemand anderes in einer geteilten Liste etwas ändert. Mehrere Änderungen kurz
		hintereinander kommen gebündelt.
	</p>

	<section class="tf-bn-karte" aria-labelledby="bn-geraet">
		<h2 id="bn-geraet" class="tf-bn-h">Dieses Gerät</h2>
		<p class="tf-bn-status" role="status">
			<Icon name="glocke" size={20} />
			<span>{status === null ? 'Status wird geprüft …' : statusText(status)}</span>
		</p>
		{#if status === 'aus' || status === 'an'}
			<button
				type="button"
				class="tf-btn tf-bn-knopf"
				class:primary={status === 'aus'}
				disabled={beschaeftigt}
				onclick={geraetUmschalten}
			>
				{status === 'an' ? 'Ausschalten' : 'Auf diesem Gerät einschalten'}
			</button>
		{/if}
	</section>

	<section class="tf-bn-karte" aria-labelledby="bn-listen">
		<h2 id="bn-listen" class="tf-bn-h">Geteilte Listen</h2>
		{#if listen.length === 0}
			<p class="tf-bn-leer">
				Du hast noch keine geteilte Liste. Sobald du eine teilst oder jemand eine mit dir teilt, kannst du hier
				einstellen, ob du Meldungen dazu bekommst.
			</p>
		{:else}
			<p class="tf-bn-hinweis">Angehakt heißt: Meldungen an. Das gilt für alle deine Geräte.</p>
			<ul class="tf-bn-liste">
				{#each listen as liste (liste.id)}
					<li>
						<label class="tf-bn-zeile">
							<input
								type="checkbox"
								checked={istAn(liste.id)}
								onchange={(e) => listeUmschalten(liste, e.currentTarget.checked)}
							/>
							<span class="em" aria-hidden="true">{liste.icon}</span>
							<span class="name">{liste.title}</span>
						</label>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</main>

<ToastContainer />
