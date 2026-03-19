import type { Database } from '$lib/types/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as crud from '$lib/services/supabase-crud';

type List = Database['public']['Tables']['lists']['Row'];
type ListShare = Database['public']['Tables']['list_shares']['Row'];
type Sb = SupabaseClient<Database>;

export type ShareDialogState = { show: boolean; list: List | null; shares: ListShare[] };

export function createShareDialog(
	store: { sb: Sb },
	toasts: { error: (message: string) => void }
) {
	let shareDialog = $state<ShareDialogState>({ show: false, list: null, shares: [] });

	async function openShareDialog(list: List) {
		const { data: shares } = await crud.getListShares(store.sb, list.id);
		shareDialog = { show: true, list, shares: (shares as ListShare[]) ?? [] };
	}

	function close() {
		shareDialog = { show: false, list: null, shares: [] };
	}

	async function shareList(email: string, role: 'editor' | 'viewer') {
		if (!shareDialog.list) return;
		const sb = store.sb;

		const { data: userId, error: lookupErr } = await sb.rpc('lookup_user_by_email', { lookup_email: email });
		if (lookupErr || !userId) {
			toasts.error('Kein Benutzer mit dieser Email gefunden.');
			return;
		}

		const { data: newShare, error } = await crud.createListShare(sb, shareDialog.list.id, userId, role);
		if (error) { console.error('Teilen fehlgeschlagen:', error); toasts.error('Fehler beim Teilen der Liste.'); return; }
		if (newShare) shareDialog = { ...shareDialog, shares: [...shareDialog.shares, newShare as ListShare] };
	}

	async function removeShare(shareId: string) {
		const oldShares = shareDialog.shares;
		shareDialog = { ...shareDialog, shares: shareDialog.shares.filter((s) => s.id !== shareId) };
		const { error } = await crud.deleteListShare(store.sb, shareId);
		if (error) shareDialog = { ...shareDialog, shares: oldShares };
	}

	async function changeShareRole(shareId: string, role: 'editor' | 'viewer') {
		const oldShares = shareDialog.shares;
		shareDialog = { ...shareDialog, shares: shareDialog.shares.map((s) => (s.id === shareId ? { ...s, role } : s)) };
		const { error } = await crud.updateShareRole(store.sb, shareId, role);
		if (error) shareDialog = { ...shareDialog, shares: oldShares };
	}

	return {
		get shareDialog() { return shareDialog; },
		set shareDialog(v: ShareDialogState) { shareDialog = v; },
		openShareDialog,
		close,
		shareList,
		removeShare,
		changeShareRole
	};
}
