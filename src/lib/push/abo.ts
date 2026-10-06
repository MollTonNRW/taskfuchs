// Push-Abo dieses Geräts (Spec Push-Benachrichtigungen, Abschnitt App).
// Die Umgebung (Browser-APIs) ist injizierbar, damit die Logik ohne Browser testbar bleibt.
import type { SupabaseClient } from '@supabase/supabase-js';
import { VAPID_PUBLIC_KEY } from './vapid';

export type PushStatus = 'nicht-unterstuetzt' | 'verweigert' | 'aus' | 'an';

/** Wie `NotificationPermission` — der Typname fehlt der ESLint-Umgebung (no-undef). */
export type Berechtigung = 'default' | 'denied' | 'granted';

export interface PushUmgebung {
	/** 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window */
	hatPush: boolean;
	berechtigung(): Berechtigung;
	berechtigungAnfragen(): Promise<Berechtigung>;
	registrierung(): Promise<ServiceWorkerRegistration>;
	userAgent: string;
	/** display-mode: standalone */
	standalone: boolean;
	/** document.referrer beginnt mit 'android-app://' (Start aus der Taskfuchs-App/TWA) */
	ausApp: boolean;
}

/**
 * Wartet höchstens `ms` auf `versprechen`. `navigator.serviceWorker.ready`
 * löst nie auf, solange kein Service Worker aktiv ist — ohne Frist hinge dann
 * jeder Aufruf, auch das Abmelden.
 */
export function mitFrist<T>(versprechen: Promise<T>, ms: number): Promise<T> {
	return new Promise<T>((ok, fehler) => {
		const uhr = setTimeout(() => fehler(new Error('Service Worker nicht bereit')), ms);
		versprechen.then(
			(wert) => {
				clearTimeout(uhr);
				ok(wert);
			},
			(e) => {
				clearTimeout(uhr);
				fehler(e);
			}
		);
	});
}

const SW_FRIST_MS = 4000;

export function browserUmgebung(): PushUmgebung {
	const hatPush =
		typeof window !== 'undefined' &&
		'serviceWorker' in navigator &&
		'PushManager' in window &&
		'Notification' in window;
	return {
		hatPush,
		berechtigung: () => (hatPush ? Notification.permission : 'denied'),
		berechtigungAnfragen: () => Notification.requestPermission(),
		registrierung: () => mitFrist(navigator.serviceWorker.ready, SW_FRIST_MS),
		userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
		standalone: typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches === true,
		ausApp: typeof document !== 'undefined' && document.referrer.startsWith('android-app://')
	};
}

export function base64UrlZuUint8(s: string): Uint8Array<ArrayBuffer> {
	const pad = '='.repeat((4 - (s.length % 4)) % 4);
	const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
	const bin = atob(b64);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

function uint8ZuBase64Url(buf: ArrayBuffer | null): string {
	if (!buf) return '';
	let bin = '';
	for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function geraetName(u: Pick<PushUmgebung, 'userAgent' | 'standalone' | 'ausApp'>): string {
	const ua = u.userAgent;
	const system = /Android/i.test(ua) ? 'Android' : /Windows|Macintosh|Linux|CrOS/i.test(ua) ? 'Desktop' : '';
	if (system === 'Android' && u.ausApp) return 'Android · Taskfuchs-App';
	if (u.standalone) return `${system || 'Gerät'} · App`;
	const browser = /Firefox\//.test(ua)
		? 'Firefox'
		: /Edg\//.test(ua)
			? 'Edge'
			: /SamsungBrowser\//.test(ua)
				? 'Samsung Internet'
				: /Chrome\//.test(ua)
					? 'Chrome'
					: '';
	if (!system && !browser) return 'Browser';
	return [system || 'Gerät', browser || 'Browser'].join(' · ');
}

async function aktuellesAbo(u: PushUmgebung): Promise<PushSubscription | null> {
	const reg = await u.registrierung();
	return reg.pushManager.getSubscription();
}

/**
 * Wurde das Abo mit dem Schlüssel dieser Version angelegt? Ein Abo mit anderem
 * Schlüssel (Test vor einem Schlüsselwechsel) bleibt beim Browser „lebendig",
 * aber der Push-Dienst lehnt jeden Versand der Edge Function ab — und weil das
 * weder 404 noch 410 ist, räumt der Server es nie weg. Nennt der Browser den
 * Schlüssel nicht, lässt sich nichts prüfen: dann gilt das Abo als passend.
 */
function schluesselPasst(abo: PushSubscription): boolean {
	const angelegtMit = abo.options?.applicationServerKey;
	if (!angelegtMit) return true;
	const ist = new Uint8Array(angelegtMit);
	const soll = base64UrlZuUint8(VAPID_PUBLIC_KEY);
	return ist.length === soll.length && ist.every((b, i) => b === soll[i]);
}

/** Löscht die Server-Zeile zu `endpoint`. `true` nur, wenn der Server es bestätigt hat — wirft nie. */
async function serverAboLoeschen(sb: SupabaseClient, endpoint: string): Promise<boolean> {
	try {
		const { error } = await sb.rpc('push_abo_loeschen', { p_endpoint: endpoint });
		return !error;
	} catch {
		return false;
	}
}

export async function pushStatus(u: PushUmgebung = browserUmgebung()): Promise<PushStatus> {
	if (!u.hatPush) return 'nicht-unterstuetzt';
	const b = u.berechtigung();
	if (b === 'denied') return 'verweigert';
	if (b !== 'granted') return 'aus';
	try {
		const abo = await aktuellesAbo(u);
		// Ein Abo mit fremdem Schlüssel empfängt nichts: wie „aus" zeigen, Einschalten ersetzt es.
		return abo && schluesselPasst(abo) ? 'an' : 'aus';
	} catch {
		// Service Worker nicht bereit: wie „aus" behandeln — Einschalten zeigt dann den Fehler.
		return 'aus';
	}
}

async function speichern(sb: SupabaseClient, abo: PushSubscription, u: PushUmgebung): Promise<void> {
	const { error } = await sb.rpc('push_abo_speichern', {
		p_endpoint: abo.endpoint,
		p_p256dh: uint8ZuBase64Url(abo.getKey('p256dh')),
		p_auth: uint8ZuBase64Url(abo.getKey('auth')),
		p_geraet: geraetName(u)
	});
	if (error) throw new Error(error.message);
}

/**
 * Schaltet Meldungen auf diesem Gerät ein. Die Berechtigung wird hier — und
 * nur hier — angefragt; der Aufruf gehört hinter einen Klick.
 */
export async function einschalten(sb: SupabaseClient, u: PushUmgebung = browserUmgebung()): Promise<PushStatus> {
	if (!u.hatPush) return 'nicht-unterstuetzt';
	const b = await u.berechtigungAnfragen();
	if (b === 'denied') return 'verweigert';
	if (b !== 'granted') return 'aus';
	const reg = await u.registrierung();
	let abo = await reg.pushManager.getSubscription();
	if (abo && !schluesselPasst(abo)) {
		// Ersetzen statt übernehmen. Das alte Abo muss auch beim Browser weg: `subscribe` mit
		// anderem Schlüssel wirft sonst einen InvalidStateError.
		await serverAboLoeschen(sb, abo.endpoint);
		await abo.unsubscribe().catch(() => undefined);
		abo = null;
	}
	abo ??= await reg.pushManager.subscribe({
		userVisibleOnly: true,
		applicationServerKey: base64UrlZuUint8(VAPID_PUBLIC_KEY)
	});
	try {
		await speichern(sb, abo, u);
	} catch (e) {
		await abo.unsubscribe().catch(() => undefined);
		throw e;
	}
	return 'an';
}

/** Meldet das Abo beim Browser ab. `false` bei Fehlschlag oder Ausnahme — wirft nie. */
async function browserAbmelden(abo: PushSubscription): Promise<boolean> {
	try {
		return await abo.unsubscribe();
	} catch {
		return false;
	}
}

/**
 * Löscht das Abo dieses Geräts auf dem Server und meldet es beim Browser ab
 * (misslingt das, einmal wiederholt).
 *
 * Wirft nie wegen eines Netz- oder Serverfehlers: Abmelden darf daran nicht
 * scheitern. Supabase wirft bei solchen Fehlern nicht, sondern liefert
 * `{ error }` — das wird gelesen. Liefert `true`, wenn beides gelungen ist
 * (oder es nichts zu tun gab), sonst `false`: dann kann die Seite einen Hinweis
 * zeigen. Ein beim Browser abgemeldetes Abo ist tot, der Server räumt seine
 * Zeile beim nächsten Versuch (404/410) selbst weg. Gefährlich ist nur, wenn
 * beides scheitert: dann bliebe ein lebendes Abo des alten Kontos stehen.
 */
export async function ausschalten(sb: SupabaseClient, u: PushUmgebung = browserUmgebung()): Promise<boolean> {
	if (!u.hatPush) return true;
	const abo = await aktuellesAbo(u);
	if (!abo) return true;
	const serverOk = await serverAboLoeschen(sb, abo.endpoint);
	const browserOk = (await browserAbmelden(abo)) || (await browserAbmelden(abo));
	return serverOk && browserOk;
}

/** Beim App-Start: erteilte Berechtigung + vorhandenes Abo → Schlüssel und `last_seen_at` auffrischen. */
export async function abgleichen(sb: SupabaseClient, u: PushUmgebung = browserUmgebung()): Promise<void> {
	try {
		if (!u.hatPush || u.berechtigung() !== 'granted') return;
		const abo = await aktuellesAbo(u);
		// Ein Abo mit fremdem Schlüssel nicht auffrischen: es wäre auf dem Server „lebendig" und tot.
		if (abo && schluesselPasst(abo)) await speichern(sb, abo, u);
	} catch {
		// still: nächster Start versucht es wieder
	}
}

/**
 * Meldet das Konto ab und löscht vorher das Abo dieses Geräts.
 *
 * Das Abo gehört zum Konto: bliebe es, bekäme dieses Handy weiter Meldungen,
 * auch wenn dort danach jemand anderes angemeldet ist. Es muss VOR `signOut`
 * weg, weil die RPC die Sitzung braucht. Fehler und Wartezeit (hängende Netz-
 * oder Service-Worker-Anfrage, höchstens `fristMs`) blockieren das Abmelden nie.
 */
export async function abmelden(sb: SupabaseClient, u: PushUmgebung = browserUmgebung(), fristMs = 5000): Promise<void> {
	await mitFrist(ausschalten(sb, u), fristMs).catch(() => undefined);
	await sb.auth.signOut();
}
