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
		DEMO_PROFILE,
		DEMO_VERLAUF
	} from '$lib/demo/fixtures';
	import { baueMitnutzer } from '$lib/utils/mitnutzer';
	import type { MobileTab } from '$lib/stores/tf/navigation.svelte';
	import type { Database } from '$lib/types/database';

	type ListShare = Database['public']['Tables']['list_shares']['Row'];

	/**
	 * Inhalt der Vorschau-Route — dieselbe Shell, dieselben Komponenten,
	 * Demodaten.
	 *
	 * Dieses Bauteil ist ein Abnahme- und Vorfuehrartefakt, kein Teil der
	 * App. Es fasst die Produktivdatenbank nicht an — der Store spricht mit
	 * einer Attrappe im Arbeitsspeicher (`lib/demo/supabase-attrappe.ts`),
	 * die beim Neuladen wieder im Ausgangszustand steht.
	 *
	 * **Warum es hier liegt und nicht in `routes/vorschau/+page.svelte`:**
	 * die Seite dort laedt es nur im Dev-Modus nach. Statisch importiert
	 * haengte der ganze Demobestand — sieben Listen, alle Aufgaben, alle
	 * Profile — als oeffentlich abrufbarer Chunk im Produktionsbuendel.
	 *
	 * Die Abfrageparameter sind die Namen aus Task 12 des Plans; das
	 * Abnahmeskript `abnahme/shot.mjs` faehrt genau sie an:
	 *
	 *   liste=<id> · task=<id> · tab=listen|pins|suche · offen=1 · dunkel=1
	 *   teilen=1 · menu=<task-id> · listenmenu=1 · neueliste=1 · suche=<begriff>
	 *   quickadd=<text> · toast=geloescht|erledigt · confirm=liste
	 *
	 * Dazu `rolle=betrachter` (Aufgabenhistorie): die Liste „Familie" gehoert
	 * dann Haushalt, Frank ist dort nur Betrachter. Kein gestellter Zustand,
	 * sondern andere Daten — die Oberflaeche leitet „nur lesen" auf demselben
	 * Weg ab wie in /app (Freigaberolle ueber `baueMitnutzer`). Aufgaben, die
	 * Frank dort angelegt hat, gehen an Haushalt ueber: als Ersteller duerfte
	 * er sie sonst weiter bearbeiten.
	 */
	const FAMILIE = 'l-familie';
	const alsBetrachter = page.url.searchParams.get('rolle') === 'betrachter';

	const listen = alsBetrachter
		? DEMO_LISTEN.map((l) => (l.id === FAMILIE ? { ...l, user_id: 'haushalt' } : l))
		: DEMO_LISTEN;
	const aufgaben = alsBetrachter
		? DEMO_AUFGABEN.map((t) =>
				t.list_id === FAMILIE && t.user_id === DEMO_ICH.id ? { ...t, user_id: 'haushalt' } : t
			)
		: DEMO_AUFGABEN;
	const freigaben: ListShare[] = alsBetrachter
		? [
				...DEMO_FREIGABEN.filter((f) => !(f.list_id === FAMILIE && f.user_id === 'haushalt')),
				{
					id: 'sh-familie-frank',
					list_id: FAMILIE,
					user_id: DEMO_ICH.id,
					role: 'viewer',
					created_at: DEMO_FREIGABEN[0].created_at
				}
			]
		: DEMO_FREIGABEN;

	const attrappe = baueAttrappe(
		{
			lists: listen,
			tasks: aufgaben,
			list_shares: freigaben,
			profiles: DEMO_PROFILE,
			task_history: DEMO_VERLAUF
		},
		DEMO_ICH.id
	);

	const mitnutzer = baueMitnutzer(listen, freigaben, DEMO_PROFILE, DEMO_ICH.id, DEMO_ICH.email);

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
			// Liste Familie (Frames 1, 2, 3, 10). Steht hier fest, weil das
			// Abnahmeskript dafuer keinen Parameter kennt. „Grundnahrung" aus
			// Frame 9 ist seit dem Einkaufs-Modus eine Kategorie der
			// Einkaufsliste — die Pinnwand zeigt keine Einkaufslisten-Zeilen.
			aufklappen: ['t-nordsee']
		};
	});
</script>

<TfRoot>
	<AppShell
		supabase={attrappe}
		benutzerId={DEMO_ICH.id}
		benutzerEmail={DEMO_ICH.email}
		startListen={listen}
		startAufgaben={aufgaben}
		startMitnutzer={mitnutzer}
		onLogout={() => {}}
		vorschau={zustand}
	/>
</TfRoot>
