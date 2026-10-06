import { assert, assertEquals, assertRejects } from '@std/assert';
import { rpcAbhaengigkeiten, type RpcAntwort, type RpcClient } from './db.ts';
import type { Buendel } from './typen.ts';

/** RPC-Client, der nur die Antwort liefert, die der Test vorgibt (und die Aufrufe festhält). */
function clientMit(antwort: RpcAntwort) {
	const aufrufe: Array<{ name: string; args?: Record<string, unknown> }> = [];
	const client: RpcClient = {
		rpc: (name, args) => {
			aufrufe.push({ name, args });
			return Promise.resolve(antwort);
		},
	};
	return { client, aufrufe };
}

Deno.test('abholen: ruft push_buendel_abholen und liefert die Bündel; null wird zur leeren Liste', async () => {
	const buendel = [{ list_id: 'x' }] as unknown as Buendel[];
	const a = clientMit({ data: buendel, error: null, status: 200 });
	assertEquals(await rpcAbhaengigkeiten(a.client).abholen(), buendel);
	assertEquals(a.aufrufe, [{ name: 'push_buendel_abholen', args: undefined }]);
	const b = clientMit({ data: null, error: null, status: 200 });
	assertEquals(await rpcAbhaengigkeiten(b.client).abholen(), []);
});

Deno.test('ergebnis: ruft push_abo_ergebnis mit p_ok und p_weg', async () => {
	const a = clientMit({ data: null, error: null, status: 204 });
	await rpcAbhaengigkeiten(a.client).ergebnis(['https://a'], ['https://b']);
	assertEquals(a.aufrufe, [{ name: 'push_abo_ergebnis', args: { p_ok: ['https://a'], p_weg: ['https://b'] } }]);
});

Deno.test('Fehler mit PostgREST-/Postgres-Code: der Code steht in der Meldung', async () => {
	const c = clientMit({ data: null, error: { code: '42501', message: 'permission denied' }, status: 403 });
	await assertRejects(() => rpcAbhaengigkeiten(c.client).abholen(), Error, 'abholen: 42501');
	await assertRejects(() => rpcAbhaengigkeiten(c.client).ergebnis([], []), Error, 'ergebnis: 42501');
});

Deno.test('Netzfehler (code leer, Status 0): Meldung nennt "Netzfehler" statt leer zu bleiben', async () => {
	const c = clientMit({
		data: null,
		error: { code: '', message: 'TypeError: fetch failed http://db.intern:5432' },
		status: 0,
	});
	const fehler = await assertRejects(() => rpcAbhaengigkeiten(c.client).abholen(), Error);
	assertEquals(fehler.message, 'abholen: Netzfehler');
	const fehler2 = await assertRejects(() => rpcAbhaengigkeiten(c.client).ergebnis([], []), Error);
	assertEquals(fehler2.message, 'ergebnis: Netzfehler');
});

Deno.test('Gateway-Fehler ohne code: Meldung nennt den HTTP-Status; die Fehlermeldung (kann URLs enthalten) nie', async () => {
	const c = clientMit({ data: null, error: { message: 'Bad Gateway http://db.intern:5432' }, status: 502 });
	const fehler = await assertRejects(() => rpcAbhaengigkeiten(c.client).abholen(), Error);
	assertEquals(fehler.message, 'abholen: HTTP 502');
	assert(!fehler.message.includes('db.intern'));
});
