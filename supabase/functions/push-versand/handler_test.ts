import { assert, assertEquals } from '@std/assert';
import { erstelleHandler } from './handler.ts';
import type { Abhaengigkeiten } from './lauf.ts';

const SECRET = 'test-secret-nur-fuer-tests';

function setup(opts: { secret?: string | undefined; abholen?: () => Promise<never[]> } = {}) {
	const zaehler = { erzeugt: 0, abgeholt: 0 };
	const fehlerLog: string[] = [];
	const handler = erstelleHandler({
		cronSecret: () => ('secret' in opts ? opts.secret : SECRET),
		abhaengigkeiten: (): Promise<Abhaengigkeiten> => {
			zaehler.erzeugt++;
			return Promise.resolve({
				abholen: () => {
					zaehler.abgeholt++;
					return opts.abholen ? opts.abholen() : Promise.resolve([]);
				},
				ergebnis: () => Promise.resolve(),
				sender: { senden: () => Promise.resolve(201) },
				log: () => {},
			});
		},
		logFehler: (m) => fehlerLog.push(m),
	});
	return { handler, zaehler, fehlerLog };
}

const post = (headers: Record<string, string> = {}) =>
	new Request('http://localhost/push-versand', { method: 'POST', headers, body: '{}' });

Deno.test('andere Methode als POST -> 405 mit Allow, ohne Abhängigkeiten zu bauen', async () => {
	const { handler, zaehler } = setup();
	for (const method of ['GET', 'PUT', 'DELETE', 'PATCH']) {
		const res = await handler(new Request('http://localhost/', { method, headers: { 'x-push-secret': SECRET } }));
		assertEquals(res.status, 405, method);
		assertEquals(res.headers.get('allow'), 'POST');
		await res.body?.cancel();
	}
	assertEquals(zaehler.erzeugt, 0);
});

Deno.test('fehlender oder falscher Secret-Header -> 401, nichts wird gebaut oder abgeholt', async () => {
	const { handler, zaehler } = setup();
	const faelle: Array<Record<string, string>> = [
		{},
		{ 'x-push-secret': '' },
		{ 'x-push-secret': 'falsch' },
		{ 'x-push-secret': SECRET + 'x' },
	];
	for (const headers of faelle) {
		const res = await handler(post(headers));
		assertEquals(res.status, 401, JSON.stringify(headers));
		await res.body?.cancel();
	}
	assertEquals(zaehler.erzeugt, 0);
	assertEquals(zaehler.abgeholt, 0);
});

Deno.test('POST ohne Secret ist 401 (Unauthorized), nicht 405', async () => {
	const { handler } = setup();
	const res = await handler(post());
	assertEquals(res.status, 401);
	assertEquals(await res.text(), 'Unauthorized');
});

Deno.test('nicht konfiguriertes Secret lässt nie durch (auch nicht mit leerem Header)', async () => {
	for (const secret of [undefined, '']) {
		const { handler, zaehler } = setup({ secret });
		const faelle: Array<Record<string, string>> = [{}, { 'x-push-secret': '' }, { 'x-push-secret': 'irgendwas' }];
		for (const headers of faelle) {
			const res = await handler(post(headers));
			assertEquals(res.status, 401);
			await res.body?.cancel();
		}
		assertEquals(zaehler.erzeugt, 0);
	}
});

Deno.test('richtiges Secret -> 200 mit Bericht als JSON', async () => {
	const { handler, zaehler } = setup();
	const res = await handler(post({ 'x-push-secret': SECRET }));
	assertEquals(res.status, 200);
	assertEquals(res.headers.get('content-type'), 'application/json');
	assertEquals(await res.json(), { buendel: 0, gesendet: 0, fehler: 0, entfernt: 0 });
	assertEquals(zaehler.erzeugt, 1);
	assertEquals(zaehler.abgeholt, 1);
});

Deno.test('Fehler im Lauf -> 500 mit neutralem Text, Meldung wird geloggt', async () => {
	const { handler, fehlerLog } = setup({ abholen: () => Promise.reject(new Error('abholen: 42501')) });
	const res = await handler(post({ 'x-push-secret': SECRET }));
	assertEquals(res.status, 500);
	assertEquals(await res.text(), 'Fehler');
	assertEquals(fehlerLog, ['push-versand: abholen: 42501']);
});

Deno.test('Fehler beim Bauen der Abhängigkeiten (z. B. fehlende Konfiguration) -> 500, Secret nie in Log oder Antwort', async () => {
	const handler = erstelleHandler({
		cronSecret: () => SECRET,
		abhaengigkeiten: () => Promise.reject(new Error('Konfiguration unvollständig')),
		logFehler: (m) => logs.push(m),
	});
	const logs: string[] = [];
	const res = await handler(post({ 'x-push-secret': SECRET }));
	assertEquals(res.status, 500);
	const text = await res.text();
	assert(!text.includes(SECRET));
	assert(logs.every((l) => !l.includes(SECRET)));
	assertEquals(logs, ['push-versand: Konfiguration unvollständig']);
});

Deno.test('unbekannter Fehlertyp wird neutral geloggt', async () => {
	const { handler, fehlerLog } = setup({ abholen: () => Promise.reject('kein Error-Objekt') });
	const res = await handler(post({ 'x-push-secret': SECRET }));
	assertEquals(res.status, 500);
	await res.body?.cancel();
	assertEquals(fehlerLog, ['push-versand: unbekannter Fehler']);
});
