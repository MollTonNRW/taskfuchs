import type { Database } from '$lib/types/database';

type List = Database['public']['Tables']['lists']['Row'];
type Task = Database['public']['Tables']['tasks']['Row'];

export async function load({ parent }: { parent: () => Promise<any> }) {
	const { supabase, user } = await parent();

	const [listsResult, tasksResult] = await Promise.all([
		supabase
			.from('lists')
			.select('*')
			.order('position', { ascending: true }),
		supabase
			.from('tasks')
			.select('*')
			.order('position', { ascending: true })
	]);

	return {
		lists: (listsResult.data ?? []) as List[],
		tasks: (tasksResult.data ?? []) as Task[],
		user
	};
}
