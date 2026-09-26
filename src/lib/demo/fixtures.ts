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
import type { Database, ListKind } from '$lib/types/database';

type List = Database['public']['Tables']['lists']['Row'];
type Task = Database['public']['Tables']['tasks']['Row'];
type ListShare = Database['public']['Tables']['list_shares']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'];
type Verlaufseintrag = Database['public']['Tables']['task_history']['Row'];

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

/**
 * Zeitpunkt vor so vielen Minuten — relativ wie die Faelligkeiten. Steht
 * hier oben, weil schon `DEMO_AUFGABEN` es braucht (Einkaufsliste), nicht
 * erst die Aufgabenhistorie.
 */
function vor(minuten: number): string {
	return new Date(Date.now() - minuten * 60_000).toISOString();
}
const STUNDE = 60;
const TAG = 24 * STUNDE;

export const DEMO_PROFILE: Profile[] = [
	{ id: 'frank', username: 'frank', display_name: 'Frank', avatar_url: null, created_at: FRUEHER, updated_at: FRUEHER },
	{ id: 'haushalt', username: 'haushalt', display_name: 'Haushalt', avatar_url: null, created_at: FRUEHER, updated_at: FRUEHER },
	{ id: 'ingo', username: 'ingo', display_name: 'Ingo', avatar_url: null, created_at: FRUEHER, updated_at: FRUEHER }
];

function liste(id: string, title: string, icon: string, position: number, kind: ListKind = 'aufgaben'): List {
	return {
		id,
		user_id: DEMO_ICH.id,
		title,
		icon,
		position,
		visible: true,
		kind,
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
	liste('l-einkaufen', 'Einkaufen', '🌱', 4, 'einkauf'),
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
		type: a.type ?? 'task',
		divider_label: null,
		parent_id: a.parent_id ?? null,
		assigned_to: null,
		calendar_event_id: null,
		abgelegt: a.abgelegt ?? false,
		created_at: a.created_at ?? FRUEHER,
		updated_at: a.updated_at ?? a.created_at ?? FRUEHER,
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

// ── Einkaufsliste ────────────────────────────────────────────────────
const EINKAUFEN = 'l-einkaufen';

/** Kategorie der Einkaufsliste: ein Trenner der obersten Ebene. */
function kategorie(id: string, text: string, position: number): Task {
	return aufgabe({ id, list_id: EINKAUFEN, text, type: 'divider', position });
}

/** Laufende Minute je abgehaktem Artikel — keine zwei Chips mit demselben Zeitpunkt. */
let kassenzettel = 0;

/**
 * Die Artikel einer Kategorie in ihren drei Zustaenden. `gekauft` nennt je
 * Artikel, vor wie vielen Tagen er abgelegt wurde: daraus wird `updated_at`,
 * nach dem die Chips „Zuletzt gekauft" ordnen (neueste zuerst).
 */
function artikel(
	kategorieId: string,
	z: { offen?: string[]; wagen?: string[]; gekauft?: [string, number][] }
): Task[] {
	let position = 0;
	const zeile = (text: string, felder: Partial<Task>) =>
		aufgabe({
			id: `${kategorieId}-${position}`,
			list_id: EINKAUFEN,
			parent_id: kategorieId,
			text,
			position: position++,
			...felder
		});
	return [
		...(z.offen ?? []).map((text) => zeile(text, {})),
		// Eben in den Wagen gelegt: nach „Einkauf fertig" die neuesten Chips.
		...(z.wagen ?? []).map((text) => zeile(text, { done: true, updated_at: vor(15 + kassenzettel++) })),
		...(z.gekauft ?? []).map(([text, tage]) =>
			zeile(text, { done: true, abgelegt: true, updated_at: vor(tage * TAG + kassenzettel++) })
		)
	];
}

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

	// ── Einkaufen — Einkaufsliste (Einkaufs-Modus) ───────────────────────
	// Jeder Zustand der Oberflaeche kommt vor: offene Artikel, Artikel im
	// Wagen, „Zuletzt gekauft"-Chips; „Kühlabteilung" mit mehr als acht Chips
	// („+ N weitere"), „Snacks" leer (eingeklappt), „Getränke" nur mit Chips.
	// Die fruehere Kategorie-Aufgabe „Grundnahrung" ist jetzt ein Trenner.
	kategorie('t-ek-gemuese', 'Gemüse', 0),
	...artikel('t-ek-gemuese', {
		offen: ['Tomaten', 'Gurke'],
		gekauft: [['Bananen', 2], ['Zwiebeln', 2], ['Kartoffeln', 6], ['Paprika', 9]]
	}),
	kategorie('t-grundnahrung', 'Grundnahrung', 1),
	...artikel('t-grundnahrung', {
		offen: ['Haferflocken'],
		wagen: ['Brot'],
		gekauft: [['Nudeln', 6], ['Olivenöl', 13], ['Kaffeebohnen', 13]]
	}),
	kategorie('t-ek-kuehl', 'Kühlabteilung', 2),
	...artikel('t-ek-kuehl', {
		offen: ['Milch', 'Joghurt'],
		wagen: ['Eier'],
		gekauft: [
			['Butter', 2], ['Käse', 2], ['Hafermilch', 2], ['Quark', 6], ['Sahne', 6],
			['Frischkäse', 6], ['Mozzarella', 9], ['Schinken', 9], ['Feta', 13], ['Schmand', 13]
		]
	}),
	kategorie('t-ek-getraenke', 'Getränke', 3),
	...artikel('t-ek-getraenke', { gekauft: [['Sprudel', 2], ['Apfelsaft', 6]] }),
	kategorie('t-ek-snacks', 'Snacks', 4),
	kategorie('t-ek-sonstiges', 'Sonstiges', 5),
	...artikel('t-ek-sonstiges', {
		offen: ['Batterien'],
		gekauft: [['Spülmaschinentabs', 6], ['Klopapier', 9], ['Katzenfutter', 13]]
	}),
	// Wie von n8n/Telegram angelegt: oberste Ebene, ohne Kategorie. Beim
	// Oeffnen sortiert die Oberflaeche sie ein — keine Regel passt, also
	// nach „Sonstiges" (angelegt wird dabei nie etwas).
	aufgabe({ id: 't-ek-grillkohle', list_id: EINKAUFEN, text: 'Grillkohle', position: 6 }),

	// ── Garten und Pflege ────────────────────────────────────────────────
	aufgabe({ id: 't-garten-1', list_id: 'l-garten', text: 'Hochbeet auffüllen', priority: 'low', position: 0 }),
	aufgabe({ id: 't-garten-2', list_id: 'l-garten', text: 'Rasenmäher warten', position: 1 }),
	aufgabe({ id: 't-garten-3', list_id: 'l-garten', text: 'Zaun streichen', priority: 'low', timeframe: 'langfristig', position: 2 }),
	aufgabe({ id: 't-pflege-1', list_id: 'l-pflege', text: 'Pflegegrad-Antrag nachreichen', timeframe: 'zeitnah', due_date: tag(12), position: 0 })
];

// ── Aufgabenhistorie ─────────────────────────────────────────────────
type VerlaufAbweichung = Partial<Verlaufseintrag> &
	Pick<Verlaufseintrag, 'id' | 'task_id' | 'kind' | 'body' | 'created_by' | 'created_at'>;

function eintrag(e: VerlaufAbweichung): Verlaufseintrag {
	return { edited_at: null, edited_by: null, resolved_at: null, resolved_by: null, ...e };
}

/**
 * Beispiel-Eintraege der Aufgabenhistorie (Spezifikation: mindestens eine
 * Aufgabe mit offenem Warte-Eintrag, eine mit eingeloestem, eine mit
 * Stand-Eintraegen von zwei Personen). Gewaehlt sind Aufgaben, die die
 * Abnahme-Frames ohnehin zeigen:
 * - „Ferienwohnung Nordsee" (Familie, geteilt): Stand von Frank und
 *   Haushalt, offener Warte-Eintrag von Ingo — Sanduhr in Frame 1
 * - „Kinderarzt-Termin" (Detail in Frame 1): eingeloester Warte-Eintrag,
 *   bearbeiteter Stand
 * - „Steuererklaerung 2025" (Mobile-Frames): offener Warte-Eintrag
 * - „Jahresabschluss" (Pinnwand): zwei offene — „und 1 weitere"
 * - „Backup-Platte": ein aus `tasks.progress` uebernommener Stand, so wie
 *   Migration 023 ihn schreibt
 */
export const DEMO_VERLAUF: Verlaufseintrag[] = [
	eintrag({
		id: 'h-nordsee-1',
		task_id: 't-nordsee',
		kind: 'stand',
		body: 'Drei Unterkünfte in St. Peter-Ording in der engeren Wahl, alle mit Hund.',
		created_by: 'frank',
		created_at: vor(4 * TAG + 2 * STUNDE)
	}),
	eintrag({
		id: 'h-nordsee-2',
		task_id: 't-nordsee',
		kind: 'stand',
		body: 'Herbstferien 12.–19.10. passen allen.',
		created_by: 'haushalt',
		created_at: vor(2 * TAG + 5 * STUNDE)
	}),
	eintrag({
		id: 'h-nordsee-3',
		task_id: 't-nordsee',
		kind: 'wartet',
		body: 'Rückmeldung vom Vermieter zur Verfügbarkeit',
		created_by: 'ingo',
		created_at: vor(TAG + 2 * STUNDE)
	}),
	eintrag({
		id: 'h-kinderarzt-1',
		task_id: 't-kinderarzt',
		kind: 'wartet',
		body: 'Rückruf der Praxis Dr. Weber',
		created_by: 'haushalt',
		created_at: vor(3 * TAG),
		resolved_at: vor(TAG + 3 * STUNDE),
		resolved_by: 'frank'
	}),
	eintrag({
		id: 'h-kinderarzt-2',
		task_id: 't-kinderarzt',
		kind: 'stand',
		body: 'Praxis meldet sich, sobald der Oktober-Kalender steht.\nImpfpass liegt im Flurschrank.',
		created_by: 'frank',
		created_at: vor(3 * TAG - STUNDE),
		edited_at: vor(3 * TAG - STUNDE - 10),
		edited_by: 'haushalt'
	}),
	eintrag({
		id: 'h-steuer-1',
		task_id: 't-steuer',
		kind: 'stand',
		body: 'Belege 2025 vollständig eingescannt.',
		created_by: 'frank',
		created_at: vor(6 * TAG)
	}),
	eintrag({
		id: 'h-steuer-2',
		task_id: 't-steuer',
		kind: 'wartet',
		body: 'Lohnsteuerbescheinigung vom Arbeitgeber',
		created_by: 'frank',
		created_at: vor(5 * TAG)
	}),
	eintrag({
		id: 'h-abschluss-1',
		task_id: 't-jahresabschluss',
		kind: 'wartet',
		body: 'Kontoauszüge Q4 von der Bank',
		created_by: 'frank',
		created_at: vor(9 * TAG)
	}),
	eintrag({
		id: 'h-abschluss-2',
		task_id: 't-jahresabschluss',
		kind: 'wartet',
		body: 'Rückfrage der Kanzlei zu den Reisekosten',
		created_by: 'frank',
		created_at: vor(3 * STUNDE)
	}),
	eintrag({
		id: 'h-backup-1',
		task_id: 't-backup',
		kind: 'stand',
		body: 'Fortschritt vor der Umstellung: Fast fertig (66 %)',
		created_by: 'frank',
		created_at: vor(12 * TAG)
	})
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
