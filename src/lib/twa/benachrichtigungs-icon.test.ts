import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inflateSync } from 'node:zlib';

// Das Kleinsymbol der delegierten Benachrichtigung (SMALL_ICON im DelegationService)
// rendert Android ausschliesslich ueber den Alpha-Kanal. Ein deckendes Vollfarb-Bild
// wird in der Statusleiste zum einfarbigen Quadrat.
const RES = resolve(__dirname, '../../../twa/app/src/main/res');
const MANIFEST = resolve(__dirname, '../../../twa/app/src/main/AndroidManifest.xml');

const DICHTEN = [
	['mdpi', 24],
	['hdpi', 36],
	['xhdpi', 48],
	['xxhdpi', 72],
	['xxxhdpi', 96]
] as const;

type Bild = { breite: number; hoehe: number; rgba: Uint8Array };

/** Minimaler PNG-Decoder (nur 8 Bit RGBA, nicht interlaced), reicht fuer die Icons. */
function pngLesen(pfad: string): Bild {
	const buf = readFileSync(pfad);
	let pos = 8;
	let breite = 0;
	let hoehe = 0;
	const idat: Buffer[] = [];
	while (pos < buf.length) {
		const laenge = buf.readUInt32BE(pos);
		const typ = buf.toString('ascii', pos + 4, pos + 8);
		const daten = buf.subarray(pos + 8, pos + 8 + laenge);
		if (typ === 'IHDR') {
			breite = daten.readUInt32BE(0);
			hoehe = daten.readUInt32BE(4);
			const [tiefe, farbtyp, , , interlace] = [daten[8], daten[9], daten[10], daten[11], daten[12]];
			if (tiefe !== 8 || farbtyp !== 6 || interlace !== 0) {
				throw new Error(`${pfad}: erwartet 8 Bit RGBA ohne Interlace (Tiefe ${tiefe}, Typ ${farbtyp})`);
			}
		} else if (typ === 'IDAT') {
			idat.push(daten);
		}
		pos += 12 + laenge;
	}
	const roh = inflateSync(Buffer.concat(idat));
	const zeile = breite * 4;
	const rgba = new Uint8Array(zeile * hoehe);
	for (let y = 0; y < hoehe; y++) {
		const filter = roh[y * (zeile + 1)];
		for (let i = 0; i < zeile; i++) {
			const x = roh[y * (zeile + 1) + 1 + i];
			const a = i >= 4 ? rgba[y * zeile + i - 4] : 0;
			const b = y > 0 ? rgba[(y - 1) * zeile + i] : 0;
			const c = i >= 4 && y > 0 ? rgba[(y - 1) * zeile + i - 4] : 0;
			let wert: number;
			if (filter === 0) wert = x;
			else if (filter === 1) wert = x + a;
			else if (filter === 2) wert = x + b;
			else if (filter === 3) wert = x + ((a + b) >> 1);
			else {
				const p = a + b - c;
				const pa = Math.abs(p - a);
				const pb = Math.abs(p - b);
				const pc = Math.abs(p - c);
				wert = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
			}
			rgba[y * zeile + i] = wert & 0xff;
		}
	}
	return { breite, hoehe, rgba };
}

describe('Benachrichtigungs-Kleinsymbol der TWA', () => {
	it('wird vom DelegationService als SMALL_ICON eingebunden', () => {
		const xml = readFileSync(MANIFEST, 'utf8');
		expect(xml).toMatch(
			/android\.support\.customtabs\.trusted\.SMALL_ICON"\s+android:resource="@drawable\/ic_notification_icon"/
		);
	});

	for (const [dichte, groesse] of DICHTEN) {
		describe(`drawable-${dichte}`, () => {
			const bild = () => pngLesen(`${RES}/drawable-${dichte}/ic_notification_icon.png`);

			it(`ist ${groesse} x ${groesse} px gross`, () => {
				const { breite, hoehe } = bild();
				expect([breite, hoehe]).toEqual([groesse, groesse]);
			});

			it('hat einen echten Alpha-Kanal (mind. 40 % transparent, mind. 10 % sichtbar)', () => {
				const { rgba } = bild();
				const gesamt = rgba.length / 4;
				let transparent = 0;
				let sichtbar = 0;
				for (let i = 3; i < rgba.length; i += 4) {
					if (rgba[i] < 16) transparent++;
					if (rgba[i] >= 128) sichtbar++;
				}
				expect(transparent / gesamt).toBeGreaterThanOrEqual(0.4);
				expect(sichtbar / gesamt).toBeGreaterThanOrEqual(0.1);
			});

			it('ist monochrom weiss (alle nicht transparenten Pixel RGB 255)', () => {
				const { rgba } = bild();
				for (let i = 0; i < rgba.length; i += 4) {
					if (rgba[i + 3] === 0) continue;
					expect([rgba[i], rgba[i + 1], rgba[i + 2]]).toEqual([255, 255, 255]);
				}
			});
		});
	}
});
