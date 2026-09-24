/**
 * Demodaten der Vorschau-Route `/vorschau` — Inhalte aus dem freigegebenen
 * Mockup A „Klar" (`projects/taskfuchs-redesign/mockups/A-klar.html`).
 *
 * Kein Supabase, kein Login, kein Schreibzugriff auf die Produktivdatenbank.
 * Die Zeilen haben exakt die Form von `Database['public']['Tables'][…]['Row']`,
 * damit die Vorschau DIESELBEN Komponenten mountet wie `/app` — es gibt keine
 * zweite Datenform und keinen zweiten Satz Typen.
 *
 * Faelligkeiten sind relativ zum heutigen Tag erzeugt: „heute 12:00",
 * „ueberfaellig" und die Wochentage stimmen damit an jedem Tag, an dem
 * jemand die Vorschau oeffnet. Im Mockup sind es feste Daten vom 22.09.2026.
 *
 * Benutzer-IDs sind bewusst KEINE UUIDs: in der Oberflaeche darf keine
 * erscheinen (Spezifikation Abschnitt 9), und das Abnahmeskript prueft darauf.
 * `haushalt` und `ingo` sind zusaetzlich so gewaehlt, dass die Streuung in
 * `utils/mitnutzer.ts` genau die beiden Farben der Spezifikation trifft:
 * `--avatar-a` (#4f7c9b) fuer Haushalt, `--avatar-b` (#6f8f5a) fuer Ingo.
 */
import type { Database } from '$lib/types/database';

type List = Database['public']['Tables']['lists']['Row'];
type Task = Database['public']['Tables']['tasks']['Row'];
type ListShare = Database['public']['Tables']['list_shares']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'];

export const DEMO_ICH = { id: 'frank', email: 'frank@moll.family' };

const JETZT = new Date().toISOString();
/** Aelter als jeder „gesehen"-Stand — diese Zeilen tragen keinen neu-Marker. */
const FRUEHER = new Date(Date.now() - 30 * 86400000).toISOString();

/**
 * Faelligkeit relativ zu heute. Ohne Uhrzeit entsteht eine reine
 * Datumsangabe (`2026-09-23`), die `utils/datum.ts` als lokalen Tag liest.
 */
function tag(versatz: number, uhrzeit?: string): string {
	const d = new Date();
	d.setDate(d.getDate() + versatz);
	const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	return uhrzeit ? `${iso}T${uhrzeit}:00` : iso;
}

export const DEMO_PROFILE: Profile[] = [
	{ id: 'frank', username: 'frank', display_name: 'Frank', avatar_url: null, created_at: FRUEHER, updated_at: FRUEHER },
	{ id: 'haushalt', username: 'haushalt', display_name: 'Haushalt', avatar_url: null, created_at: FRUEHER, updated_at: FRUEHER },
	{ id: 'ingo', username: 'ingo', display_name: 'Ingo', avatar_url: null, created_at: FRUEHER, updated_at: FRUEHER }
];

function liste(id: string, title: string, icon: string, position: number): List {
	return {
		id,
		user_id: DEMO_ICH.id,
		title,
		icon,
		position,
		visible: true,
		created_at: FRUEHER,
		updated_at: FRUEHER,
		version: 1
	};
}

export const DEMO_LISTEN: List[] = [
	liste('l-privat', 'Privat', '🏠', 0),
	liste('l-moll', 'Moll GmbH', '💼', 1),
	liste('l-homelab', 'Homelab', '🖥️', 2),
	liste('l-familie', 'Familie', '❤️', 3),
	liste('l-einkaufen', 'Einkaufen', '🌱', 4),
	liste('l-garten', 'Garten', '🌍', 5),
	liste('l-pflege', 'Pflege', '🩺', 6)
];

/** Freigaben wie im Mockup: Familie mit Haushalt und Ingo, Einkaufen mit Haushalt. */
export const DEMO_FREIGABEN: ListShare[] = [
	{ id: 'sh-familie-haushalt', list_id: 'l-familie', user_id: 'haushalt', role: 'editor', created_at: FRUEHER },
	{ id: 'sh-familie-ingo', list_id: 'l-familie', user_id: 'ingo', role: 'editor', created_at: FRUEHER },
	{ id: 'sh-einkaufen-haushalt', list_id: 'l-einkaufen', user_id: 'haushalt', role: 'editor', created_at: FRUEHER }
];

/** Eine Zeile mit den Vorgaben der Tabelle — nur Abweichungen werden genannt. */
type Abweichung = Partial<Task> & { id: string; list_id: string; text: string };

function aufgabe(a: Abweichung): Task {
	return {
		id: a.id,
		list_id: a.list_id,
		user_id: a.user_id ?? DEMO_ICH.id,
		text: a.text,
		done: a.done ?? false,
		priority: a.priority ?? 'normal',
		timeframe: a.timeframe ?? null,
		highlighted: false,
		pinned: a.pinned ?? false,
		pinned_by: a.pinned_by ?? null,
		emoji: a.emoji ?? null,
		note: a.note ?? null,
		due_date: a.due_date ?? null,
		position: a.position ?? 0,
		type: 'task',
		divider_label: null,
		parent_id: a.parent_id ?? null,
		assigned_to: null,
		calendar_event_id: null,
		created_at: a.created_at ?? FRUEHER,
		updated_at: a.created_at ?? FRUEHER,
		version: 1
	};
}

/** Die acht erledigten Aufgaben der Liste „Familie" (Frame 1: „Erledigt 8"). */
const FAMILIE_ERLEDIGT = [
	'Müll rausbringen',
	'Impftermin absagen',
	'Paket abholen',
	'Schulbücher einbinden',
	'Zahnspange abholen',
	'Sportbeutel waschen',
	'Geburtstagskarte schreiben',
	'Hecke schneiden'
].map((text, i) =>
	aufgabe({ id: `t-fam-done-${i}`, list_id: 'l-familie', text, done: true, position: 100 + i })
);

export const DEMO_AUFGABEN: Task[] = [
	// ── Familie — die Liste aller drei Desktop-Frames ────────────────────
	aufgabe({
		id: 't-krank',
		list_id: 'l-familie',
		text: 'Krankmeldung für Lena in der Schule abgeben',
		priority: 'asap',
		timeframe: 'akut',
		due_date: tag(0, '12:00'),
		position: 0
	}),
	aufgabe({
		id: 't-kinderarzt',
		list_id: 'l-familie',
		text: 'Kinderarzt-Termin ausmachen',
		priority: 'high',
		timeframe: 'zeitnah',
		due_date: tag(3, '09:00'),
		note: 'U9-Vorsorge ist fällig. Praxis Dr. Weber, Sprechstunde Mo–Fr ab 8 Uhr, Impfpass mitnehmen.',
		pinned: true,
		pinned_by: 'haushalt',
		position: 1
	}),
	aufgabe({ id: 't-kinderarzt-s1', list_id: 'l-familie', parent_id: 't-kinderarzt', text: 'Praxis Dr. Weber anrufen', done: true, position: 0 }),
	aufgabe({ id: 't-kinderarzt-s2', list_id: 'l-familie', parent_id: 't-kinderarzt', text: 'Termin in den Familienkalender', position: 1 }),
	aufgabe({
		id: 't-nordsee',
		list_id: 'l-familie',
		text: 'Ferienwohnung Nordsee buchen',
		timeframe: 'mittelfristig',
		position: 2
	}),
	aufgabe({ id: 't-nordsee-s1', list_id: 'l-familie', parent_id: 't-nordsee', text: 'Termin mit Haushalt abstimmen', done: true, position: 0 }),
	aufgabe({ id: 't-nordsee-s2', list_id: 'l-familie', parent_id: 't-nordsee', text: 'Unterkünfte in St. Peter-Ording vergleichen', done: true, position: 1 }),
	aufgabe({ id: 't-nordsee-s3', list_id: 'l-familie', parent_id: 't-nordsee', text: 'Anfrage an Vermieter senden', position: 2 }),
	aufgabe({ id: 't-nordsee-s4', list_id: 'l-familie', parent_id: 't-nordsee', text: 'Anzahlung überweisen', position: 3 }),
	aufgabe({
		id: 't-elternabend',
		list_id: 'l-familie',
		text: 'Elternabend vorbereiten',
		due_date: tag(-6),
		note: 'Fragen zur Klassenfahrt mitnehmen, Elternvertreter-Wahl steht an',
		position: 3
	}),
	// Von aussen angekommen: fremder Ersteller und frisch angelegt — daraus
	// entstehen die warme Flaeche, der Chip „neu" und „von Ingo · gerade eben".
	aufgabe({
		id: 't-gluehbirnen',
		list_id: 'l-familie',
		text: 'Glühbirnen Flur',
		user_id: 'ingo',
		created_at: JETZT,
		position: 4
	}),
	aufgabe({ id: 't-oma', list_id: 'l-familie', text: 'Geschenk für Oma', priority: 'low', position: 5 }),
	aufgabe({
		id: 't-fotobuch',
		list_id: 'l-familie',
		text: 'Fotobuch 2025 bestellen',
		priority: 'low',
		timeframe: 'langfristig',
		note: 'Bilder vom Sommerurlaub sind noch auf der Kamera.',
		position: 6
	}),
	aufgabe({ id: 't-fotobuch-s1', list_id: 'l-familie', parent_id: 't-fotobuch', text: 'Bilder aussortieren', position: 0 }),
	aufgabe({ id: 't-fotobuch-s2', list_id: 'l-familie', parent_id: 't-fotobuch', text: 'Anbieter vergleichen', position: 1 }),
	...FAMILIE_ERLEDIGT,

	// ── Privat — die Liste der Mobile-Frames ─────────────────────────────
	aufgabe({
		id: 't-steuer',
		list_id: 'l-privat',
		text: 'Steuererklärung 2025',
		priority: 'high',
		timeframe: 'zeitnah',
		due_date: tag(38, '09:00'),
		note: 'Spendenquittungen liegen im Ordner „Steuer 2025“ auf dem NAS. Werbungskosten: Homeoffice-Pauschale nicht vergessen.',
		position: 0
	}),
	aufgabe({ id: 't-steuer-s1', list_id: 'l-privat', parent_id: 't-steuer', text: 'Belege sammeln', done: true, position: 0 }),
	aufgabe({ id: 't-steuer-s2', list_id: 'l-privat', parent_id: 't-steuer', text: 'ELSTER-Zertifikat erneuern', position: 1 }),
	aufgabe({ id: 't-steuer-s3', list_id: 'l-privat', parent_id: 't-steuer', text: 'Anlage N und V ausfüllen', position: 2 }),
	aufgabe({ id: 't-reifen', list_id: 'l-privat', text: 'Reifen wechseln', position: 1 }),
	aufgabe({ id: 't-zahnarzt', list_id: 'l-privat', text: 'Zahnarzt-Kontrolle', due_date: tag(1, '10:30'), position: 2 }),
	aufgabe({
		id: 't-versicherung',
		list_id: 'l-privat',
		text: 'Versicherungen vergleichen',
		note: 'Haftpflicht läuft im November aus, Angebote von zwei Anbietern einholen und vergleichen.',
		position: 3
	}),
	aufgabe({ id: 't-keller', list_id: 'l-privat', text: 'Keller ausmisten', priority: 'low', position: 4 }),
	aufgabe({ id: 't-fahrrad', list_id: 'l-privat', text: 'Fahrrad-Inspektion buchen', priority: 'low', position: 5 }),

	// ── Moll GmbH ────────────────────────────────────────────────────────
	aufgabe({
		id: 't-jahresabschluss',
		list_id: 'l-moll',
		text: 'Jahresabschluss an die Kanzlei',
		priority: 'high',
		timeframe: 'zeitnah',
		due_date: tag(8),
		// Traegt den Notiz-Treffer des Such-Frames („Notiz: „… ELSTER-Login
		// liegt im Passwortmanager"").
		note: 'Kontoauszüge Q4 fehlen noch, der ELSTER-Login liegt im Passwortmanager.',
		pinned: true,
		position: 0
	}),
	aufgabe({
		id: 't-elster-vollmacht',
		list_id: 'l-moll',
		text: 'Elster-Vollmacht für den Steuerberater verlängern',
		priority: 'low',
		timeframe: 'langfristig',
		position: 1
	}),
	aufgabe({
		id: 't-fotoarchiv',
		list_id: 'l-moll',
		text: 'Übergabefotos DHH 3 als Fotobuch archivieren',
		priority: 'low',
		note: 'Ordner „Übergaben 2026“ auf dem NAS, Haus 1 bis 3 zusammenlegen.',
		position: 2
	}),
	aufgabe({
		id: 't-nebenkosten',
		list_id: 'l-moll',
		text: 'Nebenkostenabrechnung DHH Sassenberg',
		due_date: tag(7),
		note: 'Zählerstände Haus 2 fehlen noch.',
		position: 3
	}),
	aufgabe({ id: 't-moll-versicherung', list_id: 'l-moll', text: 'Gebäudeversicherung prüfen', timeframe: 'mittelfristig', position: 4 }),
	aufgabe({
		id: 't-elster-2024',
		list_id: 'l-moll',
		text: 'Steuererklärung 2024 in ELSTER abgeben',
		done: true,
		position: 5
	}),

	// ── Homelab ──────────────────────────────────────────────────────────
	aufgabe({
		id: 't-backup',
		list_id: 'l-homelab',
		text: 'Backup-Platte tauschen',
		priority: 'asap',
		timeframe: 'akut',
		due_date: tag(0, '18:00'),
		pinned: true,
		position: 0
	}),
	aufgabe({ id: 't-backup-s1', list_id: 'l-homelab', parent_id: 't-backup', text: 'Alte Platte auslesen', done: true, position: 0 }),
	aufgabe({ id: 't-backup-s2', list_id: 'l-homelab', parent_id: 't-backup', text: 'Neue Platte formatieren', position: 1 }),
	aufgabe({ id: 't-backup-s3', list_id: 'l-homelab', parent_id: 't-backup', text: 'Erstlauf prüfen', position: 2 }),
	aufgabe({ id: 't-fotoarchiv-nas', list_id: 'l-homelab', text: 'Fotobuch-Ordner auf das NAS spiegeln', priority: 'low', position: 1 }),
	aufgabe({ id: 't-homelab-2', list_id: 'l-homelab', text: 'Pi-hole-Listen aktualisieren', priority: 'low', position: 2 }),
	aufgabe({ id: 't-homelab-3', list_id: 'l-homelab', text: 'Zertifikate erneuern', timeframe: 'mittelfristig', position: 3 }),
	aufgabe({ id: 't-homelab-4', list_id: 'l-homelab', text: 'Router-Firmware prüfen', priority: 'low', position: 4 }),

	// ── Einkaufen — Kategorie mit Eintraegen (Checkliste Punkt 5) ────────
	aufgabe({
		id: 't-grundnahrung',
		list_id: 'l-einkaufen',
		text: 'Grundnahrung',
		pinned: true,
		pinned_by: 'ingo',
		position: 0
	}),
	aufgabe({ id: 't-grund-s1', list_id: 'l-einkaufen', parent_id: 't-grundnahrung', text: 'Brot', position: 0 }),
	aufgabe({ id: 't-grund-s2', list_id: 'l-einkaufen', parent_id: 't-grundnahrung', text: 'Hafermilch', position: 1 }),
	aufgabe({ id: 't-grund-s3', list_id: 'l-einkaufen', parent_id: 't-grundnahrung', text: 'Eier', position: 2 }),
	// Eine Einkaufsliste ist die laengste Liste im Bestand — ohne sie sieht die
	// Navigationsspalte in der Vorschau leerer aus, als TaskFuchs je ist.
	...[
		'Zwiebeln', 'Kartoffeln', 'Butter', 'Käse', 'Kaffeebohnen', 'Olivenöl', 'Nudeln',
		'Passierte Tomaten', 'Spülmaschinentabs', 'Waschmittel', 'Klopapier', 'Zahnpasta',
		'Katzenfutter', 'Apfelsaft', 'Schokolade'
	].map((text, i) => aufgabe({ id: `t-eink-${i}`, list_id: 'l-einkaufen', text, position: 1 + i })),

	// ── Garten und Pflege ────────────────────────────────────────────────
	aufgabe({ id: 't-garten-1', list_id: 'l-garten', text: 'Hochbeet auffüllen', priority: 'low', position: 0 }),
	aufgabe({ id: 't-garten-2', list_id: 'l-garten', text: 'Rasenmäher warten', position: 1 }),
	aufgabe({ id: 't-garten-3', list_id: 'l-garten', text: 'Zaun streichen', priority: 'low', timeframe: 'langfristig', position: 2 }),
	aufgabe({ id: 't-pflege-1', list_id: 'l-pflege', text: 'Pflegegrad-Antrag nachreichen', timeframe: 'zeitnah', due_date: tag(12), position: 0 })
];

/**
 * Liste, die beim Start als „schon einmal gesehen" gilt. Nur dann traegt
 * „Glühbirnen Flur" den neu-Marker: `tasks.svelte.ts` vergibt ihn fuer fremde
 * Zeilen, die NACH dem letzten Besuch der Liste entstanden sind — eine nie
 * besuchte Liste bleibt bewusst ganz ohne Marker.
 */
export const DEMO_GESEHEN: Record<string, number> = {
	'l-familie': Date.now() - 3600_000
};
