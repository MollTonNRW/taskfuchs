import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import BenachrichtigungenSeite from './BenachrichtigungenSeite.svelte';

/**
 * Serverseitig gerendert (SSR), also so, wie das HTML vor der Hydrierung aussieht.
 * `src/routes/+layout.ts` baut auf dem Server einen anonymen Supabase-Client
 * (`cookies: { getAll: () => [] }`); RLS liefert dort leere Listen. Das SSR-HTML
 * darf deshalb keine Aussage über geteilte Listen machen.
 */
function ssr(props: { listen: unknown[]; stummIds?: string[] }) {
	return render(BenachrichtigungenSeite, {
		props: {
			supabase: {} as SupabaseClient,
			benutzerId: 'u-1',
			listen: props.listen as never,
			stummIds: props.stummIds ?? []
		}
	}).body;
}

describe('BenachrichtigungenSeite (serverseitig gerendert)', () => {
	it('behauptet vor der Hydrierung nicht, es gebe keine geteilte Liste', () => {
		const html = ssr({ listen: [] });
		expect(html).not.toContain('noch keine geteilte Liste');
	});

	it('zeigt die Seite selbst (Titel, Gerätestatus)', () => {
		const html = ssr({ listen: [] });
		expect(html).toContain('Benachrichtigungen');
		expect(html).toContain('Dieses Gerät');
	});
});
