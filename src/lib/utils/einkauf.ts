/**
 * Einkaufs-Modus — reine Logik ohne Store und ohne Datenbank.
 *
 * Spezifikation: docs/superpowers/specs/2026-09-26-einkaufsmodus-design.md
 * Kategorie = Trenner-Zeile (type 'divider', oberste Ebene), Artikel = ihre
 * Unteraufgabe. Zustand eines Artikels aus `done` und `abgelegt`:
 * offen -> im Wagen (abgehakt) -> zuletzt gekauft (abgelegt, nur als Chip).
 */

export type ArtikelZustand = 'offen' | 'wagen' | 'abgelegt';

export function artikelZustand(t: { done: boolean; abgelegt?: boolean | null }): ArtikelZustand {
	if (!t.done) return 'offen';
	return t.abgelegt ? 'abgelegt' : 'wagen';
}

const EINHEIT =
	'(?:x|stk|stueck|g|gr|kg|l|ltr|ml|pck|pack|packung(?:en)?|dosen?|flaschen?|netz|becher|glas|glaeser|bund|beutel|tuete)';
const MENGE = new RegExp(`\\b\\d+(?:[.,]\\d+)?\\s*${EINHEIT}?(?=\\s|$)`, 'g');

/** Vergleichsform eines Artikel- oder Kategorienamens. */
export function normalisiere(text: string): string {
	return text
		.toLowerCase()
		.replace(/×/g, 'x')
		.replace(/ä/g, 'ae')
		.replace(/ö/g, 'oe')
		.replace(/ü/g, 'ue')
		.replace(/ß/g, 'ss')
		.replace(/\(.*?\)/g, ' ')
		.replace(/[^a-z0-9 ]+/g, ' ')
		.replace(MENGE, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

export type KategorieRegel = { schluessel: string; namen: string[]; woerter: string[] };

/**
 * Stichwort-Tabelle. `namen`: so darf die Kategorie in einer Liste heissen
 * (normalisiert). `woerter`: normalisierte Artikel-Stichwoerter. Deutsche
 * Komposita tragen das Grundwort hinten ("Hafermilch") — ein Wort trifft,
 * wenn es gleich ist, damit beginnt (Plural) oder damit endet (ab 4 Zeichen).
 * Der LAENGSTE Treffer gewinnt ("Kindermilch" -> Kind, nicht Kuehl).
 */
export const KATEGORIEN: KategorieRegel[] = [
	{
		schluessel: 'gemuese',
		namen: ['gemuese', 'gemuese obst', 'obst gemuese', 'obst und gemuese', 'frische'],
		woerter: ['tomate', 'gurke', 'salat', 'moehre', 'karotte', 'paprika', 'zwiebel', 'knoblauch', 'kartoffel', 'suesskartoffel', 'zucchini', 'aubergine', 'brokkoli', 'blumenkohl', 'kohl', 'rotkohl', 'rosenkohl', 'krautsalat', 'fenchel', 'lauch', 'porree', 'spinat', 'pilz', 'champignon', 'suppengruen', 'sellerie', 'radieschen', 'kuerbis', 'avocado', 'ingwer', 'petersilie', 'schnittlauch', 'basilikum', 'rucola', 'spargel']
	},
	{
		schluessel: 'obst',
		namen: ['obst'],
		woerter: ['apfel', 'aepfel', 'banane', 'birne', 'orange', 'mandarine', 'clementine', 'zitrone', 'limette', 'traube', 'erdbeere', 'himbeere', 'blaubeere', 'heidelbeere', 'kiwi', 'ananas', 'mango', 'melone', 'pfirsich', 'nektarine', 'pflaume', 'kirsche']
	},
	{
		schluessel: 'kuehl',
		namen: ['kuehlabteilung', 'kuehlregal', 'kuehl', 'kuehlung', 'molkerei', 'milchprodukte', 'frischetheke', 'wurst und kaese', 'fleisch'],
		woerter: ['milch', 'joghurt', 'jogurt', 'quark', 'sahne', 'schmand', 'creme fraiche', 'butter', 'margarine', 'kaese', 'babybel', 'mozzarella', 'feta', 'frischkaese', 'ei', 'eier', 'wurst', 'aufschnitt', 'fleischwurst', 'salami', 'schinken', 'speck', 'hackfleisch', 'hack', 'haehnchen', 'huehnchen', 'fleisch', 'gyros', 'gyrosfleisch', 'tzatziki', 'schupfnudeln', 'gnocchi', 'teig', 'pudding', 'hefe']
	},
	{
		schluessel: 'tiefkuehl',
		namen: ['tiefkuehl', 'tiefkuehlung', 'tiefkuehlkost', 'tk', 'gefroren', 'tiefgekuehlt'],
		woerter: ['pommes', 'fischstaebchen', 'pizza', 'eis', 'rahmspinat', 'tk']
	},
	{
		schluessel: 'grundnahrung',
		namen: ['grundnahrung', 'grundnahrungsmittel', 'trockenware', 'backwaren', 'brot', 'vorrat', 'vorraete'],
		woerter: ['brot', 'broetchen', 'toast', 'nudel', 'nudeln', 'spaghetti', 'reis', 'mehl', 'zucker', 'muesli', 'haferflocken', 'cornflakes', 'bruehe', 'oel', 'essig', 'honig', 'marmelade', 'nutella', 'kaffee', 'tee', 'kakao', 'doenertasche', 'fladenbrot', 'wraps', 'tortilla', 'zwieback', 'knaeckebrot', 'pizzabroetchen']
	},
	{
		schluessel: 'dosen',
		namen: ['dosen', 'konserven', 'glaeser', 'dosen und glaeser'],
		woerter: ['dose', 'stueckige tomaten', 'passierte tomaten', 'tomatenmark', 'mais', 'kidneybohnen', 'bohnen', 'kichererbsen', 'linsen', 'kokosmilch', 'thunfisch', 'ravioli', 'oliven', 'sauerkraut', 'apfelmus']
	},
	{
		schluessel: 'gewuerze',
		namen: ['gewuerze', 'gewuerz', 'gewuerze und sossen'],
		woerter: ['salz', 'pfeffer', 'paprikapulver', 'curry', 'zimt', 'oregano', 'gewuerz', 'muskat', 'chili', 'kraeuter', 'ketchup', 'senf', 'mayonnaise', 'mayo']
	},
	{
		schluessel: 'snacks',
		namen: ['snacks', 'suesses', 'naschen', 'suessigkeiten', 'knabberzeug'],
		woerter: ['chips', 'schokolade', 'kekse', 'keks', 'gummibaerchen', 'nuesse', 'erdnuesse', 'salzstangen', 'cracker', 'riegel', 'popcorn', 'flips']
	},
	{
		schluessel: 'drogerie',
		namen: ['drogerie', 'hygiene', 'haushalt', 'putzmittel', 'haushaltswaren'],
		woerter: ['shampoo', 'duschgel', 'seife', 'zahnpasta', 'zahnbuerste', 'deo', 'klopapier', 'toilettenpapier', 'kuechenrolle', 'taschentuecher', 'spuelmittel', 'waschmittel', 'weichspueler', 'muellbeutel', 'schwamm', 'spuelmaschinentabs', 'creme', 'rasierer', 'watte', 'pflaster']
	},
	{
		schluessel: 'getraenke',
		namen: ['getraenke', 'trinken', 'getraenkemarkt'],
		woerter: ['wasser', 'sprudel', 'saft', 'cola', 'limo', 'limonade', 'fanta', 'sprite', 'softdrinks', 'softdrink', 'bier', 'wein', 'sekt', 'aperol', 'prosecco', 'schorle', 'eistee', 'energy']
	},
	{
		schluessel: 'kind',
		namen: ['kind', 'baby', 'kinder', 'babybedarf'],
		woerter: ['windel', 'windeln', 'babyfeuchttuecher', 'feuchttuecher', 'kindermilch', 'milchpulver', 'brei', 'quetschie', 'babynahrung', 'schnuller']
	},
	{
		schluessel: 'tier',
		namen: ['tier', 'tiere', 'haustier', 'katze', 'hund', 'tierbedarf'],
		woerter: ['katzenfutter', 'hundefutter', 'katzenstreu', 'streu', 'leckerli']
	}
];

/** Wie gut trifft ein Stichwort den normalisierten Artikeltext? 0 = gar nicht, sonst Laenge. */
function trefferLaenge(artikel: string, wort: string): number {
	if (wort.includes(' ')) return artikel.includes(wort) ? wort.length : 0;
	for (const teil of artikel.split(' ')) {
		if (teil === wort) return wort.length;
		if (wort.length >= 4 && (teil.startsWith(wort) || teil.endsWith(wort))) return wort.length;
	}
	return 0;
}

function regelFuer(artikelText: string): KategorieRegel | null {
	const artikel = normalisiere(artikelText);
	if (!artikel) return null;
	let beste: KategorieRegel | null = null;
	let besteLaenge = 0;
	for (const regel of KATEGORIEN) {
		for (const wort of regel.woerter) {
			const l = trefferLaenge(artikel, wort);
			if (l > besteLaenge) {
				beste = regel;
				besteLaenge = l;
			}
		}
	}
	return beste;
}

/** Passt der Kategoriename einer Liste zu einer Regel? */
function nameTrifft(kategorieName: string, regel: KategorieRegel): boolean {
	const name = normalisiere(kategorieName);
	return regel.namen.some((n) => name === n || name.split(' ').includes(n));
}

/** Kategorie der Liste fuer einen Artikel — oder null (dann "Sonstiges"). */
export function findeKategorie<K extends { id: string; text: string }>(
	artikelText: string,
	kategorien: K[]
): K | null {
	const regel = regelFuer(artikelText);
	if (!regel) return null;
	return kategorien.find((k) => nameTrifft(k.text, regel)) ?? null;
}

export function istSonstiges(name: string): boolean {
	const n = normalisiere(name);
	return n === 'sonstiges' || n === 'sonstige' || n === 'sonstiges und neues' || n === 'diverses';
}

/** Denselben Artikel in der Liste finden (Menge und Schreibweise egal). */
export function findeArtikel<A extends { text: string }>(text: string, artikel: A[]): A | null {
	const gesucht = normalisiere(text);
	if (!gesucht) return null;
	return artikel.find((a) => normalisiere(a.text) === gesucht) ?? null;
}

export type EinkaufsZeile = {
	id: string;
	parent_id: string | null;
	type: string;
	text: string;
	done: boolean;
	abgelegt?: boolean | null;
	position: number;
	updated_at: string;
};
export type Abschnitt<T> = { kategorie: T; offen: T[]; wagen: T[]; abgelegt: T[] };
export type EinkaufsAnsicht<T> = {
	ohneKategorie: T[];
	abschnitte: Abschnitt<T>[];
	offenAnzahl: number;
	wagenAnzahl: number;
};

const nachPosition = (a: { position: number }, b: { position: number }) => a.position - b.position;
const neuesteZuerst = (a: { updated_at: string }, b: { updated_at: string }) =>
	Date.parse(b.updated_at) - Date.parse(a.updated_at);

/** Die Zeilen EINER Einkaufsliste als Abschnitte. */
export function einkaufsAnsicht<T extends EinkaufsZeile>(zeilen: T[]): EinkaufsAnsicht<T> {
	const kategorien = zeilen.filter((t) => !t.parent_id && t.type === 'divider').sort(nachPosition);
	const abschnitte: Abschnitt<T>[] = kategorien.map((kategorie) => {
		const kinder = zeilen.filter((t) => t.parent_id === kategorie.id && t.type !== 'divider');
		return {
			kategorie,
			offen: kinder.filter((t) => artikelZustand(t) === 'offen').sort(nachPosition),
			wagen: kinder.filter((t) => artikelZustand(t) === 'wagen').sort(nachPosition),
			abgelegt: kinder.filter((t) => artikelZustand(t) === 'abgelegt').sort(neuesteZuerst)
		};
	});
	// Artikel ohne Kategorie: Zeilen der obersten Ebene (von n8n, G2, einem
	// zweiten Geraet) und Kinder, deren Kategorie es nicht mehr gibt.
	const alleIds = new Set(zeilen.map((t) => t.id));
	const ohneKategorie = zeilen
		.filter((t) => t.type !== 'divider' && (!t.parent_id || !alleIds.has(t.parent_id)))
		.filter((t) => artikelZustand(t) !== 'abgelegt')
		.sort(nachPosition);
	const alle = [...abschnitte.flatMap((a) => [...a.offen, ...a.wagen]), ...ohneKategorie];
	return {
		ohneKategorie,
		abschnitte,
		offenAnzahl: alle.filter((t) => artikelZustand(t) === 'offen').length,
		wagenAnzahl: alle.filter((t) => artikelZustand(t) === 'wagen').length
	};
}
