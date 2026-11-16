import type { Database } from '$lib/types/database';
import { fristenAusZeile, geteilteListen } from '$lib/push/seite';
import type { PageLoad } from './$types';

type List = Database['public']['Tables']['lists']['Row'];

export const load: PageLoad = async ({ parent }) => {
	const { supabase, user } = await parent();
	const benutzerId: string | null = user?.id ?? null;

	// Alles, was RLS durchlässt: eigene und mit mir geteilte Listen, deren
	// Freigaben (für „ist die Liste geteilt?"), meine Stummschaltungen und
	// meine Einstellungen der Erinnerungen an Fristen (keine Zeile = Standard).
	const [listsResult, sharesResult, mutesResult, fristenResult] = await Promise.all([
		supabase.from('lists').select('*').order('position', { ascending: true }),
		supabase.from('list_shares').select('list_id, user_id'),
		supabase.from('list_notification_mutes').select('list_id'),
		supabase.from('push_fristen_einstellungen').select('aktiv, uhrzeit, vortag, vorlauf').maybeSingle()
	]);

	const lists = (listsResult.data ?? []) as List[];
	const shares = (sharesResult.data ?? []) as { list_id: string; user_id: string }[];

	return {
		benutzerId,
		listen: geteilteListen(lists, shares, benutzerId),
		stummIds: (mutesResult.data ?? []).map((m: { list_id: string }) => m.list_id),
		fristen: fristenAusZeile(fristenResult.data)
	};
};
