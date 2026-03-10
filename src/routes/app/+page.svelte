<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import type { Database } from '$lib/types/database';
	import ListPanel from '$lib/components/ListPanel.svelte';
	import ContextMenu from '$lib/components/ContextMenu.svelte';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import { listsStore } from '$lib/stores/lists';

	type List = Database['public']['Tables']['lists']['Row'];
	type Task = Database['public']['Tables']['tasks']['Row'];

	let { data } = $props();

	let lists = $state<List[]>([]);
	let tasks = $state<Task[]>([]);
	let activeListIndex = $state(0);

	// Sync from server data
	$effect(() => {
		lists = data.lists as List[];
		tasks = data.tasks as Task[];
	});

	// Keep shared store in sync for sidebar
	$effect(() => {
		listsStore.set(lists);
	});

	function tasksForList(listId: string): Task[] {
		return tasks.filter((t) => t.list_id === listId);
	}

	// Helper to get typed supabase client
	function getSupabase(): SupabaseClient<Database> {
		return data.supabase as SupabaseClient<Database>;
	}

	// ==========================================
	// Realtime Subscriptions
	// ==========================================
	onMount(() => {
		const sb = getSupabase();

		const listsChannel = sb
			.channel('lists-realtime')
			.on(
				'postgres_changes' as any,
				{ event: '*', schema: 'public', table: 'lists' },
				(payload: any) => {
					if (payload.eventType === 'INSERT') {
						const newList = payload.new as List;
						if (!lists.some((l) => l.id === newList.id)) {
							lists = [...lists, newList];
						}
					} else if (payload.eventType === 'UPDATE') {
						const updated = payload.new as List;
						lists = lists.map((l) => (l.id === updated.id ? updated : l));
					} else if (payload.eventType === 'DELETE') {
						const old = payload.old as { id: string };
						lists = lists.filter((l) => l.id !== old.id);
					}
				}
			)
			.subscribe();

		const tasksChannel = sb
			.channel('tasks-realtime')
			.on(
				'postgres_changes' as any,
				{ event: '*', schema: 'public', table: 'tasks' },
				(payload: any) => {
					if (payload.eventType === 'INSERT') {
						const newTask = payload.new as Task;
						if (!tasks.some((t) => t.id === newTask.id)) {
							tasks = [...tasks, newTask];
						}
					} else if (payload.eventType === 'UPDATE') {
						const updated = payload.new as Task;
						tasks = tasks.map((t) => (t.id === updated.id ? updated : t));
					} else if (payload.eventType === 'DELETE') {
						const old = payload.old as { id: string };
						tasks = tasks.filter((t) => t.id !== old.id);
					}
				}
			)
			.subscribe();

		return () => {
			sb.removeChannel(listsChannel);
			sb.removeChannel(tasksChannel);
		};
	});

	// ==========================================
	// LIST CRUD
	// ==========================================
	async function createList() {
		const sb = getSupabase();
		const position = lists.length;
		const { data: newList, error } = await sb
			.from('lists')
			.insert({ user_id: data.user!.id, title: 'Neue Liste', position })
			.select()
			.single();

		if (error) {
			console.error('Liste erstellen fehlgeschlagen:', error);
			alert('Fehler beim Erstellen der Liste: ' + error.message);
			return;
		}

		if (newList) {
			lists = [...lists, newList as List];
			activeListIndex = lists.length - 1;
		}
	}

	async function renameList(id: string, title: string) {
		const oldLists = lists;
		lists = lists.map((l) => (l.id === id ? { ...l, title } : l));
		const { error } = await getSupabase().from('lists').update({ title }).eq('id', id);
		if (error) lists = oldLists;
	}

	async function deleteList(id: string) {
		if (!confirm('Liste wirklich loeschen? Alle Aufgaben werden geloescht.')) return;
		const oldLists = lists;
		const oldTasks = tasks;
		const oldIndex = activeListIndex;
		lists = lists.filter((l) => l.id !== id);
		tasks = tasks.filter((t) => t.list_id !== id);
		if (activeListIndex >= lists.length) activeListIndex = Math.max(0, lists.length - 1);
		const { error } = await getSupabase().from('lists').delete().eq('id', id);
		if (error) {
			lists = oldLists;
			tasks = oldTasks;
			activeListIndex = oldIndex;
		}
	}

	async function changeListIcon(id: string, icon: string) {
		const oldLists = lists;
		lists = lists.map((l) => (l.id === id ? { ...l, icon } : l));
		const { error } = await getSupabase().from('lists').update({ icon }).eq('id', id);
		if (error) lists = oldLists;
	}

	// ==========================================
	// TASK CRUD
	// ==========================================
	async function addTask(listId: string, text: string) {
		const sb = getSupabase();
		const listTasks = tasks.filter((t) => t.list_id === listId && !t.parent_id);
		const position = listTasks.length;

		const optimisticTask: Task = {
			id: crypto.randomUUID(),
			list_id: listId,
			user_id: data.user!.id,
			parent_id: null,
			text,
			type: 'task',
			divider_label: null,
			done: false,
			priority: 'normal',
			timeframe: null,
			highlighted: false,
			pinned: false,
			emoji: null,
			note: null,
			due_date: null,
			progress: 0,
			position,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
			version: 1
		};

		tasks = [...tasks, optimisticTask];

		const { data: newTask, error } = await sb
			.from('tasks')
			.insert({ list_id: listId, user_id: data.user!.id, text, position })
			.select()
			.single();

		if (error) {
			console.error('Aufgabe erstellen fehlgeschlagen:', error);
			tasks = tasks.filter((t) => t.id !== optimisticTask.id);
			return;
		}

		if (newTask) {
			tasks = tasks.map((t) => (t.id === optimisticTask.id ? (newTask as Task) : t));
		}
	}

	async function toggleTask(id: string, done: boolean) {
		const sb = getSupabase();
		const oldTasks = tasks;
		tasks = tasks.map((t) => (t.id === id ? { ...t, done } : t));

		// Checkbox propagation: parent check → all subtasks checked
		if (done) {
			const subtaskIds = tasks.filter((t) => t.parent_id === id).map((t) => t.id);
			if (subtaskIds.length > 0) {
				tasks = tasks.map((t) => (subtaskIds.includes(t.id) ? { ...t, done: true } : t));
				const { error: subError } = await sb.from('tasks').update({ done: true }).in('id', subtaskIds);
				if (subError) { tasks = oldTasks; return; }
			}
		}

		const { error } = await sb.from('tasks').update({ done }).eq('id', id);
		if (error) { tasks = oldTasks; return; }

		// Reverse propagation: if all subtasks done → auto-check parent
		const task = tasks.find((t) => t.id === id);
		if (task?.parent_id) {
			const siblings = tasks.filter((t) => t.parent_id === task.parent_id);
			const allDone = siblings.every((t) => t.done);
			const parent = tasks.find((t) => t.id === task.parent_id);
			if (parent && parent.done !== allDone) {
				tasks = tasks.map((t) => (t.id === parent.id ? { ...t, done: allDone } : t));
				await sb.from('tasks').update({ done: allDone }).eq('id', parent.id);
			}
		}
	}

	async function updateTask(id: string, text: string) {
		tasks = tasks.map((t) => (t.id === id ? { ...t, text } : t));
		await getSupabase().from('tasks').update({ text }).eq('id', id);
	}

	async function deleteTask(id: string) {
		if (!confirm('Aufgabe wirklich loeschen?')) return;
		const oldTasks = tasks;
		tasks = tasks.filter((t) => t.id !== id && t.parent_id !== id);
		const { error } = await getSupabase().from('tasks').delete().eq('id', id);
		if (error) tasks = oldTasks;
	}

	type Priority = 'low' | 'normal' | 'high' | 'asap';

	async function changeTaskPriority(id: string, priority: Priority) {
		const oldTasks = tasks;
		tasks = tasks.map((t) => (t.id === id ? { ...t, priority } : t));
		const { error } = await getSupabase().from('tasks').update({ priority }).eq('id', id);
		if (error) tasks = oldTasks;
	}

	// ==========================================
	// SUBTASK CRUD
	// ==========================================
	async function addSubtask(parentId: string, text: string) {
		const sb = getSupabase();
		const parentTask = tasks.find((t) => t.id === parentId);
		if (!parentTask) return;

		const siblings = tasks.filter((t) => t.parent_id === parentId);
		const position = siblings.length;

		const optimisticSub: Task = {
			id: crypto.randomUUID(),
			list_id: parentTask.list_id,
			user_id: data.user!.id,
			parent_id: parentId,
			text,
			type: 'task',
			divider_label: null,
			done: false,
			priority: 'normal',
			timeframe: null,
			highlighted: false,
			pinned: false,
			emoji: null,
			note: null,
			due_date: null,
			progress: 0,
			position,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
			version: 1
		};

		tasks = [...tasks, optimisticSub];

		const { data: newSub, error } = await sb
			.from('tasks')
			.insert({
				list_id: parentTask.list_id,
				user_id: data.user!.id,
				parent_id: parentId,
				text,
				position
			})
			.select()
			.single();

		if (newSub && !error) {
			tasks = tasks.map((t) => (t.id === optimisticSub.id ? (newSub as Task) : t));
		} else if (error) {
			tasks = tasks.filter((t) => t.id !== optimisticSub.id);
		}
	}

	async function toggleSubtask(id: string, done: boolean) {
		const sb = getSupabase();
		const oldTasks = tasks;
		tasks = tasks.map((t) => (t.id === id ? { ...t, done } : t));
		const { error } = await sb.from('tasks').update({ done }).eq('id', id);
		if (error) { tasks = oldTasks; return; }

		// Reverse propagation: if all subtasks done → auto-check parent
		const subtask = tasks.find((t) => t.id === id);
		if (subtask?.parent_id) {
			const siblings = tasks.filter((t) => t.parent_id === subtask.parent_id);
			const allDone = siblings.every((t) => t.done);
			const parent = tasks.find((t) => t.id === subtask.parent_id);
			if (parent && parent.done !== allDone) {
				tasks = tasks.map((t) => (t.id === parent.id ? { ...t, done: allDone } : t));
				await sb.from('tasks').update({ done: allDone }).eq('id', parent.id);
			}
		}
	}

	async function updateSubtask(id: string, text: string) {
		tasks = tasks.map((t) => (t.id === id ? { ...t, text } : t));
		await getSupabase().from('tasks').update({ text }).eq('id', id);
	}

	async function deleteSubtask(id: string) {
		tasks = tasks.filter((t) => t.id !== id);
		await getSupabase().from('tasks').delete().eq('id', id);
	}

	// ==========================================
	// CONTEXT MENU
	// ==========================================
	type ContextMenuState = {
		show: boolean;
		x: number;
		y: number;
		items: { label: string; icon?: string; action: () => void; danger?: boolean; divider?: boolean }[];
	};

	let contextMenu = $state<ContextMenuState>({ show: false, x: 0, y: 0, items: [] });

	function handleListContext(e: MouseEvent, list: List) {
		e.preventDefault();
		contextMenu = {
			show: true,
			x: e.clientX,
			y: e.clientY,
			items: [
				{ label: 'Neue Aufgabe', icon: '➕', action: () => addTask(list.id, 'Neue Aufgabe') },
				{ label: 'Liste umbenennen', icon: '✏️', action: () => { /* handled via ListPanel */ } },
				{ label: 'Liste loeschen', icon: '🗑️', action: () => deleteList(list.id), danger: true, divider: true }
			]
		};
	}

	function handleTaskContext(e: MouseEvent, task: Task) {
		e.preventDefault();
		contextMenu = {
			show: true,
			x: e.clientX,
			y: e.clientY,
			items: [
				{ label: 'Unteraufgabe', icon: '➕', action: () => addSubtask(task.id, 'Neue Unteraufgabe') },
				{ label: task.done ? 'Nicht erledigt' : 'Erledigt', icon: task.done ? '⬜' : '✅', action: () => toggleTask(task.id, !task.done) },
				{ label: 'Loeschen', icon: '🗑️', action: () => { tasks = tasks.filter((t) => t.id !== task.id && t.parent_id !== task.id); getSupabase().from('tasks').delete().eq('id', task.id); }, danger: true, divider: true }
			]
		};
	}
</script>

<svelte:head>
	<title>TaskFuchs</title>
</svelte:head>

{#if contextMenu.show}
	<ContextMenu
		items={contextMenu.items}
		x={contextMenu.x}
		y={contextMenu.y}
		onClose={() => (contextMenu = { ...contextMenu, show: false })}
	/>
{/if}

<div class="max-w-7xl mx-auto p-4 md:p-6">
	{#if lists.length === 0}
		<!-- Empty State -->
		<div class="flex flex-col items-center justify-center py-20">
			<span class="text-6xl mb-4">🦊</span>
			<h2 class="text-xl font-semibold mb-2">Willkommen bei TaskFuchs!</h2>
			<p class="text-base-content/60 mb-6 text-center max-w-sm">
				Erstelle deine erste Liste, um loszulegen.
			</p>
			<button onclick={createList} class="btn btn-primary gap-2">
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
				</svg>
				Erste Liste erstellen
			</button>
		</div>
	{:else}
		<!-- Mobile: Tab Navigation -->
		<div class="md:hidden mb-4 -mx-4 px-4 sticky top-[57px] z-20 bg-base-100/90 backdrop-blur-sm border-b border-base-300/50 pb-2 pt-2">
			<div class="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
				{#each lists as list, i (list.id)}
					<button
						onclick={() => (activeListIndex = i)}
						class="btn btn-sm {i === activeListIndex ? 'btn-primary' : 'btn-ghost'} whitespace-nowrap flex-shrink-0"
					>
						{list.icon} {list.title}
					</button>
				{/each}
				<button onclick={createList} class="btn btn-sm btn-ghost text-primary flex-shrink-0" aria-label="Neue Liste erstellen">
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
					</svg>
				</button>
			</div>
		</div>

		<!-- Mobile: Single List View -->
		<div class="md:hidden">
			{#if lists[activeListIndex]}
				{#key activeListIndex}
					<div in:fade={{ duration: 150, delay: 50 }} out:fade={{ duration: 100 }}>
						<ListPanel
							list={lists[activeListIndex]}
							tasks={tasksForList(lists[activeListIndex].id)}
							onRename={renameList}
							onDelete={deleteList}
							onIconChange={changeListIcon}
							onAddTask={addTask}
							onToggleTask={toggleTask}
							onUpdateTask={updateTask}
							onDeleteTask={deleteTask}
							onAddSubtask={addSubtask}
							onToggleSubtask={toggleSubtask}
							onUpdateSubtask={updateSubtask}
							onDeleteSubtask={deleteSubtask}
							onChangePriority={changeTaskPriority}
							onListContext={(e) => handleListContext(e, lists[activeListIndex])}
							onTaskContext={handleTaskContext}
						/>
					</div>
				{/key}
			{/if}
		</div>

		<!-- Desktop: Side by Side -->
		<div class="hidden md:flex gap-4 overflow-x-auto pb-4">
			{#each lists as list (list.id)}
				<ListPanel
					{list}
					tasks={tasksForList(list.id)}
					onRename={renameList}
					onDelete={deleteList}
					onIconChange={changeListIcon}
					onAddTask={addTask}
					onToggleTask={toggleTask}
					onUpdateTask={updateTask}
					onDeleteTask={deleteTask}
					onAddSubtask={addSubtask}
					onToggleSubtask={toggleSubtask}
					onUpdateSubtask={updateSubtask}
					onDeleteSubtask={deleteSubtask}
					onChangePriority={changeTaskPriority}
					onListContext={(e) => handleListContext(e, list)}
					onTaskContext={handleTaskContext}
				/>
			{/each}

			<!-- Add List Button (Desktop) -->
			<div class="w-[360px] min-w-[280px] flex-shrink-0">
				<button
					onclick={createList}
					class="w-full h-32 card bg-base-200/50 border-2 border-dashed border-base-300 hover:border-primary/50 hover:bg-base-200 transition-all flex items-center justify-center gap-2 text-base-content/50 hover:text-primary cursor-pointer"
				>
					<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
					</svg>
					<span class="font-medium">Neue Liste</span>
				</button>
			</div>
		</div>
	{/if}
</div>
