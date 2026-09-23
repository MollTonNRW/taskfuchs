import type { Database } from '$lib/types/database';

type List = Database['public']['Tables']['lists']['Row'];
type ListShare = Database['public']['Tables']['list_shares']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'];

export type Rolle = ListShare['role'];

/**
 * Ein Mensch, der an einer Liste beteiligt ist — Besitzer oder Geteilter.
 *
 * `name` und `initialen` sind bereits anzeigefertig. Eine UUID kommt hier
 * NIE heraus (Spezifikation Abschnitt 9, Punkt „keine UUIDs in der
 * Oberflaeche"): fehlt jedes Profil und jede E-Mail, steht dort „Mitnutzer"
 * und als Initiale ein Fragezeichen.
 */
export type Mitnutzer = {
	id: string;
	name: string;
	initialen: string;
	/** CSS-Wert, keine rohe Farbe — die Token liegen in src/tf.css. */
	farbe: string;
	rolle: Rolle;
	/** Der angemeldete Nutzer selbst. Die Navigationszeile blendet ihn aus. */
	ich: boolean;
};

/**
 * Farben der fremden Avatare. Die Spezifikation nennt zwei feste Werte
 * (`#4F7C9B` „Haushalt", `#6F8F5A` „Ingo"); die beiden weiteren sind in
 * derselben gedaempften Familie ergaenzt, weil eine Liste mit mehr als zwei
 * Mitnutzern sonst zweimal dieselbe Farbe zeigt. Der eigene Avatar ist
 * immer `--accent`.
 */
const PALETTE = ['var(--avatar-a)', 'var(--avatar-b)', 'var(--avatar-c)', 'var(--avatar-d)'];

/** Stabile Streuung ueber die Palette — dieselbe Person, dieselbe Farbe. */
function streuung(id: string): number {
	let h = 0;
	for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
	return Math.abs(h) % PALETTE.length;
}

/** Ein Buchstabe fuer den 20-px-Avatar, wie im Mockup (F · H · I). */
export function initialeAus(name: string): string {
	const basis = name.includes('@') ? name.split('@')[0] : name;
	const zeichen = basis.trim().replace(/^[^\p{L}\p{N}]+/u, '').charAt(0);
	return zeichen ? zeichen.toUpperCase() : '?';
}

/** Anzeigename, sonst E-Mail — niemals die ID. */
function anzeigename(profil: Profile | undefined, email: string | null): string {
	const gewaehlt = profil?.display_name?.trim() || profil?.username?.trim() || email?.trim();
	return gewaehlt || 'Mitnutzer';
}

/**
 * Zuordnung `listId -> Mitnutzer[]` aus den drei Rohquellen.
 *
 * Enthalten ist JEDER Beteiligte, der eigene Nutzer eingeschlossen und als
 * erster (Besitzer zuerst, danach die Geteilten in Ladereihenfolge). Wer nur
 * die fremden Avatare will — Navigationszeile, mobile Uebersicht — filtert
 * auf `!m.ich`; die Geteilt-Pille im Listen-Header zeigt alle.
 *
 * Die eigene E-Mail steht nur fuer den eigenen Eintrag zur Verfuegung: fuer
 * fremde Nutzer gibt es in `profiles` keine E-Mail-Spalte, dort traegt der
 * Anzeigename. Er wird beim Registrieren aus dem lokalen Teil der E-Mail
 * vorbelegt (Migration 001, `handle_new_user`), ist also praktisch immer da.
 */
export function baueMitnutzer(
	lists: Pick<List, 'id' | 'user_id'>[],
	shares: Pick<ListShare, 'list_id' | 'user_id' | 'role'>[],
	profiles: Pick<Profile, 'id' | 'display_name' | 'username'>[],
	eigeneId: string | null,
	eigeneEmail: string | null
): Record<string, Mitnutzer[]> {
	const profilNach = new Map<string, Profile>();
	for (const p of profiles) profilNach.set(p.id, p as Profile);

	function bauen(userId: string, rolle: Rolle): Mitnutzer {
		const ich = !!eigeneId && userId === eigeneId;
		const name = anzeigename(profilNach.get(userId), ich ? eigeneEmail : null);
		return {
			id: userId,
			name,
			initialen: initialeAus(name),
			farbe: ich ? 'var(--accent)' : PALETTE[streuung(userId)],
			rolle,
			ich
		};
	}

	const zuordnung: Record<string, Mitnutzer[]> = {};
	const bekannt = new Map<string, Set<string>>();

	for (const l of lists) {
		zuordnung[l.id] = [bauen(l.user_id, 'owner')];
		bekannt.set(l.id, new Set([l.user_id]));
	}

	for (const s of shares) {
		const liste = zuordnung[s.list_id];
		const gesehen = bekannt.get(s.list_id);
		// Freigaben zu Listen, die dieser Nutzer nicht sieht, ignorieren wir;
		// den Besitzer traegt bereits die Schleife darueber.
		if (!liste || !gesehen || gesehen.has(s.user_id)) continue;
		gesehen.add(s.user_id);
		liste.push(bauen(s.user_id, s.role));
	}

	return zuordnung;
}

/**
 * Ein einzelner Mitnutzer aus einem nachgeladenen Profil.
 *
 * Bei einer FREMDEN geteilten Liste laesst RLS in `list_shares` nur den
 * Besitzer und die eigene Zeile durch (Migration 003). Wer dort eine
 * Aufgabe angelegt oder angepinnt hat, ist ueber die Freigaben also nicht
 * zu finden — der Chip „gepinnt von Ingo" aus Spezifikation Frame 9 fiel
 * genau deshalb aus. Sein Profil wird nachgeladen und hier in dieselbe
 * Form gebracht, damit Zeile und Chip denselben Namen zeigen wie ueberall.
 */
export function baueAusProfil(profil: Pick<Profile, 'id' | 'display_name' | 'username'>): Mitnutzer {
	const name = anzeigename(profil as Profile, null);
	return {
		id: profil.id,
		name,
		initialen: initialeAus(name),
		farbe: PALETTE[streuung(profil.id)],
		// Aus dieser Quelle ist die Rolle nicht bekannt. Sie wird an der Zeile
		// auch nicht gezeigt — nur der Teilen-Dialog liest sie, und der
		// arbeitet ausschliesslich mit `list_shares`.
		rolle: 'viewer',
		ich: false
	};
}
