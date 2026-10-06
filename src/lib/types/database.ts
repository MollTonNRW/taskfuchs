export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/** Listentyp — 'einkauf' schaltet den Einkaufs-Modus ein (Migration 026). */
export type ListKind = 'aufgaben' | 'einkauf';

export interface Database {
	public: {
		Tables: {
			lists: {
				Row: {
					id: string;
					user_id: string;
					title: string;
					icon: string;
					position: number;
					visible: boolean;
					kind: ListKind;
					created_at: string;
					updated_at: string;
					version: number;
				};
				Insert: {
					id?: string;
					user_id: string;
					title?: string;
					icon?: string;
					position?: number;
					visible?: boolean;
					kind?: ListKind;
					created_at?: string;
					updated_at?: string;
					version?: number;
				};
				Update: {
					id?: string;
					user_id?: string;
					title?: string;
					icon?: string;
					position?: number;
					visible?: boolean;
					kind?: ListKind;
					updated_at?: string;
					version?: number;
				};
				Relationships: [];
			};
			tasks: {
				Row: {
					id: string;
					list_id: string;
					user_id: string;
					text: string;
					done: boolean;
					priority: 'low' | 'normal' | 'high' | 'asap';
					timeframe: 'akut' | 'zeitnah' | 'mittelfristig' | 'langfristig' | null;
					highlighted: boolean;
					pinned: boolean;
					pinned_by: string | null;
					emoji: string | null;
					note: string | null;
					due_date: string | null;
					position: number;
					type: 'task' | 'divider';
					divider_label: string | null;
					parent_id: string | null;
					assigned_to: string | null;
					calendar_event_id: string | null;
					abgelegt: boolean;
					created_at: string;
					updated_at: string;
					version: number;
				};
				Insert: {
					id?: string;
					list_id: string;
					user_id: string;
					text?: string;
					done?: boolean;
					priority?: 'low' | 'normal' | 'high' | 'asap';
					timeframe?: 'akut' | 'zeitnah' | 'mittelfristig' | 'langfristig' | null;
					highlighted?: boolean;
					pinned?: boolean;
					pinned_by?: string | null;
					emoji?: string | null;
					note?: string | null;
					due_date?: string | null;
					position?: number;
					type?: 'task' | 'divider';
					divider_label?: string | null;
					parent_id?: string | null;
					assigned_to?: string | null;
					calendar_event_id?: string | null;
					abgelegt?: boolean;
					created_at?: string;
					updated_at?: string;
					version?: number;
				};
				Update: {
					id?: string;
					list_id?: string;
					user_id?: string;
					text?: string;
					done?: boolean;
					priority?: 'low' | 'normal' | 'high' | 'asap';
					timeframe?: 'akut' | 'zeitnah' | 'mittelfristig' | 'langfristig' | null;
					highlighted?: boolean;
					pinned?: boolean;
					pinned_by?: string | null;
					emoji?: string | null;
					note?: string | null;
					due_date?: string | null;
					position?: number;
					type?: 'task' | 'divider';
					divider_label?: string | null;
					parent_id?: string | null;
					assigned_to?: string | null;
					calendar_event_id?: string | null;
					abgelegt?: boolean;
					updated_at?: string;
					version?: number;
				};
				Relationships: [
					{
						foreignKeyName: 'tasks_list_id_fkey';
						columns: ['list_id'];
						isOneToOne: false;
						referencedRelation: 'lists';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'tasks_parent_id_fkey';
						columns: ['parent_id'];
						isOneToOne: false;
						referencedRelation: 'tasks';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'tasks_user_id_fkey';
						columns: ['user_id'];
						isOneToOne: false;
						referencedRelation: 'users';
						referencedColumns: ['id'];
					}
				];
			};
			list_shares: {
				Row: {
					id: string;
					list_id: string;
					user_id: string;
					role: 'owner' | 'editor' | 'viewer';
					created_at: string;
				};
				Insert: {
					id?: string;
					list_id: string;
					user_id: string;
					role?: 'owner' | 'editor' | 'viewer';
					created_at?: string;
				};
				Update: {
					id?: string;
					list_id?: string;
					user_id?: string;
					role?: 'owner' | 'editor' | 'viewer';
				};
				Relationships: [
					{
						foreignKeyName: 'list_shares_list_id_fkey';
						columns: ['list_id'];
						isOneToOne: false;
						referencedRelation: 'lists';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'list_shares_user_id_fkey';
						columns: ['user_id'];
						isOneToOne: false;
						referencedRelation: 'users';
						referencedColumns: ['id'];
					}
				];
			};
			/** Aufgabenhistorie (Migration 022) — ersetzt tasks.progress. */
			task_history: {
				Row: {
					id: string;
					task_id: string;
					kind: 'stand' | 'wartet';
					body: string;
					created_by: string | null;
					created_at: string;
					edited_at: string | null;
					edited_by: string | null;
					resolved_at: string | null;
					resolved_by: string | null;
				};
				Insert: {
					id?: string;
					task_id: string;
					kind: 'stand' | 'wartet';
					body: string;
					created_by?: string | null;
					created_at?: string;
					edited_at?: string | null;
					edited_by?: string | null;
					resolved_at?: string | null;
					resolved_by?: string | null;
				};
				Update: {
					id?: string;
					task_id?: string;
					kind?: 'stand' | 'wartet';
					body?: string;
					created_by?: string | null;
					created_at?: string;
					edited_at?: string | null;
					edited_by?: string | null;
					resolved_at?: string | null;
					resolved_by?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'task_history_task_id_fkey';
						columns: ['task_id'];
						isOneToOne: false;
						referencedRelation: 'tasks';
						referencedColumns: ['id'];
					}
				];
			};
			/**
			 * Push-Abos je Gerät (Migration 027). Clients lesen und löschen nur eigene Zeilen;
			 * Schreiben geht ausschließlich über die RPC `push_abo_speichern`.
			 */
			push_subscriptions: {
				Row: {
					id: string;
					user_id: string;
					endpoint: string;
					p256dh: string;
					auth: string;
					geraet: string | null;
					created_at: string;
					last_seen_at: string;
					last_ok_at: string | null;
				};
				Insert: never;
				Update: never;
				Relationships: [];
			};
			/** Stummgeschaltete Listen je Person (Migration 027) — eine Zeile heißt „stumm", Standard ist „an". */
			list_notification_mutes: {
				Row: {
					user_id: string;
					list_id: string;
					created_at: string;
				};
				Insert: {
					user_id: string;
					list_id: string;
					created_at?: string;
				};
				Update: never;
				Relationships: [
					{
						foreignKeyName: 'list_notification_mutes_list_id_fkey';
						columns: ['list_id'];
						isOneToOne: false;
						referencedRelation: 'lists';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'list_notification_mutes_user_id_fkey';
						columns: ['user_id'];
						isOneToOne: false;
						referencedRelation: 'users';
						referencedColumns: ['id'];
					}
				];
			};
			profiles: {
				Row: {
					id: string;
					username: string | null;
					display_name: string | null;
					avatar_url: string | null;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id: string;
					username?: string | null;
					display_name?: string | null;
					avatar_url?: string | null;
				};
				Update: {
					id?: string;
					username?: string | null;
					display_name?: string | null;
					avatar_url?: string | null;
					updated_at?: string;
				};
				Relationships: [];
			};
		};
		Views: {};
		Functions: {
			lookup_user_by_email: {
				Args: { lookup_email: string };
				Returns: string | null;
			};
			/** Verlauf wieder eingefuegter Aufgaben aus dem Papierkorb zurueckholen (Migration 022). */
			restore_task_history: {
				Args: { p_task_ids: string[] };
				Returns: Database['public']['Tables']['task_history']['Row'][];
			};
			/** Push-Abo dieses Geräts anlegen oder übernehmen (Migration 027). */
			push_abo_speichern: {
				Args: { p_endpoint: string; p_p256dh: string; p_auth: string; p_geraet: string | null };
				Returns: undefined;
			};
			/** Eigenes Push-Abo mit diesem Endpoint löschen (Migration 027). */
			push_abo_loeschen: {
				Args: { p_endpoint: string };
				Returns: undefined;
			};
			batch_reorder_lists: {
				Args: { items: string };
				Returns: undefined;
			};
			batch_reorder_tasks: {
				Args: { items: string };
				Returns: undefined;
			};
			batch_reorder_subtasks: {
				Args: { items: string };
				Returns: undefined;
			};
		};
		Enums: {};
		CompositeTypes: {};
	};
}
