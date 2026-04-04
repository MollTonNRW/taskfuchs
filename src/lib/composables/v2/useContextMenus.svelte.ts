import type { Database } from '$lib/types/database';
import type { MenuItem } from '$lib/components/v2/ContextMenu.svelte';
import { priorityLabels, priorityColors, type Priority, timeframeLabels, type Timeframe } from '$lib/constants';
import { showInputDialog } from '$lib/stores/toast';

type List = Database['public']['Tables']['lists']['Row'];
type Task = Database['public']['Tables']['tasks']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'];

export type ContextMenuState = { show: boolean; x: number; y: number; items: MenuItem[] };

// Priority colored dot indicators (matching PoC v6)
const PRIORITY_ICONS: Record<string, string> = {
	low: '\uD83D\uDFE2',    // green circle
	normal: '\uD83D\uDFE1', // yellow circle
	high: '\uD83D\uDD34',   // red circle
	asap: '\uD83D\uDD34'    // red circle (blinks via CSS)
};

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
		changeTaskTimeframe: (taskId: string, timeframe: Timeframe | null) => void;
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
	setSubtasksForceState: (listId: string, open: boolean) => void;
	getActiveListIndex: () => number;
	setActiveListIndex: (idx: number) => void;
	profileMap: Map<string, Profile>;
	userId: string | undefined;
	userEmail: string | undefined;
	openNotePopover: (taskId: string, x: number, y: number) => void;
	openDatePicker: (taskId: string, x: number, y: number) => void;
	openEmojiPicker: (taskId: string, x: number, y: number) => void;
	openShareDialog: (list: List) => void;
	openListIconPicker: (listId: string, x: number, y: number) => void;
}

export function createContextMenus(deps: ContextMenuDeps) {
	let contextMenu = $state<ContextMenuState>({ show: false, x: 0, y: 0, items: [] });

	function handleListContext(e: MouseEvent, list: List) {
		e.preventDefault();
		const { store, collapsedSubtasksListIds, setSubtasksForceState, setActiveListIndex, openShareDialog, openListIconPicker } = deps;
		contextMenu = {
			show: true, x: e.clientX, y: e.clientY,
			items: [
				{ label: 'Neue Aufgabe', icon: '\u2795', action: () => store.addTask(list.id, 'Neue Aufgabe') },
				{
					label: 'Trenner erstellen',
					icon: '\u2796',
					action: () => {
						const listTasks = store.tasks.filter((t) => t.list_id === list.id && !t.parent_id);
						store.createDivider(list.id, listTasks.length, 'Neuer Trenner');
					}
				},
				{ divider: true, label: '' },
				{ label: 'Alle Aufgaben abhaken', icon: '\u2705', action: () => store.checkAllInList(list.id) },
				{ label: 'Erledigte Eintraege loeschen', icon: '\uD83E\uDDF9', action: () => store.deleteDoneInList(list.id) },
				{ label: 'Alle Unteraufgaben loeschen', icon: '\uD83D\uDDD1', action: () => store.deleteAllSubtasksInList(list.id) },
					{ divider: true, label: '' },
				{
					label: 'Unteraufgaben einklappen',
					icon: '\uD83D\uDCC1',
					action: () => {
						setSubtasksForceState(list.id, false);
					}
				},
				{
					label: 'Unteraufgaben ausklappen',
					icon: '\uD83D\uDCC2',
					action: () => {
						setSubtasksForceState(list.id, true);
					}
				},
				{ divider: true, label: '' },
				{
					label: 'Liste duplizieren',
					icon: '\uD83D\uDCCB',
					action: async () => {
						const idx = await store.duplicateList(list.id);
						if (idx >= 0) setActiveListIndex(idx);
					}
				},
				{
					label: 'Liste teilen',
					icon: '\uD83D\uDC65',
					action: () => openShareDialog(list)
				},
				{
					label: 'Liste umbenennen',
					icon: '\u270F\uFE0F',
					action: async () => {
						const newName = await showInputDialog('Liste umbenennen', '', list.title, 'Neuer Listenname');
						if (newName?.trim()) store.renameList(list.id, newName.trim());
					}
				},
				{
					label: 'Icon aendern',
					icon: '\uD83C\uDFA8',
					action: () => openListIconPicker(list.id, e.clientX, e.clientY)
				},
				{ label: 'Liste loeschen', icon: '\uD83D\uDDD1\uFE0F', action: () => store.deleteList(list.id), danger: true }
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
						icon: '\u270F',
						action: async () => {
							const newName = await showInputDialog('Trenner umbenennen', '', task.text, 'Neuer Trenner-Name');
							if (newName?.trim()) store.updateTask(task.id, newName.trim());
						}
					},
					{ label: 'Trenner loeschen', icon: '\uD83D\uDDD1', action: () => store.deleteTaskDirect(task.id), danger: true }
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
						icon: '\uD83D\uDD34',
						submenu: (['low', 'normal', 'high', 'asap'] as Priority[]).map((p) => ({
							label: priorityLabels[p],
							icon: PRIORITY_ICONS[p],
							action: () => store.changeTaskPriority(task.id, p),
							active: task.priority === p
						}))
					},
					{ label: 'Unteraufgabe loeschen', icon: '\uD83D\uDDD1\uFE0F', action: () => store.deleteTaskDirect(task.id), danger: true }
				]
			};
			return;
		}

		const otherLists = store.lists.filter((l) => l.id !== task.list_id);
		const taskSubtaskCount = store.tasks.filter(t => t.parent_id === task.id).length;

		const items: MenuItem[] = [
			{ label: 'Neue Aufgabe darunter', icon: '\u2795', action: () => store.addTaskAfter(task.id, 'Neue Aufgabe') },
			{ label: 'Unteraufgabe erstellen', icon: '\u2795', action: () => store.addSubtask(task.id, 'Neue Unteraufgabe') },
			...(taskSubtaskCount > 0 ? [{
				label: `Unteraufgaben loeschen (${taskSubtaskCount})`,
				icon: '\uD83D\uDDD1',
				action: () => store.deleteAllSubtasksOfTask(task.id)
			} as MenuItem] : []),
			{
				label: task.done ? 'Nicht erledigt' : 'Erledigt',
				icon: '\u2705',
				action: () => store.toggleTask(task.id, !task.done)
			},
			{ divider: true, label: '' },
			{
				label: 'In andere Liste',
				icon: '\uD83D\uDCCB',
				submenu: otherLists.length > 0
					? otherLists.map((l) => ({
						label: `${l.icon} ${l.title}`,
						action: () => store.moveTaskToList(task.id, l.id)
					}))
					: [{ label: 'Keine weiteren Listen', action: () => {} }]
			},
			{
				label: 'Prioritaet',
				icon: '\uD83D\uDD34',
				submenu: (['low', 'normal', 'high', 'asap'] as Priority[]).map((p) => ({
					label: priorityLabels[p],
					icon: PRIORITY_ICONS[p],
					action: () => store.changeTaskPriority(task.id, p),
					active: task.priority === p
				}))
			},
			{
				label: 'Zeitrahmen',
				icon: '\u23F1',
				submenu: [
					{ label: 'Keiner', action: () => store.changeTaskTimeframe(task.id, null), active: !task.timeframe },
					...(['akut', 'zeitnah', 'mittelfristig', 'langfristig'] as Timeframe[]).map((tf) => ({
						label: timeframeLabels[tf],
						action: () => store.changeTaskTimeframe(task.id, tf),
						active: task.timeframe === tf
					}))
				]
			},
			{
				label: 'Zuweisen',
				icon: '\uD83D\uDC64',
				submenu: [
					...(task.assigned_to ? [{ label: '\u274C Niemand', action: () => store.assignTask(task.id, null) }] : []),
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
				label: task.highlighted ? 'Fixierung aufheben' : 'Fixieren',
				icon: '\uD83D\uDCCC',
				action: () => store.toggleHighlight(task.id)
			},
			{
				label: task.pinned ? 'Von Pinnwand loesen' : 'An Pinnwand pinnen',
				icon: '\uD83D\uDCCD',
				action: () => store.togglePin(task.id)
			},
			{
				label: task.note ? 'Notiz bearbeiten' : 'Notiz hinzufuegen',
				icon: '\uD83D\uDCDD',
				action: () => openNotePopover(task.id, contextMenu.x, contextMenu.y)
			},
			{
				label: 'Terminieren',
				icon: '\uD83D\uDCC5',
				action: () => openDatePicker(task.id, contextMenu.x, contextMenu.y)
			},
			{
				label: 'Trenner erstellen',
				icon: '\u2796',
				action: () => {
					store.createDivider(task.list_id, task.position + 1, 'Neuer Trenner');
				}
			},
			{
				label: task.emoji ? 'Symbol aendern' : 'Mit Symbol versehen',
				icon: '\uD83D\uDE00',
				action: () => openEmojiPicker(task.id, contextMenu.x, contextMenu.y)
			}
		];

		// Convert to list
		if (taskSubtaskCount > 0) {
			items.push({
				label: 'In Liste umwandeln',
				icon: '\uD83D\uDCC2',
				action: async () => {
					const idx = await store.convertTaskToList(task.id);
					if (idx >= 0) setActiveListIndex(idx);
				}
			});
		}

		items.push({ divider: true, label: '' });
		items.push({
			label: 'Aufgabe loeschen',
			icon: '\uD83D\uDDD1\uFE0F',
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
