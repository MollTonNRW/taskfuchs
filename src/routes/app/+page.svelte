<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import type { Database } from '$lib/types/database';
	import type { MenuItem } from '$lib/components/ContextMenu.svelte';
	import ListPanel from '$lib/components/ListPanel.svelte';
	import ContextMenu from '$lib/components/ContextMenu.svelte';
	import Pinboard from '$lib/components/Pinboard.svelte';
	import NotePopover from '$lib/components/NotePopover.svelte';
	import ShareDialog from '$lib/components/ShareDialog.svelte';
	import FocusOverlay from '$lib/components/FocusOverlay.svelte';
	import EmojiPicker from '$lib/components/EmojiPicker.svelte';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import { seedDemoData } from '$lib/seed-data';
	import { listsStore } from '$lib/stores/lists';
	import { priorityFilters, viewFilters } from '$lib/stores/filters';
	import { hiddenListIds } from '$lib/stores/visibility';
	import { profilesStore, profileMap } from '$lib/stores/profiles';
	import { priorityLabels, priorityColors, progressLabelsFull as progressLabels, progressColors, priorityWeight, sortLabels, type Priority } from '$lib/constants';
	import { createTaskStore } from '$lib/stores/tasks.svelte';
	import * as crud from '$lib/services/supabase-crud';

	type List = Database['public']['Tables']['lists']['Row'];
	type Task = Database['public']['Tables']['tasks']['Row'];
	type ListShare = Database['public']['Tables']['list_shares']['Row'];

	let { data } = $props();

	// Central store for tasks & lists CRUD
	const store = createTaskStore();

	let activeListIndex = $state(0);

	// Sync page data → store
	$effect(() => {
		store.init(
			data.supabase as any,
			data.user!.id,
			data.lists as List[],
			data.tasks as Task[]
		);
	});

	// Keep listsStore in sync for sidebar
	$effect(() => { listsStore.set(store.lists); });

	// ==========================================
	// SEARCH
	// ==========================================
	let searchQuery = $state('');
	let searchOpen = $state(false);

	let searchResults = $derived(
		searchQuery.trim().length < 2
			? []
			: store.tasks.filter((t) => {
					const q = searchQuery.toLowerCase();
					return t.text.toLowerCase().includes(q) || (t.note && t.note.toLowerCase().includes(q));
				})
	);

	function clearSearch() { searchQuery = ''; searchOpen = false; }

	// ==========================================
	// SORT
	// ==========================================
	type SortMode = 'position' | 'priority' | 'name' | 'date' | 'created' | 'progress';
	let sortMode = $state<SortMode>('position');
	let sortMenuOpen = $state(false);

	// sortLabels, priorityWeight imported from $lib/constants

	function sortTasks(taskList: Task[]): Task[] {
		if (sortMode === 'position') {
			// Standard: Fixierte zuerst, dann nach Position
			return [...taskList].sort((a, b) => {
				if (a.highlighted && !b.highlighted) return -1;
				if (!a.highlighted && b.highlighted) return 1;
				return a.position - b.position;
			});
		}
		return [...taskList].sort((a, b) => {
			if (a.type === 'divider' || b.type === 'divider') return 0;
			switch (sortMode) {
				case 'priority': return (priorityWeight[a.priority] ?? 2) - (priorityWeight[b.priority] ?? 2);
				case 'name': return a.text.localeCompare(b.text, 'de');
				case 'date': {
					if (!a.due_date && !b.due_date) return 0;
					if (!a.due_date) return 1;
					if (!b.due_date) return -1;
					return a.due_date.localeCompare(b.due_date);
				}
				case 'created': return a.created_at.localeCompare(b.created_at);
				case 'progress': return (b.progress ?? 0) - (a.progress ?? 0);
				default: return 0;
			}
		});
	}

	// ==========================================
	// BULK ACTIONS
	// ==========================================
	let bulkMode = $state(false);
	let selectedTaskIds = $state<Set<string>>(new Set());
	let bulkPrioOpen = $state(false);
	let bulkMoveOpen = $state(false);

	function toggleBulkSelect(taskId: string) {
		selectedTaskIds = new Set(selectedTaskIds);
		if (selectedTaskIds.has(taskId)) selectedTaskIds.delete(taskId);
		else selectedTaskIds.add(taskId);
	}

	function selectAllInList(listId: string) {
		const listTaskIds = store.tasks
			.filter((t) => t.list_id === listId && !t.parent_id && !t.done && t.type !== 'divider')
			.map((t) => t.id);
		selectedTaskIds = new Set(listTaskIds);
	}

	function clearSelection() {
		selectedTaskIds = new Set();
		bulkMode = false;
		bulkPrioOpen = false;
		bulkMoveOpen = false;
	}

	async function handleBulkToggleDone(done: boolean) {
		const ids = [...selectedTaskIds];
		clearSelection();
		await store.bulkToggleDone(ids, done);
	}

	async function handleBulkChangePriority(priority: Priority) {
		const ids = [...selectedTaskIds];
		clearSelection();
		await store.bulkChangePriority(ids, priority);
	}

	async function handleBulkDelete() {
		const ids = [...selectedTaskIds];
		clearSelection();
		await store.bulkDelete(ids);
	}

	async function handleBulkMoveToList(targetListId: string) {
		const ids = [...selectedTaskIds];
		clearSelection();
		await store.bulkMoveToList(ids, targetListId);
	}

	// ==========================================
	// FILTERS & VISIBLE LISTS
	// ==========================================
	let visibleLists = $derived(store.lists.filter((l) => !$hiddenListIds.has(l.id)));

	function filteredTasksForList(listId: string): Task[] {
		const listTasks = store.tasks.filter((t) => t.list_id === listId);
		const filtered = listTasks.filter((t) => {
			if (t.type === 'divider') return true;
			if (!$priorityFilters[t.priority]) return false;
			if ($viewFilters.highlighted && !t.highlighted) return false;
			if ($viewFilters.withDate && !t.due_date) return false;
			return true;
		});
		return sortTasks(filtered);
	}

	// ==========================================
	// REALTIME
	// ==========================================
	onMount(() => {
		const sb = store.sb;

		const listsChannel = sb
			.channel('lists-realtime')
			.on('postgres_changes' as any, { event: '*', schema: 'public', table: 'lists' }, (payload: any) => {
				store.handleRealtimeList(payload.eventType, payload.eventType === 'DELETE' ? payload.old : payload.new);
			})
			.subscribe();

		const tasksChannel = sb
			.channel('tasks-realtime')
			.on('postgres_changes' as any, { event: '*', schema: 'public', table: 'tasks' }, (payload: any) => {
				store.handleRealtimeTask(payload.eventType, payload.eventType === 'DELETE' ? payload.old : payload.new);
			})
			.subscribe();

		return () => {
			sb.removeChannel(listsChannel);
			sb.removeChannel(tasksChannel);
		};
	});

	// ==========================================
	// SEED / DEMO DATA
	// ==========================================
	onMount(async () => {
		const sb = store.sb;
		const { data: p } = await sb.from('profiles').select('*');
		if (p) profilesStore.set(p as Database['public']['Tables']['profiles']['Row'][]);

		if (data.user && data.lists.length === 0) {
			const seeded = await seedDemoData(sb, data.user.id);
			if (seeded) {
				const result = await crud.loadUserData(sb, data.user.id);
				store.setLists(result.lists);
				store.setTasks(result.tasks);
			}
		}
	});

	let seedingDemo = $state(false);
	async function loadDemoData() {
		if (!data.user || seedingDemo) return;
		seedingDemo = true;
		const sb = store.sb;
		const seeded = await seedDemoData(sb, data.user.id, true);
		if (seeded) {
			const result = await crud.loadUserData(sb, data.user.id);
			store.setLists(result.lists);
			store.setTasks(result.tasks);
		}
		seedingDemo = false;
	}

	// ==========================================
	// CONTEXT MENU
	// ==========================================
	type ContextMenuState = { show: boolean; x: number; y: number; items: MenuItem[] };
	let contextMenu = $state<ContextMenuState>({ show: false, x: 0, y: 0, items: [] });

	// priorityLabels, priorityColors, progressLabels, progressColors imported from $lib/constants

	function handleListContext(e: MouseEvent, list: List) {
		e.preventDefault();
		contextMenu = {
			show: true, x: e.clientX, y: e.clientY,
			items: [
				{ label: 'Neue Aufgabe', icon: { svg: 'M12 4v16m8-8H4', color: 'text-green-500' }, action: () => store.addTask(list.id, 'Neue Aufgabe') },
				{
					label: 'Trenner erstellen',
					icon: { svg: 'M4 12h16', color: 'text-gray-400' },
					action: () => {
						const listTasks = store.tasks.filter((t) => t.list_id === list.id && !t.parent_id);
						store.createDivider(list.id, listTasks.length, 'Neuer Trenner');
					}
				},
				{ divider: true, label: '' },
				{ label: 'Liste umbenennen', icon: { svg: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z', color: 'text-blue-500' }, action: () => { const newName = prompt('Neuer Listenname:', list.title); if (newName?.trim()) store.renameList(list.id, newName.trim()); } },
				{ label: 'Liste löschen', icon: { svg: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16' }, action: () => store.deleteList(list.id), danger: true }
			]
		};
	}

	function handleTaskContext(e: MouseEvent, task: Task) {
		e.preventDefault();

		// Divider: eigenes kompaktes Kontextmenü
		if (task.type === 'divider') {
			contextMenu = {
				show: true, x: e.clientX, y: e.clientY,
				items: [
					{ label: 'Trenner umbenennen', icon: { svg: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z', color: 'text-blue-500' }, action: () => { const newName = prompt('Neuer Trenner-Name:', task.divider_label || task.text); if (newName?.trim()) store.updateTask(task.id, newName.trim()); } },
					{ label: 'Trenner löschen', icon: { svg: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16' }, action: () => store.deleteTaskDirect(task.id), danger: true }
				]
			};
			return;
		}

		const otherLists = store.lists.filter((l) => l.id !== task.list_id);

		const items: MenuItem[] = [
			{ label: 'Neue Aufgabe darunter', icon: { svg: 'M12 4v16m8-8H4', color: 'text-green-500' }, action: () => store.addTaskAfter(task.id, 'Neue Aufgabe') },
			{ label: 'Unteraufgabe erstellen', icon: { svg: 'M13 5l7 7-7 7M5 5l7 7-7 7', color: 'text-blue-500' }, action: () => store.addSubtask(task.id, 'Neue Unteraufgabe') },
			{
				label: task.done ? 'Nicht erledigt' : 'Erledigt',
				icon: task.done
					? { svg: 'M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z', color: 'text-gray-400' }
					: { svg: 'M5 13l4 4L19 7', color: 'text-green-500' },
				action: () => store.toggleTask(task.id, !task.done)
			},
			{ divider: true, label: '' },
			{
				label: 'Priorität',
				icon: { svg: 'M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9', color: 'text-orange-500' },
				submenu: (['low', 'normal', 'high', 'asap'] as Priority[]).map((p) => ({
					label: priorityLabels[p], color: priorityColors[p], active: task.priority === p,
					action: () => store.changeTaskPriority(task.id, p)
				}))
			},
			{ divider: true, label: '' },
			{
				label: task.highlighted ? 'Fixierung aufheben' : 'Fixieren',
				icon: { svg: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z', color: task.highlighted ? 'text-orange-500' : 'text-gray-400', filled: task.highlighted ? true : false },
				action: () => store.toggleHighlight(task.id)
			},
			{
				label: task.pinned ? 'Von Pinnwand lösen' : 'An Pinnwand pinnen',
				icon: { svg: 'M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z', color: task.pinned ? 'text-orange-500' : 'text-gray-400', filled: task.pinned ? true : false },
				action: () => store.togglePin(task.id)
			},
			{
				label: task.note ? 'Notiz bearbeiten' : 'Notiz hinzufügen',
				icon: { svg: 'M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z', color: task.note ? 'text-blue-500' : 'text-gray-400', filled: task.note ? true : false },
				action: () => openNotePopover(task.id, contextMenu.x, contextMenu.y)
			},
			{
				label: 'Zuweisen',
				icon: { svg: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z', color: task.assigned_to ? 'text-teal-500' : 'text-gray-400' },
				submenu: [
					...(task.assigned_to ? [{ label: 'Niemand', action: () => store.assignTask(task.id, null), color: '#9ca3af' }] : []),
					...[...$profileMap.values()].map((p) => ({
						label: p.display_name || p.username || p.id.slice(0, 8),
						active: task.assigned_to === p.id,
						action: () => store.assignTask(task.id, p.id)
					})),
					...($profileMap.size === 0 && data.user ? [{
						label: data.user.email?.split('@')[0] || 'Ich',
						active: task.assigned_to === data.user.id,
						action: () => store.assignTask(task.id, data.user!.id)
					}] : [])
				]
			},
			{ divider: true, label: '' },
			{
				label: 'Terminieren',
				icon: { svg: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', color: 'text-blue-500' },
				action: () => openDatePicker(task.id, contextMenu.x, contextMenu.y)
			},
			{
				label: 'Trenner erstellen',
				icon: { svg: 'M4 12h16', color: 'text-gray-400' },
				action: () => {
					store.createDivider(task.list_id, task.position + 0.5, 'Neuer Trenner');
				}
			},
			{
				label: task.emoji ? 'Symbol ändern' : 'Mit Symbol versehen',
				icon: '😊',
				action: () => openEmojiPicker(task.id, contextMenu.x, contextMenu.y)
			}
		];

		if (otherLists.length > 0) {
			items.push({ divider: true, label: '' });
			items.push({
				label: 'In andere Liste',
				icon: { svg: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4', color: 'text-purple-500' },
				submenu: otherLists.map((l) => ({
					label: `${l.icon} ${l.title}`,
					action: () => store.moveTaskToList(task.id, l.id)
				}))
			});
		}

		items.push({ divider: true, label: '' });
		items.push({
			label: 'Aufgabe löschen',
			icon: { svg: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16' },
			action: () => store.deleteTaskDirect(task.id),
			danger: true
		});

		contextMenu = { show: true, x: e.clientX, y: e.clientY, items };
	}

	// ==========================================
	// NOTE POPOVER
	// ==========================================
	type NotePopoverState = { show: boolean; taskId: string; note: string; x: number; y: number };
	let notePopover = $state<NotePopoverState>({ show: false, taskId: '', note: '', x: 0, y: 0 });

	function openNotePopover(taskId: string, x: number, y: number) {
		const task = store.tasks.find((t) => t.id === taskId);
		if (!task) return;
		notePopover = { show: true, taskId, note: task.note ?? '', x, y };
	}

	function handleNoteSave(text: string) { store.updateTaskNote(notePopover.taskId, text); }

	// ==========================================
	// FOCUS MODE
	// ==========================================
	type FocusState = { show: boolean; taskId: string };
	let focusMode = $state<FocusState>({ show: false, taskId: '' });
	function openFocusMode(taskId: string) { focusMode = { show: true, taskId }; }
	let focusTask = $derived(focusMode.show ? store.tasks.find((t) => t.id === focusMode.taskId) ?? null : null);

	// ==========================================
	// EMOJI PICKER
	// ==========================================
	type EmojiPickerState = { show: boolean; taskId: string; x: number; y: number };
	let emojiPicker = $state<EmojiPickerState>({ show: false, taskId: '', x: 0, y: 0 });
	function openEmojiPicker(taskId: string, x: number, y: number) { emojiPicker = { show: true, taskId, x, y }; }
	function handleEmojiSelect(emoji: string) { store.updateTaskEmoji(emojiPicker.taskId, emoji); }

	// ==========================================
	// DATE PICKER
	// ==========================================
	type DatePickerState = { show: boolean; taskId: string; x: number; y: number };
	let datePicker = $state<DatePickerState>({ show: false, taskId: '', x: 0, y: 0 });
	function openDatePicker(taskId: string, x: number, y: number) { datePicker = { show: true, taskId, x, y }; }
	function handleDateSelect(date: string | null) { store.updateTaskDate(datePicker.taskId, date); }

	// ==========================================
	// SHARE DIALOG
	// ==========================================
	type ShareDialogState = { show: boolean; list: List | null; shares: ListShare[] };
	let shareDialog = $state<ShareDialogState>({ show: false, list: null, shares: [] });

	async function openShareDialog(list: List) {
		const { data: shares } = await crud.getListShares(store.sb, list.id);
		shareDialog = { show: true, list, shares: (shares as ListShare[]) ?? [] };
	}

	async function shareList(email: string, role: 'editor' | 'viewer') {
		if (!shareDialog.list) return;
		const sb = store.sb;

		// Email → User-ID Lookup via RPC
		const { data: userId, error: lookupErr } = await sb.rpc('lookup_user_by_email', { lookup_email: email });
		if (lookupErr || !userId) {
			alert('Kein Benutzer mit dieser Email gefunden.');
			return;
		}

		const { data: newShare, error } = await crud.createListShare(sb, shareDialog.list.id, userId, role);
		if (error) { console.error('Teilen fehlgeschlagen:', error); alert('Fehler beim Teilen: ' + error.message); return; }
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

	// ==========================================
	// PINBOARD
	// ==========================================
	function scrollToTask(taskId: string) {
		const el = document.getElementById(`task-${taskId}`);
		if (el) {
			el.scrollIntoView({ behavior: 'smooth', block: 'center' });
			el.classList.add('task-highlight-in');
			setTimeout(() => el.classList.remove('task-highlight-in'), 1000);
		}
	}

	// ==========================================
	// MINIMIZED LISTS
	// ==========================================
	let minimizedListIds = $state<Set<string>>(new Set());
	function toggleMinimizeList(listId: string) {
		minimizedListIds = new Set(minimizedListIds);
		if (minimizedListIds.has(listId)) minimizedListIds.delete(listId);
		else minimizedListIds.add(listId);
	}

	// ==========================================
	// RESIZABLE COLUMNS (Desktop)
	// ==========================================
	let columnWidths = $state<Record<string, number>>({});
	let resizing = $state<{ listId: string; startX: number; startWidth: number } | null>(null);

	function getColumnWidth(listId: string): number { return columnWidths[listId] || 360; }

	function handleResizeStart(e: MouseEvent, listId: string) {
		e.preventDefault();
		const panel = (e.target as HTMLElement).previousElementSibling as HTMLElement;
		if (!panel) return;
		const startWidth = panel.getBoundingClientRect().width;
		resizing = { listId, startX: e.clientX, startWidth };
		(e.target as HTMLElement).classList.add('dragging');

		function handleResizeMove(ev: MouseEvent) {
			if (!resizing) return;
			const delta = ev.clientX - resizing.startX;
			const newWidth = Math.max(280, Math.min(600, resizing.startWidth + delta));
			columnWidths = { ...columnWidths, [resizing.listId]: newWidth };
		}
		function handleResizeEnd() {
			if (resizing) document.querySelector('.col-resize-handle.dragging')?.classList.remove('dragging');
			resizing = null;
			window.removeEventListener('mousemove', handleResizeMove);
			window.removeEventListener('mouseup', handleResizeEnd);
		}
		window.addEventListener('mousemove', handleResizeMove);
		window.addEventListener('mouseup', handleResizeEnd);
	}

	// ==========================================
	// KEYBOARD SHORTCUTS
	// ==========================================
	function handleGlobalKeydown(e: KeyboardEvent) {
		const target = e.target as HTMLElement;
		const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

		if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
			e.preventDefault(); searchOpen = !searchOpen;
			if (!searchOpen) searchQuery = '';
			return;
		}

		if (e.key === 'Escape') {
			if (searchOpen) { clearSearch(); return; }
			if (bulkMode) { clearSelection(); return; }
			if (emojiPicker.show) { emojiPicker = { ...emojiPicker, show: false }; return; }
			if (focusMode.show) { focusMode = { ...focusMode, show: false }; return; }
			if (notePopover.show) { notePopover = { ...notePopover, show: false }; return; }
			if (contextMenu.show) { contextMenu = { ...contextMenu, show: false }; return; }
			if (shareDialog.show) { shareDialog = { ...shareDialog, show: false }; return; }
		}

		if (isInput) return;

		if (e.key === '/') { e.preventDefault(); searchOpen = true; }
	}

	// ==========================================
	// LIST CREATE HANDLER
	// ==========================================
	async function handleCreateList() {
		const newIdx = await store.createList();
		if (newIdx >= 0) activeListIndex = newIdx;
	}
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

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

{#if notePopover.show}
	<NotePopover
		note={notePopover.note}
		x={notePopover.x}
		y={notePopover.y}
		onSave={handleNoteSave}
		onClose={() => (notePopover = { ...notePopover, show: false })}
	/>
{/if}

{#if shareDialog.show && shareDialog.list}
	<ShareDialog
		list={shareDialog.list}
		shares={shareDialog.shares}
		onClose={() => (shareDialog = { ...shareDialog, show: false })}
		onShare={shareList}
		onRemoveShare={removeShare}
		onChangeRole={changeShareRole}
	/>
{/if}

{#if focusMode.show && focusTask}
	<FocusOverlay
		task={focusTask}
		allTasks={store.tasks}
		onClose={() => (focusMode = { ...focusMode, show: false })}
		onToggle={store.toggleTask}
		onUpdate={store.updateTask}
		onDelete={store.deleteTask}
		onChangePriority={store.changeTaskPriority}
		onToggleHighlight={store.toggleHighlight}
		onTogglePin={store.togglePin}
		onUpdateNote={store.updateTaskNote}
		onUpdateEmoji={store.updateTaskEmoji}
		onToggleSubtask={store.toggleSubtask}
		onUpdateSubtask={store.updateSubtask}
		onDeleteSubtask={store.deleteSubtask}
		onAddSubtask={store.addSubtask}
	/>
{/if}

{#if emojiPicker.show}
	<EmojiPicker
		x={emojiPicker.x}
		y={emojiPicker.y}
		onSelect={handleEmojiSelect}
		onClose={() => (emojiPicker = { ...emojiPicker, show: false })}
	/>
{/if}

{#if datePicker.show}
	<DatePicker
		x={datePicker.x}
		y={datePicker.y}
		current={store.tasks.find(t => t.id === datePicker.taskId)?.due_date ?? null}
		onSelect={handleDateSelect}
		onClose={() => (datePicker = { ...datePicker, show: false })}
	/>
{/if}

<!-- Pinboard -->
<Pinboard
	tasks={store.tasks}
	lists={store.lists}
	onUnpin={store.togglePin}
	onScrollToTask={scrollToTask}
	onClearAll={store.clearPinboard}
	onPin={store.togglePin}
	onTaskClick={openFocusMode}
/>

<!-- Search Overlay -->
{#if searchOpen}
	<div class="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
		<div class="fixed inset-0 bg-black/40 backdrop-blur-sm" onclick={clearSearch} role="presentation"></div>
		<div class="relative w-full max-w-lg mx-4 rounded-2xl shadow-2xl tf-surface border" style="border-color: var(--tf-border);">
			<div class="flex items-center gap-3 px-4 py-3" style="border-bottom: 1px solid var(--tf-border);">
				<svg class="w-5 h-5 tf-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
				<!-- svelte-ignore a11y_autofocus -->
				<input
					type="text"
					bind:value={searchQuery}
					placeholder="Aufgaben suchen..."
					class="flex-1 bg-transparent text-sm tf-text outline-none"
					autofocus
				/>
				<kbd class="text-[10px] font-medium px-1.5 py-0.5 rounded tf-text-muted" style="background: var(--tf-surface-hover);">ESC</kbd>
			</div>
			{#if searchResults.length > 0}
				<div class="max-h-80 overflow-y-auto p-2 space-y-0.5">
					{#each searchResults.slice(0, 20) as result (result.id)}
						{@const resultList = store.lists.find((l) => l.id === result.list_id)}
						<button
							onclick={() => { clearSearch(); openFocusMode(result.id); }}
							class="w-full text-left px-3 py-2.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
						>
							<div class="flex items-center gap-2">
								<span class="text-[10px] font-medium px-1.5 py-0.5 rounded-md" style="background: var(--tf-surface-hover);">{resultList?.icon ?? ''}</span>
								<span class="text-sm font-medium tf-text {result.done ? 'line-through opacity-40' : ''}">{result.text}</span>
							</div>
							{#if result.note}
								<p class="text-xs tf-text-muted mt-0.5 ml-7 truncate">{result.note}</p>
							{/if}
						</button>
					{/each}
				</div>
			{:else if searchQuery.trim().length >= 2}
				<div class="p-6 text-center">
					<span class="text-2xl mb-2 block">🔍</span>
					<span class="text-sm tf-text-muted">Keine Ergebnisse für "{searchQuery}"</span>
				</div>
			{:else}
				<div class="p-6 text-center">
					<span class="text-xs tf-text-muted">Mindestens 2 Zeichen eingeben</span>
				</div>
			{/if}
		</div>
	</div>
{/if}

<!-- Bulk Action Toolbar -->
{#if bulkMode && selectedTaskIds.size > 0}
	<div class="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-4 py-2.5 rounded-2xl shadow-2xl border tf-surface" style="border-color: var(--tf-border);">
		<span class="text-sm font-medium tf-text">{selectedTaskIds.size} ausgewählt</span>
		<div class="w-px h-5" style="background: var(--tf-border);"></div>
		<button onclick={() => handleBulkToggleDone(true)} class="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 text-green-600 transition-colors" title="Erledigt markieren">
			<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
		</button>
		<div class="relative">
			<button onclick={() => { bulkPrioOpen = !bulkPrioOpen; bulkMoveOpen = false; }} class="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-600 transition-colors" title="Priorität ändern">
				<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9"/></svg>
			</button>
			{#if bulkPrioOpen}
				<div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 flex flex-col gap-1 p-2 rounded-xl shadow-lg tf-surface border" style="border-color: var(--tf-border);">
					<button onclick={() => handleBulkChangePriority('low')} class="text-xs px-3 py-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 tf-text whitespace-nowrap">Niedrig</button>
					<button onclick={() => handleBulkChangePriority('normal')} class="text-xs px-3 py-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 tf-text whitespace-nowrap">Normal</button>
					<button onclick={() => handleBulkChangePriority('high')} class="text-xs px-3 py-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 tf-text whitespace-nowrap">Hoch</button>
					<button onclick={() => handleBulkChangePriority('asap')} class="text-xs px-3 py-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 tf-text whitespace-nowrap">ASAP!</button>
				</div>
			{/if}
		</div>
		{#if store.lists.length > 1}
			<div class="relative">
				<button onclick={() => { bulkMoveOpen = !bulkMoveOpen; bulkPrioOpen = false; }} class="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 text-purple-600 transition-colors" title="Verschieben">
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>
				</button>
				{#if bulkMoveOpen}
					<div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 flex flex-col gap-1 p-2 rounded-xl shadow-lg tf-surface border" style="border-color: var(--tf-border);">
						{#each store.lists as l (l.id)}
							<button onclick={() => handleBulkMoveToList(l.id)} class="text-xs px-3 py-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 tf-text whitespace-nowrap">{l.icon} {l.title}</button>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
		<button onclick={handleBulkDelete} class="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors" title="Löschen">
			<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
		</button>
		<div class="w-px h-5" style="background: var(--tf-border);"></div>
		<button onclick={clearSelection} class="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-black/5 dark:hover:bg-white/10 tf-text-muted transition-colors">
			Abbrechen
		</button>
	</div>
{/if}

<div class="max-w-7xl mx-auto p-4 md:p-6">
	<!-- Toolbar: Search, Sort, Bulk -->
	{#if store.lists.length > 0}
		<div class="flex items-center justify-between mb-4 gap-3">
			<div class="flex items-center gap-2">
				<!-- Search Button -->
				<button
					onclick={() => (searchOpen = true)}
					class="flex items-center gap-2 px-3 py-2 rounded-xl text-sm tf-text-muted hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
					style="border: 1px solid var(--tf-border);"
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
					<span class="hidden sm:inline">Suchen</span>
					<kbd class="hidden sm:inline text-[10px] font-medium px-1.5 py-0.5 rounded" style="background: var(--tf-surface-hover);">/</kbd>
				</button>

				<!-- Sort Dropdown -->
				<div class="relative">
					<button
						onclick={() => (sortMenuOpen = !sortMenuOpen)}
						class="flex items-center gap-2 px-3 py-2 rounded-xl text-sm tf-text-muted hover:bg-black/5 dark:hover:bg-white/5 transition-colors {sortMode !== 'position' ? 'tf-accent' : ''}"
						style="border: 1px solid var(--tf-border);"
					>
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"/></svg>
						<span class="hidden sm:inline">{sortLabels[sortMode]}</span>
					</button>
					{#if sortMenuOpen}
						<div class="fixed inset-0 z-20" onclick={() => (sortMenuOpen = false)} role="presentation"></div>
						<div class="absolute left-0 top-full mt-1 z-30 w-48 rounded-xl p-1.5 shadow-lg tf-surface border" style="border-color: var(--tf-border);">
							{#each Object.entries(sortLabels) as [key, label]}
								<button
									onclick={() => { sortMode = key as SortMode; sortMenuOpen = false; }}
									class="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors {sortMode === key ? 'font-medium' : ''} hover:bg-black/5 dark:hover:bg-white/5"
									style={sortMode === key ? 'color: var(--tf-accent);' : ''}
								>
									{label}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			</div>

			<!-- Bulk Mode Toggle -->
			<button
				onclick={() => { bulkMode = !bulkMode; if (!bulkMode) clearSelection(); }}
				class="flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors {bulkMode ? 'text-white' : 'tf-text-muted hover:bg-black/5 dark:hover:bg-white/5'}"
				style={bulkMode ? 'background: var(--tf-accent);' : `border: 1px solid var(--tf-border);`}
			>
				<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>
				<span class="hidden sm:inline">{bulkMode ? 'Auswahl aktiv' : 'Auswählen'}</span>
			</button>
		</div>
	{/if}

	{#if store.lists.length === 0}
		<!-- Empty State -->
		<div class="flex flex-col items-center justify-center py-20">
			<span class="text-6xl mb-4">🦊</span>
			<h2 class="text-xl font-semibold mb-2 tf-text">Willkommen bei TaskFuchs!</h2>
			<p class="tf-text-secondary mb-6 text-center max-w-sm">
				Erstelle deine erste Liste, um loszulegen.
			</p>
			<button
				onclick={handleCreateList}
				class="flex items-center gap-2 px-6 py-3 text-white font-medium rounded-xl hover:shadow-lg active:scale-95 transition-all"
				style="background: var(--tf-accent-gradient);"
			>
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
				</svg>
				Erste Liste erstellen
			</button>
		</div>
	{:else}
		<!-- Mobile: Tab Navigation -->
		<div class="md:hidden mb-4 -mx-4 px-4 sticky top-[57px] z-20 pb-2 pt-2" style="background: var(--tf-header-bg); backdrop-filter: blur(12px); border-bottom: 1px solid var(--tf-border);">
			<div class="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
				{#each visibleLists as list, i (list.id)}
					<button
						onclick={() => (activeListIndex = i)}
						class="px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap flex-shrink-0 transition-all"
						style={i === activeListIndex
							? 'background: var(--tf-accent); color: white;'
							: `color: var(--tf-text-secondary);`}
					>
						{list.icon} {list.title}
					</button>
				{/each}
				<button
					onclick={handleCreateList}
					class="px-2 py-1.5 rounded-lg text-sm flex-shrink-0 transition-colors tf-accent"
					aria-label="Neue Liste erstellen"
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
					</svg>
				</button>
			</div>
		</div>

		<!-- Mobile: Single List View -->
		<div class="md:hidden">
			{#if store.lists[activeListIndex]}
				{#key activeListIndex}
					<div in:fade={{ duration: 150, delay: 50 }} out:fade={{ duration: 100 }}>
						<ListPanel
							list={store.lists[activeListIndex]}
							tasks={filteredTasksForList(store.lists[activeListIndex].id)}
							onRename={store.renameList}
							onDelete={store.deleteList}
							onIconChange={store.changeListIcon}
							onAddTask={store.addTask}
							onToggleTask={store.toggleTask}
							onUpdateTask={store.updateTask}
							onDeleteTask={store.deleteTask}
							onAddSubtask={store.addSubtask}
							onToggleSubtask={store.toggleSubtask}
							onUpdateSubtask={store.updateSubtask}
							onDeleteSubtask={store.deleteSubtask}
							onChangePriority={store.changeTaskPriority}
	
							onEmojiClick={openEmojiPicker}
							onChangeProgress={store.changeTaskProgress}
							onListContext={(e: MouseEvent) => handleListContext(e, store.lists[activeListIndex])}
							onTaskContext={handleTaskContext}
							onNoteClick={openNotePopover}
							onReorderTask={store.reorderTask}
							onReorderSubtask={store.reorderSubtask}
							onShareClick={() => openShareDialog(store.lists[activeListIndex])}
							onTaskClick={openFocusMode}
							{bulkMode}
							{selectedTaskIds}
							onBulkToggle={toggleBulkSelect}
							onSelectAll={selectAllInList}
						/>
					</div>
				{/key}
			{/if}
		</div>

		<!-- Desktop: Side by Side -->
		<div class="hidden md:flex gap-0 overflow-x-auto pb-4">
			{#each visibleLists as list, listIdx (list.id)}
				{#if minimizedListIds.has(list.id)}
					<!-- Minimierte Liste: schmale Spalte mit Icon -->
					<div class="flex-shrink-0 flex flex-col items-center w-12 py-3 rounded-2xl border mx-0.5 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors" style="border-color: var(--tf-border); background: var(--tf-surface);">
						<button
							onclick={() => toggleMinimizeList(list.id)}
							class="flex flex-col items-center gap-2 w-full"
							title="{list.icon} {list.title} — Klick zum Maximieren"
						>
							<span class="text-lg">{list.icon}</span>
							<span class="text-[9px] font-medium tf-text-muted writing-mode-vertical" style="writing-mode: vertical-rl; text-orientation: mixed;">{list.title}</span>
							<span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style="background: var(--tf-accent); color: white;">{filteredTasksForList(list.id).filter(t => !t.parent_id && t.type !== 'divider' && !t.done).length}</span>
						</button>
					</div>
				{:else}
					<div class="flex-shrink-0 flex flex-col" data-col={listIdx} style="width: {getColumnWidth(list.id)}px; min-width: 280px; max-width: 600px;">
						<ListPanel
							{list}
							tasks={filteredTasksForList(list.id)}
							onRename={store.renameList}
							onDelete={store.deleteList}
							onIconChange={store.changeListIcon}
							onAddTask={store.addTask}
							onToggleTask={store.toggleTask}
							onUpdateTask={store.updateTask}
							onDeleteTask={store.deleteTask}
							onAddSubtask={store.addSubtask}
							onToggleSubtask={store.toggleSubtask}
							onUpdateSubtask={store.updateSubtask}
							onDeleteSubtask={store.deleteSubtask}
							onChangePriority={store.changeTaskPriority}
	
							onEmojiClick={openEmojiPicker}
							onChangeProgress={store.changeTaskProgress}
							onListContext={(e: MouseEvent) => handleListContext(e, list)}
							onTaskContext={handleTaskContext}
							onNoteClick={openNotePopover}
							onReorderTask={store.reorderTask}
							onReorderSubtask={store.reorderSubtask}
							onReorderList={(listId: string, newPos: number) => store.reorderList(listId, newPos)}
							onShareClick={() => openShareDialog(list)}
							onTaskClick={openFocusMode}
							listIndex={listIdx}
							{bulkMode}
							{selectedTaskIds}
							onBulkToggle={toggleBulkSelect}
							onSelectAll={selectAllInList}
							onMinimize={() => toggleMinimizeList(list.id)}
						/>
					</div>
					<!-- Resize Handle -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="col-resize-handle"
						onmousedown={(e) => handleResizeStart(e, list.id)}
					></div>
				{/if}
			{/each}

			<!-- Add List Button (Desktop) -->
			<div class="w-[360px] min-w-[280px] flex-shrink-0 space-y-2">
				<button
					onclick={handleCreateList}
					class="w-full h-32 rounded-2xl border-2 border-dashed transition-all flex items-center justify-center gap-2 cursor-pointer tf-text-muted hover:opacity-80"
					style="border-color: var(--tf-border);"
				>
					<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
					</svg>
					<span class="font-medium">Neue Liste</span>
				</button>
				<button
					onclick={loadDemoData}
					disabled={seedingDemo}
					class="w-full py-2 rounded-xl text-xs tf-text-muted hover:opacity-80 transition-colors"
					style="border: 1px dashed var(--tf-border);"
				>
					{seedingDemo ? 'Lade Demo-Daten...' : '🦊 Demo-Daten laden'}
				</button>
			</div>
		</div>
	{/if}
</div>
