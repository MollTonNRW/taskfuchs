import type { Database } from '$lib/types/database';
import type { MenuItem } from '$lib/components/ContextMenu.svelte';
import { priorityLabels, priorityColors, type Priority } from '$lib/constants';

type List = Database['public']['Tables']['lists']['Row'];
type Task = Database['public']['Tables']['tasks']['Row'];

export type ContextMenuState = { show: boolean; x: number; y: number; items: MenuItem[] };

type Profile = Database['public']['Tables']['profiles']['Row'];

export interface ContextMenuDeps {
	store: {
		tasks: Task[];
		lists: List[];
		addTask: (listId: string, text: string) => void;
		addTaskAfter: (taskId: string, text: string) => void;
		addSubtask: (taskId: string, text: string) => void;
		createDivider: (listId: string, position: number, label: string) => void;
		checkAllInList: (listId: string) => void;
		deleteDoneInList: (listId: string) => void;
		deleteAllSubtasksInList: (listId: string) => void;
		deleteAllSubtasksOfTask: (taskId: string) => void;
		duplicateList: (listId: string) => Promise<number>;
		renameList: (listId: string, name: string) => void;
		deleteList: (listId: string) => void;
		toggleTask: (taskId: string, done: boolean) => void;
		changeTaskPriority: (taskId: string, priority: Priority) => void;
		toggleHighlight: (taskId: string) => void;
		togglePin: (taskId: string) => void;
		updateTask: (taskId: string, text: string) => void;
		updateTaskNote: (taskId: string, note: string) => void;
		updateTaskEmoji: (taskId: string, emoji: string) => void;
		assignTask: (taskId: string, userId: string | null) => void;
		moveTaskToList: (taskId: string, listId: string) => void;
		deleteTaskDirect: (taskId: string) => void;
		convertTaskToList: (taskId: string) => Promise<number>;
	};
	collapsedSubtasksListIds: Set<string>;
	toggleCollapseSubtasks: (listId: string) => void;
	getActiveListIndex: () => number;
	setActiveListIndex: (idx: number) => void;
	profileMap: Map<string, Profile>;
	userId: string | undefined;
	userEmail: string | undefined;
	openNotePopover: (taskId: string, x: number, y: number) => void;
	openDatePicker: (taskId: string, x: number, y: number) => void;
	openEmojiPicker: (taskId: string, x: number, y: number) => void;
}

export function createContextMenus(deps: ContextMenuDeps) {
	let contextMenu = $state<ContextMenuState>({ show: false, x: 0, y: 0, items: [] });

	function handleListContext(e: MouseEvent, list: List) {
		e.preventDefault();
		const { store, collapsedSubtasksListIds, toggleCollapseSubtasks, setActiveListIndex } = deps;
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
				{ label: 'Alle Aufgaben abhaken', icon: { svg: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', color: 'text-green-500' }, action: () => store.checkAllInList(list.id) },
				{ label: 'Erledigte Eintr\u00e4ge l\u00f6schen', icon: { svg: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2', color: 'text-yellow-500' }, action: () => store.deleteDoneInList(list.id) },
				{ label: 'Alle Unteraufgaben l\u00f6schen', icon: { svg: 'M13 5l7 7-7 7M5 5l7 7-7 7', color: 'text-orange-500' }, action: () => store.deleteAllSubtasksInList(list.id) },
				{
					label: collapsedSubtasksListIds.has(list.id) ? 'Unteraufgaben aufklappen' : 'Unteraufgaben einklappen',
					icon: { svg: collapsedSubtasksListIds.has(list.id) ? 'M19 9l-7 7-7-7' : 'M9 5l7 7-7 7', color: 'text-blue-500' },
					action: () => toggleCollapseSubtasks(list.id)
				},
				{ divider: true, label: '' },
				{ label: 'Liste duplizieren', icon: { svg: 'M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z', color: 'text-purple-500' }, action: async () => { const idx = await store.duplicateList(list.id); if (idx >= 0) setActiveListIndex(idx); } },
				{ label: 'Liste umbenennen', icon: { svg: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z', color: 'text-blue-500' }, action: () => { const newName = prompt('Neuer Listenname:', list.title); if (newName?.trim()) store.renameList(list.id, newName.trim()); } },
				{ label: 'Liste l\u00f6schen', icon: { svg: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16' }, action: () => store.deleteList(list.id), danger: true }
			]
		};
	}

	function handleTaskContext(e: MouseEvent, task: Task) {
		e.preventDefault();
		const { store, openNotePopover, openDatePicker, openEmojiPicker, profileMap, userId, userEmail, setActiveListIndex } = deps;

		// Divider: eigenes kompaktes Kontextmen\u00fc
		if (task.type === 'divider') {
			contextMenu = {
				show: true, x: e.clientX, y: e.clientY,
				items: [
					{ label: 'Trenner umbenennen', icon: { svg: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z', color: 'text-blue-500' }, action: () => { const newName = prompt('Neuer Trenner-Name:', task.divider_label || task.text); if (newName?.trim()) store.updateTask(task.id, newName.trim()); } },
					{ label: 'Trenner l\u00f6schen', icon: { svg: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16' }, action: () => store.deleteTaskDirect(task.id), danger: true }
				]
			};
			return;
		}

		const otherLists = store.lists.filter((l) => l.id !== task.list_id);
		const taskSubtaskCount = store.tasks.filter(t => t.parent_id === task.id).length;

		const items: MenuItem[] = [
			{ label: 'Neue Aufgabe darunter', icon: { svg: 'M12 4v16m8-8H4', color: 'text-green-500' }, action: () => store.addTaskAfter(task.id, 'Neue Aufgabe') },
			{ label: 'Unteraufgabe erstellen', icon: { svg: 'M13 5l7 7-7 7M5 5l7 7-7 7', color: 'text-blue-500' }, action: () => store.addSubtask(task.id, 'Neue Unteraufgabe') },
			...(taskSubtaskCount > 0 ? [{
				label: `Unteraufgaben l\u00f6schen (${taskSubtaskCount})`,
				icon: { svg: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16', color: 'text-red-400' },
				action: () => store.deleteAllSubtasksOfTask(task.id)
			} as MenuItem] : []),
			{
				label: task.done ? 'Nicht erledigt' : 'Erledigt',
				icon: task.done
					? { svg: 'M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z', color: 'text-gray-400' }
					: { svg: 'M5 13l4 4L19 7', color: 'text-green-500' },
				action: () => store.toggleTask(task.id, !task.done)
			},
			{ divider: true, label: '' },
			{
				label: 'Priorit\u00e4t',
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
				label: task.pinned ? 'Von Pinnwand l\u00f6sen' : 'An Pinnwand pinnen',
				icon: { svg: 'M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z', color: task.pinned ? 'text-orange-500' : 'text-gray-400', filled: task.pinned ? true : false },
				action: () => store.togglePin(task.id)
			},
			{
				label: task.note ? 'Notiz bearbeiten' : 'Notiz hinzuf\u00fcgen',
				icon: { svg: 'M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z', color: task.note ? 'text-blue-500' : 'text-gray-400', filled: task.note ? true : false },
				action: () => openNotePopover(task.id, contextMenu.x, contextMenu.y)
			},
			{
				label: 'Zuweisen',
				icon: { svg: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z', color: task.assigned_to ? 'text-teal-500' : 'text-gray-400' },
				submenu: [
					...(task.assigned_to ? [{ label: 'Niemand', action: () => store.assignTask(task.id, null), color: '#9ca3af' }] : []),
					...[...profileMap.values()].map((p) => ({
						label: p.display_name || p.username || p.id.slice(0, 8),
						active: task.assigned_to === p.id,
						action: () => store.assignTask(task.id, p.id)
					})),
					...(profileMap.size === 0 && userId ? [{
						label: userEmail?.split('@')[0] || 'Ich',
						active: task.assigned_to === userId,
						action: () => store.assignTask(task.id, userId!)
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
					store.createDivider(task.list_id, task.position + 1, 'Neuer Trenner');
				}
			},
			{
				label: task.emoji ? 'Symbol \u00e4ndern' : 'Mit Symbol versehen',
				icon: '\ud83d\ude0a',
				action: () => openEmojiPicker(task.id, contextMenu.x, contextMenu.y)
			}
		];

		// "In Liste umwandeln" nur anzeigen wenn Task Unteraufgaben hat
		const subtaskCount = store.tasks.filter(t => t.parent_id === task.id).length;
		if (subtaskCount > 0) {
			items.push({
				label: 'In Liste umwandeln',
				icon: { svg: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2', color: 'text-indigo-500' },
				action: async () => {
					const idx = await store.convertTaskToList(task.id);
					if (idx >= 0) setActiveListIndex(idx);
				}
			});
		}

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
			label: 'Aufgabe l\u00f6schen',
			icon: { svg: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16' },
			action: () => store.deleteTaskDirect(task.id),
			danger: true
		});

		contextMenu = { show: true, x: e.clientX, y: e.clientY, items };
	}

	return {
		get contextMenu() { return contextMenu; },
		set contextMenu(v: ContextMenuState) { contextMenu = v; },
		handleListContext,
		handleTaskContext
	};
}
