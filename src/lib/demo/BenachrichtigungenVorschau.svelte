<script lang="ts">
	import { page } from '$app/state';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import TfRoot from '$lib/components/tf/TfRoot.svelte';
	import BenachrichtigungenSeite from '$lib/components/tf/BenachrichtigungenSeite.svelte';
	import { theme } from '$lib/stores/tf/theme.svelte';
	import type { Berechtigung, PushUmgebung } from '$lib/push/abo';
	import { geteilteListen } from '$lib/push/seite';
	import { DEMO_FREIGABEN, DEMO_ICH, DEMO_LISTEN } from '$lib/demo/fixtures';

	/**
	 * Inhalt der Dev-Vorschau von „Benachrichtigungen" — dieselbe Seitenkomponente
	 * wie `/app/benachrichtigungen`, aber mit Demodaten und einer ersetzten
	 * Browser-Umgebung. So lässt sich jeder Zustand ohne echte Berechtigung,
	 * ohne Push-Dienst und ohne Datenbank ansehen. Nichts davon erreicht das
	 * Produktionsbündel (siehe `routes/vorschau/benachrichtigungen/+page.svelte`).
	 *
	 * Abfrageparameter:
	 *   status=aus|an|verweigert|nicht-unterstuetzt   (Standard: aus)
	 *   anfrage=denied     der Dialog wird abgelehnt (statt erlaubt)
	 *   fehler=1           Server-Aufrufe schlagen fehl (Toast, Rücknahme)
	 *   keine=1            keine geteilten Listen
	 *   stumm=<id>,<id>    diese Listen sind stumm (z. B. l-einkaufen)
	 *   dunkel=1           dunkles Theme
	 */
	const p = page.url.searchParams;
	const startStatus = p.get('status') ?? 'aus';
	const abgelehnt = p.get('anfrage') === 'denied';
	const serverFehler = p.get('fehler') === '1';
	const keine = p.get('keine') === '1';
	const stummIds = (p.get('stumm') ?? '').split(',').filter(Boolean);

	if (p.get('dunkel') === '1') theme.set(true);
	else theme.set(false);

	const listen = keine ? [] : geteilteListen(DEMO_LISTEN, DEMO_FREIGABEN, DEMO_ICH.id);

	let berechtigung: Berechtigung =
		startStatus === 'verweigert' ? 'denied' : startStatus === 'an' ? 'granted' : 'default';
	let aktuell: { endpoint: string; getKey: (name: string) => ArrayBuffer; unsubscribe: () => Promise<boolean> } | null =
		null;
	const abo = {
		endpoint: 'https://push.example.test/demo',
		getKey: () => new Uint8Array([1, 2, 3]).buffer,
		unsubscribe: async () => {
			aktuell = null;
			return true;
		}
	};
	if (startStatus === 'an') aktuell = abo;

	const umgebung: PushUmgebung = {
		hatPush: startStatus !== 'nicht-unterstuetzt',
		berechtigung: () => berechtigung,
		berechtigungAnfragen: async () => {
			berechtigung = abgelehnt ? 'denied' : 'granted';
			return berechtigung;
		},
		registrierung: async () =>
			({
				pushManager: {
					getSubscription: async () => aktuell,
					subscribe: async () => (aktuell = abo)
				}
			}) as unknown as ServiceWorkerRegistration,
		userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36',
		standalone: true,
		ausApp: true
	};

	// Attrappe: nur, was die Seite aufruft. Alles läuft im Speicher dieses Tabs.
	const antwort = async () => ({ error: serverFehler ? { message: 'Vorschau-Fehler' } : null });
	const attrappe = {
		rpc: async () => antwort(),
		from: () => ({
			insert: async () => antwort(),
			delete: () => {
				const kette = {
					eq: () => kette,
					then: (ok: (v: unknown) => unknown) => antwort().then(ok)
				};
				return kette;
			}
		})
	} as unknown as SupabaseClient;
</script>

<TfRoot>
	<BenachrichtigungenSeite supabase={attrappe} benutzerId={DEMO_ICH.id} {listen} {stummIds} {umgebung} />
</TfRoot>
