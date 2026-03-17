export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

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
					emoji: string | null;
					note: string | null;
					due_date: string | null;
					progress: number;
					position: number;
					type: 'task' | 'divider';
					divider_label: string | null;
					parent_id: string | null;
					assigned_to: string | null;
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
					emoji?: string | null;
					note?: string | null;
					due_date?: string | null;
					progress?: number;
					position?: number;
					type?: 'task' | 'divider';
					divider_label?: string | null;
					parent_id?: string | null;
					assigned_to?: string | null;
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
					emoji?: string | null;
					note?: string | null;
					due_date?: string | null;
					progress?: number;
					position?: number;
					type?: 'task' | 'divider';
					divider_label?: string | null;
					parent_id?: string | null;
					assigned_to?: string | null;
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
