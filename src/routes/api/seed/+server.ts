import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { seedDemoData } from '$lib/seed-data';

export const POST: RequestHandler = async ({ locals }) => {
	const { session, user } = await locals.safeGetSession();
	if (!session || !user) {
		return json({ error: 'Nicht eingeloggt' }, { status: 401 });
	}

	const seeded = await seedDemoData(locals.supabase, user.id, true);
	if (seeded) {
		return json({ success: true, message: 'Demo-Daten eingefügt' });
	}
	return json({ success: false, message: 'Seed fehlgeschlagen' });
};
