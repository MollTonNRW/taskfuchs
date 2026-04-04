import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
	const code = url.searchParams.get('code');

	if (code) {
		const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code);
		if (error) {
			redirect(303, '/auth/login?error=callback_failed');
		}

		// Google Calendar Tokens in DB speichern
		// Nur upserten wenn provider_refresh_token vorhanden ist (erster Login),
		// damit bei nachfolgenden Logins der gespeicherte Refresh-Token nicht ueberschrieben wird
		if (sessionData?.session) {
			const session = sessionData.session;
			if (session.provider_token && session.provider_refresh_token) {
				await supabase.from('user_google_tokens' as any).upsert(
					{
						user_id: session.user.id,
						access_token: session.provider_token,
						refresh_token: session.provider_refresh_token,
						token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString()
					},
					{ onConflict: 'user_id' }
				);
			} else if (session.provider_token) {
				// Nur Access-Token aktualisieren, Refresh-Token behalten
				await supabase.from('user_google_tokens' as any).update(
					{
						access_token: session.provider_token,
						token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString()
					}
				).eq('user_id', session.user.id);
			}
		}
	} else {
		redirect(303, '/auth/login?error=callback_failed');
	}

	redirect(303, '/app');
};
