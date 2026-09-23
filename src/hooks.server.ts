import { createServerClient } from '@supabase/ssr';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { dev } from '$app/environment';
import { error, type Handle } from '@sveltejs/kit';
import type { Database } from '$lib/types/database';

export const handle: Handle = async ({ event, resolve }) => {
	/**
	 * Riegel vor der Vorschau-Route.
	 *
	 * `/vorschau` ist ein Abnahme- und Vorfuehrartefakt mit Demodaten und
	 * ohne Anmeldung. Der Riegel in `routes/vorschau/+page.ts` greift erst
	 * im Browser, weil die Route `ssr = false` traegt — produktiv lieferte
	 * der Server darum HTTP 200 mit einer leeren Huelle. Hier, vor dem
	 * Routing, wird daraus eine echte 404.
	 */
	if (!dev && event.url.pathname.startsWith('/vorschau')) {
		error(404, 'Nicht gefunden');
	}

	event.locals.supabase = createServerClient<Database>(
		PUBLIC_SUPABASE_URL,
		PUBLIC_SUPABASE_ANON_KEY,
		{
			cookies: {
				getAll: () => event.cookies.getAll(),
				setAll: (cookiesToSet) => {
					cookiesToSet.forEach(({ name, value, options }) => {
						event.cookies.set(name, value, { ...options, path: '/' });
					});
				}
			}
		}
	);

	event.locals.safeGetSession = async () => {
		const {
			data: { session }
		} = await event.locals.supabase.auth.getSession();

		if (!session) return { session: null, user: null };

		const {
			data: { user },
			error
		} = await event.locals.supabase.auth.getUser();

		if (error) return { session: null, user: null };

		return { session, user };
	};

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			return name === 'content-range' || name === 'x-supabase-api-version';
		}
	});
};
