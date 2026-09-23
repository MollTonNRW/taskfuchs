import type { Database } from '$lib/types/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as crud from '$lib/services/supabase-crud';
import { baueMitnutzer, type Mitnutzer } from '$lib/utils/mitnutzer';

type List = Database['public']['Tables']['lists']['Row'];
type ListShare = Database['public']['Tables']['list_shares']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'];
type Sb = SupabaseClient<Database>;

export type ShareDialogState = {
	show: boolean;
	list: List | null;
	shares: ListShare[];
	/** Anzeigefertig: Besitzer zuerst, danach die Geteilten. Nie eine UUID. */
	beteiligte: Mitnutzer[];
	/** Anker des ausloesenden Knopfes (rechte Kante, Unterkante). */
	x: number;
	y: number;
};

const LEER: ShareDialogState = { show: false, list: null, shares: [], beteiligte: [], x: 0, y: 0 };

/**
 * Der Teilen-Dialog samt Aufloesung der Anzeigenamen.
 *
 * Die v2-Fassung reichte nur die rohen `list_shares` weiter — der Dialog
 * zeigte darum die Benutzer-UUID als Namen. Hier werden die zugehoerigen
 * `profiles` mitgeladen und durch `baueMitnutzer` geschickt: Anzeigename,
 * sonst E-Mail, niemals die ID (Spezifikation Abschnitt 9).
 *
 * `onBeteiligte` meldet jede Aenderung nach aussen, damit die Avatare in
 * Navigationsspalte, mobiler Uebersicht und Geteilt-Pille ohne Neuladen
 * mitziehen (T5b hatte das offen gelassen).
 */
export function createShareDialog(
	store: { sb: Sb; eigeneId: string | null; eigeneEmail: string | null },
	toasts: { error: (message: string) => void },
	onBeteiligte?: (listId: string, beteiligte: Mitnutzer[]) => void
) {
	let shareDialog = $state<ShareDialogState>({ ...LEER });

	/** Namen fuer Besitzer + Geteilte nachladen und anzeigefertig machen. */
	async function aufloesen(list: List, shares: ListShare[]): Promise<Mitnutzer[]> {
		const ids = [...new Set([list.user_id, ...shares.map((s) => s.user_id)])];
		const { data: profiles } = await crud.getProfilesByIds(store.sb, ids);
		const zuordnung = baueMitnutzer([list], shares, (profiles ?? []) as Profile[], store.eigeneId, store.eigeneEmail);
		return zuordnung[list.id] ?? [];
	}

	/** Nach jeder Aenderung: Namen neu aufloesen und nach aussen melden. */
	async function nachfuehren(list: List, shares: ListShare[]) {
		const beteiligte = await aufloesen(list, shares);
		if (shareDialog.list?.id === list.id) shareDialog = { ...shareDialog, shares, beteiligte };
		onBeteiligte?.(list.id, beteiligte);
	}

	async function openShareDialog(list: List, x: number, y: number) {
		const { data } = await crud.getListShares(store.sb, list.id);
		const shares = (data as ListShare[]) ?? [];
		shareDialog = { show: true, list, shares, beteiligte: [], x, y };
		const beteiligte = await aufloesen(list, shares);
		if (shareDialog.list?.id === list.id) shareDialog = { ...shareDialog, beteiligte };
	}

	function close() {
		shareDialog = { ...LEER };
	}

	async function shareList(email: string, role: 'editor' | 'viewer') {
		const list = shareDialog.list;
		if (!list) return;
		const sb = store.sb;

		const { data: userId, error: lookupErr } = await sb.rpc('lookup_user_by_email', {
			lookup_email: email
		});
		if (lookupErr || !userId) {
			toasts.error('Kein Benutzer mit dieser E-Mail gefunden.');
			return;
		}

		const { data: newShare, error } = await crud.createListShare(sb, list.id, userId, role);
		if (error) {
			console.error('Teilen fehlgeschlagen:', error);
			toasts.error('Fehler beim Teilen der Liste.');
			return;
		}
		if (newShare) await nachfuehren(list, [...shareDialog.shares, newShare as ListShare]);
	}

	async function removeShare(shareId: string) {
		const list = shareDialog.list;
		if (!list) return;
		const alte = shareDialog.shares;
		const neue = alte.filter((s) => s.id !== shareId);
		await nachfuehren(list, neue);
		const { error } = await crud.deleteListShare(store.sb, shareId);
		if (error) await nachfuehren(list, alte);
	}

	async function changeShareRole(shareId: string, role: 'editor' | 'viewer') {
		const list = shareDialog.list;
		if (!list) return;
		const alte = shareDialog.shares;
		const neue = alte.map((s) => (s.id === shareId ? { ...s, role } : s));
		await nachfuehren(list, neue);
		const { error } = await crud.updateShareRole(store.sb, shareId, role);
		if (error) await nachfuehren(list, alte);
	}

	return {
		get shareDialog() {
			return shareDialog;
		},
		set shareDialog(v: ShareDialogState) {
			shareDialog = v;
		},
		openShareDialog,
		close,
		shareList,
		removeShare,
		changeShareRole
	};
}
