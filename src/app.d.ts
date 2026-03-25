import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';

declare global {
	namespace App {
		interface Locals {
			supabase: SupabaseClient<Database>;
			safeGetSession: () => Promise<{ session: Session | null; user: User | null }>;
			session: Session | null;
			user: User | null;
		}
		interface Error {
			message: string;
			stack?: string;
			status?: number;
		}
		interface PageData {
			session: Session | null;
			user: User | null;
		}
	}
}

export {};
