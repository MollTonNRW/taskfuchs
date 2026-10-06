import { assertEquals } from '@std/assert';
import { secretGleich } from './secret.ts';

Deno.test('gleiche Secrets sind gleich', () => {
	assertEquals(secretGleich('a', 'a'), true);
	assertEquals(secretGleich('ein-laengeres-Secret_123', 'ein-laengeres-Secret_123'), true);
});

Deno.test('verschiedene Secrets sind ungleich', () => {
	assertEquals(secretGleich('a', 'b'), false);
	assertEquals(secretGleich('geheim1', 'geheim2'), false);
});

Deno.test('fehlender oder leerer Header ist ungleich', () => {
	assertEquals(secretGleich(null, 'a'), false);
	assertEquals(secretGleich('', 'a'), false);
});

Deno.test('fehlendes oder leeres erwartetes Secret lässt nie durch', () => {
	assertEquals(secretGleich('a', undefined), false);
	assertEquals(secretGleich('', ''), false);
	assertEquals(secretGleich(null, undefined), false);
	assertEquals(secretGleich('a', ''), false);
});

Deno.test('Präfix oder Verlängerung ist ungleich', () => {
	assertEquals(secretGleich('geheim', 'geheimnis'), false);
	assertEquals(secretGleich('geheimnis', 'geheim'), false);
	assertEquals(secretGleich('geheim', 'geheim\0'), false);
	assertEquals(secretGleich('geheim\0', 'geheim'), false);
});

Deno.test('Mehrbyte-Zeichen werden bytegenau verglichen', () => {
	assertEquals(secretGleich('Schlüssel', 'Schlüssel'), true);
	assertEquals(secretGleich('Schlüssel', 'Schluessel'), false);
});
