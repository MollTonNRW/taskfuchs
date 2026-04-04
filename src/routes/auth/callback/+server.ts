import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
	const code = url.searchParams.get('code');

	if (code) {
		const { error } = await supabase.auth.exchangeCodeForSession(code);
		if (error) {
			redirect(303, '/auth/login?error=callback_failed');
		}
	} else {
		redirect(303, '/auth/login?error=callback_failed');
	}

	redirect(303, '/app');
};
