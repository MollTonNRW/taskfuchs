/**
 * Haelt die laufende App auf dem Stand des Deploys.
 *
 * In der Android-APK (TWA) ueberlebt der Tab tagelang im Hintergrund, und
 * beim Kaltstart stellt Chrome die zuletzt geladene Seite wieder her. In
 * beiden Faellen laeuft das JavaScript eines alten Builds weiter — es holt
 * die Aufgaben live aus Supabase, zeigt sie aber in der alten Oberflaeche.
 * SvelteKit merkt einen neuen Build von sich aus erst bei der naechsten
 * Navigation und auch nur mit `version.pollInterval`.
 *
 * Darum: beim Start, bei Rueckkehr aus dem Hintergrund und nach
 * Wiederherstellung aus dem Back-Forward-Cache gegen `_app/version.json`
 * pruefen und bei neuem Build die Seite vollstaendig neu laden. Die
 * serverseitige Haelfte (HTML mit `no-store`) steht in `hooks.server.ts`.
 */
export function aufNeueVersionAchten({
	pruefe,
	neuLaden,
	dokument,
	fenster
}: {
	/** `updated.check` aus `$app/state` — true, wenn ein neuerer Build live ist. */
	pruefe: () => Promise<boolean>;
	neuLaden: () => void;
	dokument: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
	fenster: Pick<Window, 'addEventListener' | 'removeEventListener'>;
}): () => void {
	let laeuft = false;

	async function pruefen() {
		if (laeuft) return;
		laeuft = true;
		try {
			if (await pruefe()) neuLaden();
		} catch {
			/* offline oder Server kurz weg — beim naechsten Anlass wieder */
		} finally {
			laeuft = false;
		}
	}

	function beiSichtbarkeit() {
		if (dokument.visibilityState === 'visible') pruefen();
	}

	function beiSeitenanzeige(e: Event) {
		if ((e as PageTransitionEvent).persisted) pruefen();
	}

	dokument.addEventListener('visibilitychange', beiSichtbarkeit);
	fenster.addEventListener('pageshow', beiSeitenanzeige);
	pruefen();

	return () => {
		dokument.removeEventListener('visibilitychange', beiSichtbarkeit);
		fenster.removeEventListener('pageshow', beiSeitenanzeige);
	};
}

const SPERRE_SCHLUESSEL = 'tf-neu-geladen';
const SPERRE_MS = 30_000;

/**
 * Laedt neu, aber hoechstens einmal je 30 s. Liefert das CDN waehrend eines
 * Deploys kurz altes HTML und neue `version.json` aus, faende sich sonst
 * nach jedem Neuladen wieder „neuer Build" — eine Endlosschleife.
 */
export function neuLadenMitSperre({
	speicher,
	reload,
	jetzt
}: {
	speicher: Pick<Storage, 'getItem' | 'setItem'>;
	reload: () => void;
	jetzt: number;
}) {
	try {
		const zuletzt = speicher.getItem(SPERRE_SCHLUESSEL);
		if (zuletzt !== null && jetzt - Number(zuletzt) < SPERRE_MS) return;
		speicher.setItem(SPERRE_SCHLUESSEL, String(jetzt));
	} catch {
		/* Speicher gesperrt — ohne Sperre neu laden ist besser als alter Build */
	}
	reload();
}
