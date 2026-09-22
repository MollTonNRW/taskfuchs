import type { Database } from '$lib/types/database';
import { baueMitnutzer, type Mitnutzer } from '$lib/utils/mitnutzer';

type List = Database['public']['Tables']['lists']['Row'];
type Task = Database['public']['Tables']['tasks']['Row'];
type ListShare = Database['public']['Tables']['list_shares']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'];

type ShareZeile = Pick<ListShare, 'list_id' | 'user_id' | 'role'>;
type ProfilZeile = Pick<Profile, 'id' | 'display_name' | 'username'>;

export async function load({ parent }: { parent: () => Promise<any> }) {
	const { supabase, user } = await parent();

	// Listen, Aufgaben und Freigaben in einem Rutsch. `list_shares` traegt die
	// Avatare der Mitnutzer (Navigationszeile, mobile Uebersicht, Geteilt-Pille
	// im Listen-Header) — ohne sie fehlten sie in der ganzen Oberflaeche.
	//
	// Was RLS durchlaesst (Migration 003): eigene Freigabezeilen plus alle
	// Zeilen zu Listen, die dieser Nutzer besitzt. Fuer eine fremde, mit ihm
	// geteilte Liste sieht er also den Besitzer und sich selbst, nicht aber
	// weitere Mitnutzer. Die Geteilt-Pille zaehlt darum die SICHTBAREN
	// Beteiligten — das ist kein Fehler in der Zuordnung, sondern die Sicht,
	// die die Datenbank erlaubt.
	const [listsResult, tasksResult, sharesResult] = await Promise.all([
		supabase.from('lists').select('*').order('position', { ascending: true }),
		supabase.from('tasks').select('*').order('position', { ascending: true }),
		supabase.from('list_shares').select('list_id, user_id, role')
	]);

	const lists = (listsResult.data ?? []) as List[];
	const shares = (sharesResult.data ?? []) as ShareZeile[];

	// Genau eine Profil-Abfrage fuer alle Beteiligten — Besitzer und Geteilte.
	const beteiligte = new Set<string>();
	for (const l of lists) beteiligte.add(l.user_id);
	for (const s of shares) beteiligte.add(s.user_id);

	const profilesResult = beteiligte.size
		? await supabase.from('profiles').select('id, display_name, username').in('id', [...beteiligte])
		: { data: [] as ProfilZeile[] };

	const mitnutzer: Record<string, Mitnutzer[]> = baueMitnutzer(
		lists,
		shares,
		(profilesResult.data ?? []) as ProfilZeile[],
		user?.id ?? null,
		user?.email ?? null
	);

	return {
		lists,
		tasks: (tasksResult.data ?? []) as Task[],
		mitnutzer,
		user
	};
}
