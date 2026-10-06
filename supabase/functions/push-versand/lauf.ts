// lauf.ts — Ablauf eines Versandlaufs mit injizierten Abhängigkeiten (testbar ohne Netz und Datenbank).
import { verdichten } from './buendeln.ts';
import { nachrichtBauen } from './texte.ts';
import type { Abo, Buendel } from './typen.ts';
import { klassifizieren, type Sender } from './webpush.ts';

export interface Abhaengigkeiten {
	/** rpc push_buendel_abholen: holt und löscht die fälligen Bündel. */
	abholen(): Promise<Buendel[]>;
	/** rpc push_abo_ergebnis: Abos mit erfolgreichem Versand markieren, tote Abos löschen. */
	ergebnis(ok: string[], weg: string[]): Promise<void>;
	sender: Sender;
	/** Nur Zähler loggen — nie Aufgabentexte, Namen, Titel, Endpoints oder Schlüssel. */
	log(msg: string): void;
}

/** `buendel` = Anzahl abgeholter Bündel; `entfernt` = Anzahl verschiedener Abos, die der Push-Dienst nicht mehr kennt. */
export interface Bericht {
	buendel: number;
	gesendet: number;
	fehler: number;
	entfernt: number;
}

interface Auftrag {
	abo: Abo;
	payload: string;
}

const STANDARD_PARALLEL = 6;
/**
 * Gesamtbudget je Lauf. Die Ereignisse sind beim Abholen schon gelöscht; hängende Push-Endpoints dürfen den Lauf
 * deshalb nicht bis ans Plattform-Limit der Edge Function treiben, sonst gingen Ergebnis-Meldung und Log verloren.
 */
const STANDARD_BUDGET_MS = 60_000;
/** Sicherheitsgrenze: ein Konto mit sehr vielen (Fake-)Abos darf den gemeinsamen Pool nicht belegen. */
const MAX_ABOS_JE_EMPFAENGER = 10;

/** Führt `fn` für alle Elemente aus, höchstens `n` gleichzeitig. `fn` darf nicht werfen. */
async function begrenztParallel<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
	let naechster = 0;
	const arbeiter = Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => {
		while (naechster < items.length) await fn(items[naechster++]);
	});
	await Promise.all(arbeiter);
}

/** HTTP-Status aufsteigend, danach die übrigen Schlüssel („bündel“, „netz“) alphabetisch. */
function schluesselOrdnung(a: string, b: string): number {
	const na = Number(a);
	const nb = Number(b);
	if (Number.isNaN(na) !== Number.isNaN(nb)) return Number.isNaN(na) ? 1 : -1;
	return Number.isNaN(na) ? a.localeCompare(b) : na - nb;
}

export async function lauf(
	d: Abhaengigkeiten,
	parallel: number = STANDARD_PARALLEL,
	budgetMs: number = STANDARD_BUDGET_MS,
): Promise<Bericht> {
	const buendel = await d.abholen();
	const bericht: Bericht = { buendel: buendel.length, gesendet: 0, fehler: 0, entfernt: 0 };
	if (buendel.length === 0) return bericht;

	const ok = new Set<string>();
	const weg = new Set<string>();
	const fehlerStatus = new Map<string, number>(); // Schlüssel: HTTP-Status oder "netz"/"zeit"/"endpoint"/"bündel"
	const fehlerZaehlen = (schluessel: string) => {
		bericht.fehler += 1;
		fehlerStatus.set(schluessel, (fehlerStatus.get(schluessel) ?? 0) + 1);
	};

	// Die Ereignisse sind mit dem Abholen schon gelöscht: ein defektes Bündel darf die übrigen nicht mitreißen.
	const auftraege: Auftrag[] = [];
	for (const b of buendel) {
		try {
			const nachricht = nachrichtBauen(b, verdichten(b.events ?? []));
			if (!nachricht) continue;
			const payload = JSON.stringify(nachricht);
			const neue: Auftrag[] = [];
			for (const empfaenger of b.empfaenger ?? []) {
				for (const abo of (empfaenger.abos ?? []).slice(0, MAX_ABOS_JE_EMPFAENGER)) neue.push({ abo, payload });
			}
			auftraege.push(...neue);
		} catch {
			fehlerZaehlen('bündel'); // neutral: ohne Inhalt der Ausnahme
		}
	}

	// Nach Ablauf des Budgets wird nichts Neues mehr gestartet und Laufendes abgebrochen. Zusätzlich wird jede
	// Sendung gegen den Ablauf "gerannt", damit auch ein Sender ohne Signal-Unterstützung den Lauf nicht festhält.
	const abbruch = new AbortController();
	const timer = setTimeout(() => abbruch.abort(), budgetMs);
	const budgetAbgelaufen = new Promise<never>((_, reject) => {
		abbruch.signal.addEventListener('abort', () => reject(new Error('Zeitbudget')), { once: true });
	});
	budgetAbgelaufen.catch(() => {}); // läuft das Budget nie ab, bleibt das Promise offen; sonst kein "unhandled rejection"

	try {
		await begrenztParallel(auftraege, parallel, async ({ abo, payload }) => {
			if (abbruch.signal.aborted) return fehlerZaehlen('zeit');
			try {
				const status = await Promise.race([d.sender.senden(abo, payload, abbruch.signal), budgetAbgelaufen]);
				const ergebnis = klassifizieren(status);
				if (ergebnis === 'ok') {
					bericht.gesendet += 1;
					ok.add(abo.endpoint);
				} else if (ergebnis === 'weg') {
					weg.add(abo.endpoint);
				} else {
					fehlerZaehlen(String(status));
				}
			} catch (e) {
				// Nur die neutralen Meldungen des Senders unterscheiden; alles andere ist ein Netzfehler.
				const meldung = e instanceof Error ? e.message : '';
				fehlerZaehlen(
					meldung === 'Endpoint nicht erlaubt'
						? 'endpoint'
						: abbruch.signal.aborted || meldung === 'Zeitüberschreitung'
						? 'zeit'
						: 'netz',
				);
			}
		});
	} finally {
		clearTimeout(timer);
	}

	// Ein Abo, das irgendwo als „weg“ gemeldet wurde, wird nicht zusätzlich als „ok“ markiert.
	for (const endpoint of weg) ok.delete(endpoint);
	bericht.entfernt = weg.size;

	d.log(
		`push-versand: ${bericht.buendel} Bündel, ${bericht.gesendet} gesendet, ${bericht.fehler} Fehler, ${bericht.entfernt} entfernt`,
	);
	if (fehlerStatus.size > 0) {
		const teile = [...fehlerStatus].sort(([a], [b]) => schluesselOrdnung(a, b))
			.map(([schluessel, anzahl]) => `${schluessel} ×${anzahl}`);
		d.log(`push-versand: Fehler nach Status: ${teile.join(', ')}`);
	}

	// Erst loggen, dann melden: scheitert das Melden, sind die Zähler der schon versendeten Meldungen trotzdem im Log.
	if (ok.size > 0 || weg.size > 0) await d.ergebnis([...ok], [...weg]);
	return bericht;
}
