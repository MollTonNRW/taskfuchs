<script lang="ts">
	import { createTaskStore } from '$lib/stores/tasks.svelte';
	import { listsStore } from '$lib/stores/lists';
	import { hiddenListIds } from '$lib/stores/visibility';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import type { Database } from '$lib/types/database';

	type List = Database['public']['Tables']['lists']['Row'];
	type Task = Database['public']['Tables']['tasks']['Row'];

	let { data } = $props();

	const store = createTaskStore();

	// Initialize store
	$effect(() => {
		if (data.supabase && data.user) {
			store.init(data.supabase, data.user.id, data.lists, data.tasks);
			listsStore.set(data.lists);
		}
	});

	// Reactive lists/tasks from store
	let lists = $derived(store.lists);
	let tasks = $derived(store.tasks);

	// Mobile: active list tab index
	let activeListIndex = $state(0);
	let isMobile = $state(false);

	// Visible lists
	let visibleLists = $derived(
		lists.filter((l: List) => !$hiddenListIds.has(l.id))
	);

	// Tasks by list (top-level only, no dividers)
	function tasksForList(listId: string): Task[] {
		return tasks.filter((t: Task) => t.list_id === listId && !t.parent_id);
	}

	// Active tasks (not done)
	function activeTasksForList(listId: string): Task[] {
		return tasksForList(listId).filter((t: Task) => !t.done && t.type !== 'divider');
	}

	// Done tasks
	function doneTasksForList(listId: string): Task[] {
		return tasksForList(listId).filter((t: Task) => t.done);
	}

	// Subtasks for a task
	function subtasksFor(taskId: string): Task[] {
		return tasks.filter((t: Task) => t.parent_id === taskId).sort((a: Task, b: Task) => a.position - b.position);
	}

	// Pinned tasks
	let pinnedTasks = $derived(
		tasks.filter((t: Task) => t.pinned && !t.done)
	);

	// Track mobile/desktop
	onMount(() => {
		const mq = window.matchMedia('(max-width: 768px)');
		isMobile = mq.matches;
		const handler = (e: MediaQueryListEvent) => { isMobile = e.matches; };
		mq.addEventListener('change', handler);

		// Subscribe to realtime
		store.subscribeRealtime();

		return () => {
			mq.removeEventListener('change', handler);
			store.unsubscribeRealtime();
		};
	});

	// Quick-add state per list
	let quickAddTexts: Record<string, string> = $state({});

	async function handleQuickAdd(listId: string) {
		const text = quickAddTexts[listId]?.trim();
		if (!text) return;
		quickAddTexts[listId] = '';
		await store.createTask(listId, text);
	}

	// Done sections collapsed state per list
	let doneSectionsCollapsed: Record<string, boolean> = $state({});

	function toggleDoneSection(listId: string) {
		doneSectionsCollapsed[listId] = !doneSectionsCollapsed[listId];
	}

	// Bounds-check activeListIndex
	$effect(() => {
		if (activeListIndex >= visibleLists.length) {
			activeListIndex = Math.max(0, visibleLists.length - 1);
		}
	});
</script>

<!-- Pinboard -->
{#if pinnedTasks.length > 0}
	<div style="margin-bottom: 16px;">
		<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
			<span style="font-size: .55rem; text-transform: uppercase; letter-spacing: 2px; color: var(--v2-text-muted);">📌 Pinnwand</span>
			<span style="font-size: .5rem; color: var(--v2-text-muted);">({pinnedTasks.length})</span>
		</div>
		<div class="v2-pinboard">
			{#each pinnedTasks as task (task.id)}
				<div class="v2-glass-card v2-pin-card">
					{#if task.emoji}
						<div class="emoji">{task.emoji}</div>
					{/if}
					<div class="text">{task.text}</div>
				</div>
			{/each}
		</div>
	</div>
{/if}

<!-- Mobile: List Tabs -->
{#if isMobile && visibleLists.length > 1}
	<div class="v2-list-tabs">
		{#each visibleLists as list, i (list.id)}
			<button
				class="v2-list-tab"
				class:active={i === activeListIndex}
				onclick={() => (activeListIndex = i)}
			>
				{list.icon} {list.title}
			</button>
		{/each}
	</div>
{/if}

<!-- Lists -->
<div class="v2-lists-container">
	{#each visibleLists as list, i (list.id)}
		<div
			class="v2-list-panel"
			class:active={!isMobile || i === activeListIndex}
			data-col={i % 5}
		>
			<!-- List Header -->
			<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
				<span style="font-size: 1.1rem;">{list.icon}</span>
				<h2 style="font-size: .85rem; font-weight: 700; color: var(--v2-text); flex: 1;">{list.title}</h2>
				<span style="font-size: .55rem; color: var(--v2-text-muted);">
					{activeTasksForList(list.id).length} offen
				</span>
				<button
					onclick={() => store.createList()}
					style="background: none; border: 1px dashed var(--v2-border); border-radius: var(--v2-radius); color: var(--v2-text-muted); font-size: .6rem; padding: 3px 8px; cursor: pointer;"
					title="Kontextmenu (kommt in Run 3)"
				>
					⋯
				</button>
			</div>

			<!-- Quick Add -->
			<div class="v2-quick-add">
				<input
					type="text"
					placeholder="+ Neue Aufgabe..."
					bind:value={quickAddTexts[list.id]}
					onkeydown={(e) => { if (e.key === 'Enter') handleQuickAdd(list.id); }}
					maxlength="500"
				/>
			</div>

			<!-- Active Tasks -->
			<div style="display: flex; flex-direction: column; gap: 6px;">
				{#each activeTasksForList(list.id) as task (task.id)}
					{#if task.type === 'divider'}
						<!-- Divider -->
						<div style="display: flex; align-items: center; gap: 8px; padding: 6px 0;">
							<div style="flex: 1; height: 1px; background: var(--v2-border);"></div>
							<span style="font-size: .6rem; color: var(--v2-text-muted); text-transform: uppercase; letter-spacing: 1px;">{task.text}</span>
							<div style="flex: 1; height: 1px; background: var(--v2-border);"></div>
						</div>
					{:else}
						<!-- Task Card -->
						<div
							class="v2-glass-card v2-task-card"
							data-priority={task.priority}
							style={task.highlighted ? 'animation: v2-highlight-pulse 2s ease-in-out infinite;' : ''}
						>
							<!-- Checkbox -->
							<button
								class="v2-checkbox"
								class:invite={subtasksFor(task.id).length > 0 && subtasksFor(task.id).every((s) => s.done)}
								onclick={() => store.toggleDone(task.id)}
								aria-label="Aufgabe abhaken"
							>
								✓
							</button>

							<!-- Text -->
							<span class="v2-task-text">{task.text}</span>

							<!-- Emoji -->
							{#if task.emoji}
								<span style="font-size: .85rem;">{task.emoji}</span>
							{/if}

							<!-- Subtask counter -->
							{#if subtasksFor(task.id).length > 0}
								{@const subs = subtasksFor(task.id)}
								{@const doneSubs = subs.filter((s) => s.done).length}
								<span class="v2-subtask-counter">
									{doneSubs}/{subs.length}
								</span>
							{/if}

							<!-- Progress -->
							{#if task.progress && task.progress > 0}
								<div class="v2-progress" style="width: 40px;">
									<div
										class="v2-progress-fill"
										class:shimmer={task.progress === 3}
										data-level={task.progress}
										style="width: {task.progress === 1 ? '33' : task.progress === 2 ? '66' : '100'}%;"
									></div>
								</div>
							{/if}

							<!-- Note indicator -->
							{#if task.note}
								<span style="font-size: .6rem; color: var(--v2-text-muted);" title={task.note}>💬</span>
							{/if}

							<!-- Due date -->
							{#if task.due_date}
								<span style="font-size: .55rem; color: var(--v2-accent); border: 1px dashed var(--v2-accent-dim); border-radius: 3px; padding: 1px 4px;">
									{task.due_date}
								</span>
							{/if}
						</div>

						<!-- Subtasks (inline) -->
						{#if subtasksFor(task.id).length > 0}
							<div style="margin-left: 28px; display: flex; flex-direction: column; gap: 4px;">
								{#each subtasksFor(task.id) as sub (sub.id)}
									<div class="v2-glass-card" style="padding: 6px 10px; display: flex; align-items: center; gap: 8px; font-size: .72rem;">
										<button
											class="v2-checkbox"
											class:checked={sub.done}
											onclick={() => store.toggleDone(sub.id)}
											style="width: 15px; height: 15px; font-size: .5rem;"
											aria-label="Unteraufgabe abhaken"
										>
											{sub.done ? '✓' : ''}
										</button>
										<span class="v2-task-text" class:done={sub.done}>{sub.text}</span>
									</div>
								{/each}
							</div>
						{/if}
					{/if}
				{/each}
			</div>

			<!-- Done Section -->
			{#if doneTasksForList(list.id).length > 0}
				<button class="v2-done-separator" onclick={() => toggleDoneSection(list.id)}>
					<div class="line"></div>
					<span class="label">Erledigt ({doneTasksForList(list.id).length})</span>
					<span class="toggle" class:collapsed={doneSectionsCollapsed[list.id]}>▼</span>
					<div class="line"></div>
				</button>

				{#if !doneSectionsCollapsed[list.id]}
					<div style="display: flex; flex-direction: column; gap: 4px; opacity: .6;">
						{#each doneTasksForList(list.id) as task (task.id)}
							<div class="v2-glass-card v2-task-card" style="opacity: .7;">
								<button
									class="v2-checkbox checked"
									onclick={() => store.toggleDone(task.id)}
									aria-label="Aufgabe wieder oeffnen"
								>
									✓
								</button>
								<span class="v2-task-text done">{task.text}</span>
								{#if task.emoji}
									<span style="font-size: .8rem;">{task.emoji}</span>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			{/if}
		</div>
	{/each}
</div>

<!-- Empty state -->
{#if visibleLists.length === 0}
	<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; text-align: center;">
		<div style="font-size: 2.5rem; margin-bottom: 16px;">🦊</div>
		<h2 style="font-size: 1rem; font-weight: 700; color: var(--v2-text); margin-bottom: 8px;">Willkommen bei TaskFuchs v2</h2>
		<p style="font-size: .75rem; color: var(--v2-text-muted); max-width: 320px; line-height: 1.6;">
			Erstelle deine erste Liste um loszulegen.
		</p>
		<button
			onclick={() => store.createList()}
			style="margin-top: 16px; padding: 10px 20px; border: 1px dashed var(--v2-accent); border-radius: var(--v2-radius); background: var(--v2-accent-glow); color: var(--v2-accent); font-size: .75rem; font-weight: 600; cursor: pointer; font-family: var(--v2-font);"
		>
			+ Neue Liste
		</button>
	</div>
{/if}
