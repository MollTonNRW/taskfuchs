<script lang="ts">
	import { slide, fade } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import type { Database } from '$lib/types/database';
	import TaskItem from './TaskItem.svelte';
	import QuickAdd from './QuickAdd.svelte';

	type List = Database['public']['Tables']['lists']['Row'];
	type Task = Database['public']['Tables']['tasks']['Row'];

	let {
		list,
		tasks,
		onRename,
		onDelete,
		onIconChange,
		onAddTask,
		onToggleTask,
		onUpdateTask,
		onDeleteTask,
		onAddSubtask,
		onToggleSubtask,
		onUpdateSubtask,
		onDeleteSubtask,
		onChangePriority,
		onListContext,
		onTaskContext
	}: {
		list: List;
		tasks: Task[];
		onRename: (id: string, title: string) => void;
		onDelete: (id: string) => void;
		onIconChange: (id: string, icon: string) => void;
		onAddTask: (listId: string, text: string) => void;
		onToggleTask: (id: string, done: boolean) => void;
		onUpdateTask: (id: string, text: string) => void;
		onDeleteTask: (id: string) => void;
		onAddSubtask: (parentId: string, text: string) => void;
		onToggleSubtask: (id: string, done: boolean) => void;
		onUpdateSubtask: (id: string, text: string) => void;
		onDeleteSubtask: (id: string) => void;
		onChangePriority: (id: string, priority: 'low' | 'normal' | 'high' | 'asap') => void;
		onListContext?: (e: MouseEvent) => void;
		onTaskContext?: (e: MouseEvent, task: Task) => void;
	} = $props();

	let editingTitle = $state(false);
	let titleText = $state('');
	let menuOpen = $state(false);
	let showDone = $state(false);

	let topLevelTasks = $derived(tasks.filter((t) => !t.parent_id && t.type === 'task'));
	let activeTasks = $derived(topLevelTasks.filter((t) => !t.done));
	let doneTasks = $derived(topLevelTasks.filter((t) => t.done));

	function getSubtasks(parentId: string): Task[] {
		return tasks.filter((t) => t.parent_id === parentId);
	}

	function startRename() {
		titleText = list.title;
		editingTitle = true;
	}

	function saveRename() {
		const trimmed = titleText.trim();
		if (trimmed && trimmed !== list.title) {
			onRename(list.id, trimmed);
		}
		editingTitle = false;
	}

	function handleTitleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			saveRename();
		}
		if (e.key === 'Escape') {
			editingTitle = false;
		}
	}

	const defaultIcons = ['📝', '🏠', '💼', '🛒', '💡', '🎯', '📚', '🔧', '🎨', '🏃', '🎵', '🌱'];
</script>

<div class="w-full md:w-[360px] md:min-w-[280px] md:max-w-[500px] md:flex-shrink-0 flex flex-col">
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="card bg-base-100 border border-base-300 shadow-sm flex-1 flex flex-col" oncontextmenu={(e) => onListContext?.(e)}>
		<!-- Header -->
		<div class="card-body p-4 pb-2 flex-shrink-0">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-2 flex-1 min-w-0">
					<!-- Icon -->
					<div class="dropdown">
						<button tabindex="0" class="text-lg hover:scale-110 transition-transform cursor-pointer">
							{list.icon}
						</button>
						<div class="dropdown-content z-50 bg-base-100 rounded-xl shadow-xl border border-base-300 p-2 grid grid-cols-6 gap-1 w-52">
							{#each defaultIcons as icon}
								<button
									onclick={() => onIconChange(list.id, icon)}
									class="btn btn-ghost btn-sm text-lg hover:scale-110"
								>
									{icon}
								</button>
							{/each}
						</div>
					</div>

					<!-- Title -->
					{#if editingTitle}
						<!-- svelte-ignore a11y_autofocus -->
						<input
							type="text"
							bind:value={titleText}
							onblur={saveRename}
							onkeydown={handleTitleKeydown}
							class="input input-sm input-ghost font-semibold text-base flex-1 px-1"
							maxlength="100"
							autofocus
						/>
					{:else}
						<h2
							class="text-base font-semibold truncate cursor-default"
							ondblclick={startRename}
						>
							{list.title}
						</h2>
					{/if}

					<span class="badge badge-sm badge-ghost">{activeTasks.length}</span>
				</div>

				<!-- List Menu -->
				<div class="relative">
					<button
						onclick={() => (menuOpen = !menuOpen)}
						class="btn btn-ghost btn-xs btn-square"
						aria-label="Listen-Optionen"
					>
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01" />
						</svg>
					</button>

					{#if menuOpen}
						<div class="fixed inset-0 z-40" onclick={() => (menuOpen = false)} role="presentation"></div>
						<div class="absolute right-0 top-8 z-50 w-48 bg-base-100 rounded-xl shadow-xl border border-base-300 p-1.5">
							<button
								onclick={() => { startRename(); menuOpen = false; }}
								class="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-lg hover:bg-base-200 transition-colors"
							>
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
								</svg>
								Umbenennen
							</button>
							<button
								onclick={() => { onDelete(list.id); menuOpen = false; }}
								class="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-lg hover:bg-error/10 text-error transition-colors"
							>
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
								</svg>
								Liste loeschen
							</button>
						</div>
					{/if}
				</div>
			</div>
		</div>

		<!-- Tasks -->
		<div class="card-body p-4 pt-2 flex-1 overflow-y-auto space-y-2">
			{#each activeTasks as task (task.id)}
				<div transition:slide|global={{ duration: 250 }} animate:flip={{ duration: 200 }}>
					<TaskItem
					{task}
					subtasks={getSubtasks(task.id)}
					onToggle={onToggleTask}
					onUpdate={onUpdateTask}
					onDelete={onDeleteTask}
					{onAddSubtask}
					{onToggleSubtask}
					{onUpdateSubtask}
					{onDeleteSubtask}
					{onChangePriority}
					onContext={(e) => onTaskContext?.(e, task)}
					/>
				</div>
			{/each}

			{#if activeTasks.length === 0}
				<p class="text-sm text-base-content/40 text-center py-8 italic">
					Alles erledigt! 🎉
				</p>
			{/if}

			{#if doneTasks.length > 0}
				<button
					onclick={() => (showDone = !showDone)}
					class="flex items-center gap-2 w-full text-xs text-base-content/40 hover:text-base-content/60 transition-colors py-2"
				>
					<div class="flex-1 h-px bg-base-300"></div>
					<span>{showDone ? 'Erledigte ausblenden' : `${doneTasks.length} erledigt`}</span>
					<svg class="w-3 h-3 transition-transform {showDone ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
					</svg>
					<div class="flex-1 h-px bg-base-300"></div>
				</button>

				{#if showDone}
					<div transition:slide|global={{ duration: 300 }}>
					{#each doneTasks as task (task.id)}
						<div transition:slide|global={{ duration: 250 }} animate:flip={{ duration: 200 }}>
							<TaskItem
							{task}
							subtasks={getSubtasks(task.id)}
							onToggle={onToggleTask}
							onUpdate={onUpdateTask}
							onDelete={onDeleteTask}
							{onAddSubtask}
							{onToggleSubtask}
							{onUpdateSubtask}
							{onDeleteSubtask}
							{onChangePriority}
							onContext={(e) => onTaskContext?.(e, task)}
							/>
						</div>
					{/each}
					</div>
				{/if}
			{/if}

			<!-- Quick Add -->
			<QuickAdd onAdd={(text) => onAddTask(list.id, text)} />
		</div>
	</div>
</div>
