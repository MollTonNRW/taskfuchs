<script lang="ts">
	import { page } from '$app/state';
	import TfRoot from '$lib/components/tf/TfRoot.svelte';
	import AppShell, { type VorschauZustand } from '$lib/components/tf/AppShell.svelte';
	import { baueAttrappe } from '$lib/demo/supabase-attrappe';
	import {
		DEMO_AUFGABEN,
		DEMO_FREIGABEN,
		DEMO_GESEHEN,
		DEMO_ICH,
		DEMO_LISTEN,
		DEMO_PROFILE
	} from '$lib/demo/fixtures';
	import { baueMitnutzer } from '$lib/utils/mitnutzer';
	import type { MobileTab } from '$lib/stores/tf/navigation.svelte';

	/**
	 * Vorschau-Route — dieselbe Shell, dieselben Komponenten, Demodaten.
	 *
	 * Diese Seite ist ein Abnahme- und Vorfuehrartefakt, kein Teil der App:
	 * `+page.ts` wirft ausserhalb des Dev-Modus `error(404)`. Sie fasst die
	 * Produktivdatenbank nicht an — der Store spricht mit einer Attrappe im
	 * Arbeitsspeicher (`lib/demo/supabase-attrappe.ts`), die beim Neuladen
	 * wieder im Ausgangszustand steht.
	 *
	 * Die Abfrageparameter sind die Namen aus Task 12 des Plans; das
	 * Abnahmeskript `abnahme/shot.mjs` faehrt genau sie an:
	 *
	 *   liste=<id> · task=<id> · tab=listen|pins|suche · offen=1 · dunkel=1
	 *   teilen=1 · menu=<task-id> · listenmenu=1 · neueliste=1 · suche=<begriff>
	 *   quickadd=<text> · toast=geloescht|erledigt · confirm=liste
	 */

	const attrappe = baueAttrappe({
		lists: DEMO_LISTEN,
		tasks: DEMO_AUFGABEN,
		list_shares: DEMO_FREIGABEN,
		profiles: DEMO_PROFILE
	});

	const mitnutzer = baueMitnutzer(
		DEMO_LISTEN,
		DEMO_FREIGABEN,
		DEMO_PROFILE,
		DEMO_ICH.id,
		DEMO_ICH.email
	);

	/**
	 * Den neu-Marker vorbereiten: `tasks.svelte.ts` vergibt ihn nur fuer
	 * fremde Zeilen, die NACH dem letzten Besuch der Liste entstanden sind.
	 * Ohne diesen Merkzettel traege „Gluehbirnen Flur" keinen Chip und Frame 1
	 * waere unvollstaendig. Die Vorschau setzt ausserdem Theme und Auswahl
	 * zurueck, damit jeder Aufruf denselben Ausgangszustand hat — sonst
	 * uebernaehmen die Reste eines vorigen Besuchs die naechste Aufnahme.
	 */
	if (typeof localStorage !== 'undefined') {
		try {
			localStorage.setItem('tf-gesehen', JSON.stringify(DEMO_GESEHEN));
			localStorage.removeItem('tf-active-list');
			localStorage.setItem('tf-dark', 'false');
		} catch {
			/* privater Modus — dann fehlt nur der neu-Marker */
		}
	}

	const gueltigeTabs = ['listen', 'pins', 'suche'];

	let zustand = $derived.by<VorschauZustand>(() => {
		const p = page.url.searchParams;
		const tab = p.get('tab');
		const toast = p.get('toast');
		return {
			liste: p.get('liste') ?? undefined,
			task: p.get('task') ?? undefined,
			tab: tab && gueltigeTabs.includes(tab) ? (tab as MobileTab) : undefined,
			offen: p.get('offen') === '1',
			dunkel: p.get('dunkel') === '1',
			teilen: p.get('teilen') === '1',
			menu: p.get('menu') ?? undefined,
			listenmenu: p.get('listenmenu') === '1',
			neueliste: p.get('neueliste') === '1',
			suche: p.get('suche') ?? undefined,
			quickadd: p.get('quickadd') ?? undefined,
			toast: toast === 'geloescht' || toast === 'erledigt' ? toast : undefined,
			confirm: p.get('confirm') === 'liste' ? 'liste' : undefined,
			// Unteraufgaben starten eingeklappt. Das Mockup zeigt je Ansicht
			// genau eine ausgeklappte Aufgabe: „Ferienwohnung Nordsee" in der
			// Liste Familie (Frames 1, 2, 3, 10) und „Grundnahrung" auf der
			// Pinnwand (Frame 9). Beide stehen hier fest, weil das
			// Abnahmeskript dafuer keinen Parameter kennt.
			aufklappen: ['t-nordsee', 't-grundnahrung']
		};
	});
</script>

<svelte:head>
	<title>TaskFuchs — Vorschau A „Klar“</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<TfRoot>
	<AppShell
		supabase={attrappe}
		benutzerId={DEMO_ICH.id}
		benutzerEmail={DEMO_ICH.email}
		startListen={DEMO_LISTEN}
		startAufgaben={DEMO_AUFGABEN}
		startMitnutzer={mitnutzer}
		onLogout={() => {}}
		vorschau={zustand}
	/>
</TfRoot>
