import type { Database } from '$lib/types/database';
import type { MenuItem } from '$lib/components/v2/ContextMenu.svelte';
import { priorityLabels, priorityColors, type Priority } from '$lib/constants';

type List = Database['public']['Tables']['lists']['Row'];
type Task = Database['public']['Tables']['tasks']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'];

export type ContextMenuState = { show: boolean; x: number; y: number; items: MenuItem[] };

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
	openShareDialog: (list: List) => void;
}

export function createContextMenus(deps: ContextMenuDeps) {
	let contextMenu = $state<ContextMenuState>({ show: false, x: 0, y: 0, items: [] });

	function handleListContext(e: MouseEvent, list: List) {
		e.preventDefault();
		const { store, collapsedSubtasksListIds, toggleCollapseSubtasks, setActiveListIndex, openShareDialog } = deps;
		contextMenu = {
			show: true, x: e.clientX, y: e.clientY,
			items: [
				{ label: 'Neue Aufgabe', icon: '+', action: () => store.addTask(list.id, 'Neue Aufgabe') },
				{
					label: 'Trenner erstellen',
					icon: '\u2500',
					action: () => {
						const listTasks = store.tasks.filter((t) => t.list_id === list.id && !t.parent_id);
						store.createDivider(list.id, listTasks.length, 'Neuer Trenner');
					}
				},
				{ divider: true, label: '' },
				{ label: 'Alle Aufgaben abhaken', icon: '\u2713', action: () => store.checkAllInList(list.id) },
				{ label: 'Erledigte Eintraege loeschen', icon: '\u2327', action: () => store.deleteDoneInList(list.id) },
				{ label: 'Alle Unteraufgaben loeschen', icon: '\u00BB', action: () => store.deleteAllSubtasksInList(list.id) },
				{
					label: collapsedSubtasksListIds.has(list.id) ? 'Unteraufgaben aufklappen' : 'Unteraufgaben einklappen',
					icon: collapsedSubtasksListIds.has(list.id) ? '\u25BC' : '\u25B6',
					action: () => toggleCollapseSubtasks(list.id)
				},
				{ divider: true, label: '' },
				{
					label: 'Liste duplizieren',
					icon: '\u2398',
					action: async () => {
						const idx = await store.duplicateList(list.id);
						if (idx >= 0) setActiveListIndex(idx);
					}
				},
				{
					label: 'Liste teilen',
					icon: '\u2192',
					action: () => openShareDialog(list)
				},
				{
					label: 'Liste umbenennen',
					icon: '\u270E',
					action: () => {
						const newName = prompt('Neuer Listenname:', list.title);
						if (newName?.trim()) store.renameList(list.id, newName.trim());
					}
				},
				{ label: 'Liste loeschen', icon: '\u2715', action: () => store.deleteList(list.id), danger: true }
			]
		};
	}

	function handleTaskContext(e: MouseEvent, task: Task) {
		e.preventDefault();
		const { store, openNotePopover, openDatePicker, openEmojiPicker, profileMap, userId, userEmail, setActiveListIndex } = deps;

		// Divider context menu
		if (task.type === 'divider') {
			contextMenu = {
				show: true, x: e.clientX, y: e.clientY,
				items: [
					{
						label: 'Trenner umbenennen',
						icon: '\u270E',
						action: () => {
							const newName = prompt('Neuer Trenner-Name:', task.text);
							if (newName?.trim()) store.updateTask(task.id, newName.trim());
						}
					},
					{ label: 'Trenner loeschen', icon: '\u2715', action: () => store.deleteTaskDirect(task.id), danger: true }
				]
			};
			return;
		}

		// Subtask context menu
		if (task.parent_id) {
			contextMenu = {
				show: true, x: e.clientX, y: e.clientY,
				items: [
					{
						label: 'Prioritaet',
						icon: '\u2691',
						submenu: (['low', 'normal', 'high', 'asap'] as Priority[]).map((p) => ({
							label: priorityLabels[p],
							action: () => store.changeTaskPriority(task.id, p),
							active: task.priority === p
						}))
					},
					{ label: 'Unteraufgabe loeschen', icon: '\u2715', action: () => store.deleteTaskDirect(task.id), danger: true }
				]
			};
			return;
		}

		const otherLists = store.lists.filter((l) => l.id !== task.list_id);
		const taskSubtaskCount = store.tasks.filter(t => t.parent_id === task.id).length;

		const items: MenuItem[] = [
			{ label: 'Fokus-Modus', icon: '\u25CE', action: () => deps.openNotePopover(task.id, 0, 0) },
			{ label: 'Neue Aufgabe darunter', icon: '+', action: () => store.addTaskAfter(task.id, 'Neue Aufgabe') },
			{ label: 'Unteraufgabe erstellen', icon: '\u2514', action: () => store.addSubtask(task.id, 'Neue Unteraufgabe') },
			...(taskSubtaskCount > 0 ? [{
				label: `Unteraufgaben loeschen (${taskSubtaskCount})`,
				icon: '\u2327',
				action: () => store.deleteAllSubtasksOfTask(task.id)
			} as MenuItem] : []),
			{
				label: task.done ? 'Nicht erledigt' : 'Erledigt',
				icon: task.done ? '\u25A1' : '\u2713',
				action: () => store.toggleTask(task.id, !task.done)
			},
			{ divider: true, label: '' },
			{
				label: 'Prioritaet',
				icon: '\u2691',
				submenu: (['low', 'normal', 'high', 'asap'] as Priority[]).map((p) => ({
					label: priorityLabels[p],
					action: () => store.changeTaskPriority(task.id, p),
					active: task.priority === p
				}))
			},
			{ divider: true, label: '' },
			{
				label: task.highlighted ? 'Fixierung aufheben' : 'Fixieren',
				icon: task.highlighted ? '\u2605' : '\u2606',
				action: () => store.toggleHighlight(task.id)
			},
			{
				label: task.pinned ? 'Von Pinnwand loesen' : 'An Pinnwand pinnen',
				icon: task.pinned ? '\u25A0' : '\u25A1',
				action: () => store.togglePin(task.id)
			},
			{
				label: task.note ? 'Notiz bearbeiten' : 'Notiz hinzufuegen',
				icon: '\u2709',
				action: () => openNotePopover(task.id, contextMenu.x, contextMenu.y)
			},
			{
				label: 'Zuweisen',
				icon: '\u2192',
				submenu: [
					...(task.assigned_to ? [{ label: 'Niemand', action: () => store.assignTask(task.id, null) }] : []),
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
				icon: '\u2637',
				action: () => openDatePicker(task.id, contextMenu.x, contextMenu.y)
			},
			{
				label: 'Trenner erstellen',
				icon: '\u2500',
				action: () => {
					store.createDivider(task.list_id, task.position + 1, 'Neuer Trenner');
				}
			},
			{
				label: task.emoji ? 'Symbol aendern' : 'Mit Symbol versehen',
				icon: '\uD83D\uDE0A',
				action: () => openEmojiPicker(task.id, contextMenu.x, contextMenu.y)
			}
		];

		// Convert to list
		if (taskSubtaskCount > 0) {
			items.push({
				label: 'In Liste umwandeln',
				icon: '\u2630',
				action: async () => {
					const idx = await store.convertTaskToList(task.id);
					if (idx >= 0) setActiveListIndex(idx);
				}
			});
		}

		// Move to other list
		if (otherLists.length > 0) {
			items.push({ divider: true, label: '' });
			items.push({
				label: 'In andere Liste',
				icon: '\u21C4',
				submenu: otherLists.map((l) => ({
					label: `${l.icon} ${l.title}`,
					action: () => store.moveTaskToList(task.id, l.id)
				}))
			});
		}

		items.push({ divider: true, label: '' });
		items.push({
			label: 'Aufgabe loeschen',
			icon: '\u2715',
			action: () => store.deleteTaskDirect(task.id),
			danger: true
		});

		contextMenu = { show: true, x: e.clientX, y: e.clientY, items };
	}

	function close() {
		contextMenu = { show: false, x: 0, y: 0, items: [] };
	}

	return {
		get contextMenu() { return contextMenu; },
		set contextMenu(v: ContextMenuState) { contextMenu = v; },
		handleListContext,
		handleTaskContext,
		close
	};
}
