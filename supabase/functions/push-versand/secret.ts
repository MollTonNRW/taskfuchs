// secret.ts — zeitkonstanter Vergleich des Cron-Secrets (Header x-push-secret).

const enc = new TextEncoder();

/**
 * Vergleicht den gesendeten Header mit dem erwarteten Secret, ohne früh abzubrechen.
 * Die Laufzeit hängt nur von der Länge des erwarteten Secrets ab, nicht vom Inhalt oder
 * der Länge der Eingabe. Fehlende oder leere Werte sind nie gleich.
 */
export function secretGleich(gesendet: string | null, erwartet: string | undefined): boolean {
	if (!gesendet || !erwartet) return false;
	const x = enc.encode(gesendet);
	const y = enc.encode(erwartet);
	let diff = x.length ^ y.length;
	for (let i = 0; i < y.length; i++) {
		diff |= (x[i] ?? 0) ^ y[i];
	}
	return diff === 0;
}
