# Mobile-Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 9 Mobile-UX-Fixes für die TaskFuchs-v2-App: neues Gesten-Modell (Tap→Fokus, Umbenennen mobil möglich), reparierte/entschlackte Kontextmenüs, funktionierender Tab-Long-Press, sichtbarer Neue-Liste-Flow, einzeiliger Header, 52 Umlaut-Korrekturen, Colorful-Theme-Fix, Fixieren-Feature-Entfernung.

**Architecture:** Alle Änderungen betreffen die v2-App (`src/routes/app` + `src/lib/components/v2` + Composables + `src/v2.css`). v1-Komponenten (`src/lib/components/` ohne `v2/`) und `src/lib/stores/filters.ts` bleiben unangetastet. Der Runes-Store `tasks.svelte.ts` und `touchDrag.ts` werden punktuell erweitert. Eine Migration (Daten-Reset) kommt dazu.

**Tech Stack:** SvelteKit 2, Svelte 5 (Runes), TypeScript strict, Tailwind 4/eigenes CSS (`v2.css`), Supabase.

**Spec:** `docs/superpowers/specs/2026-07-07-mobile-fixes-design.md`

## Global Constraints

- Branch: `feature/mobile-fixes`. Commits auf Deutsch, Imperativ.
- UI-Labels Deutsch **mit korrekten Umlauten** (ä/ö/ü/ß); Code-Bezeichner Englisch.
- Keine neuen npm-Dependencies.
- **Kein Test-Framework vorhanden** — Verifikation pro Task via `npm run check` (svelte-check, erwartet `0 errors`); Task 10 macht den manuellen End-to-End-Durchlauf. `npm run check` läuft aus dem Repo-Root `/Users/agentingo/ClaudeProjects/Taskfuchs`.
- v1-Dateien (`src/lib/components/*.svelte` direkt, `src/lib/composables/*.svelte.ts` ohne `v2/`) nur dort ändern, wo dieser Plan es explizit sagt (3 aria-labels in Task 1). `src/lib/stores/filters.ts` NICHT ändern.
- Svelte 5: `ontouchstart`/`ontouchmove` sind passive-by-default, `ontouchend` nicht — `preventDefault()` auf `touchend` ist erlaubt.

---

### Task 1: Umlaut-Korrekturen (52 Stellen)

**Files:**
- Modify: `src/lib/composables/v2/useSortFilter.svelte.ts`, `src/lib/composables/v2/useContextMenus.svelte.ts`, `src/lib/components/FocusOverlay.svelte`, `src/lib/components/ShareDialog.svelte`, `src/lib/components/NotePopover.svelte`, `src/lib/components/v2/DatePicker.svelte`, `src/lib/components/v2/FocusOverlay.svelte`, `src/lib/components/v2/ShareDialog.svelte`, `src/lib/components/v2/ToastContainer.svelte`, `src/lib/components/v2/PriorityPicker.svelte`, `src/lib/components/v2/NotePopover.svelte`, `src/lib/components/v2/BulkToolbar.svelte`, `src/lib/components/v2/ConfirmDialog.svelte`, `src/lib/components/v2/TaskCard.svelte`, `src/lib/components/v2/Pinboard.svelte`, `src/lib/components/v2/WeeklyTracker.svelte`, `src/lib/components/v2/FoxMascot.svelte`, `src/lib/stores/v2/achievements.svelte.ts`, `src/lib/stores/v2/gamification.svelte.ts`, `src/routes/+error.svelte`, `src/routes/app/+layout.svelte`

**Interfaces:**
- Produces: korrigierte UI-Strings. Spätere Tasks, die dieselben Zeilen anfassen (Task 3 in `useContextMenus`), bauen auf den korrigierten Strings auf.

- [ ] **Step 1: Alle Ersetzungen durchführen** (nur String-Literale, keine Bezeichner):

| Datei | Zeile (ca.) | alt → neu |
|---|---|---|
| `composables/v2/useSortFilter.svelte.ts` | 12 | `'Prioritaet'` → `'Priorität'` |
| ebd. | 14 | `'Faelligkeitsdatum'` → `'Fälligkeitsdatum'` |
| `composables/v2/useContextMenus.svelte.ts` | 83 | `'Erledigte Eintraege loeschen'` → `'Erledigte Einträge löschen'` |
| ebd. | 84 | `'Alle Unteraufgaben loeschen'` → `'Alle Unteraufgaben löschen'` |
| ebd. | 123 | `'Icon aendern'` → `'Icon ändern'` |
| ebd. | 127 | `'Liste loeschen'` → `'Liste löschen'` |
| ebd. | 149 | `'Trenner loeschen'` → `'Trenner löschen'` |
| ebd. | 161 | `'Prioritaet'` → `'Priorität'` |
| ebd. | 170 | `'Unteraufgabe loeschen'` → `'Unteraufgabe löschen'` |
| ebd. | 183 | `` `Unteraufgaben loeschen (${taskSubtaskCount})` `` → `` `Unteraufgaben löschen (${taskSubtaskCount})` `` |
| ebd. | 204 | `'Prioritaet'` → `'Priorität'` |
| ebd. | 249 | `'Von Pinnwand loesen'` → `'Von Pinnwand lösen'` |
| ebd. | 254 | `'Notiz hinzufuegen'` → `'Notiz hinzufügen'` |
| ebd. | 271 | `'Symbol aendern'` → `'Symbol ändern'` |
| ebd. | 291 | `'Aufgabe loeschen'` → `'Aufgabe löschen'` |
| `components/FocusOverlay.svelte` (v1) | 134 | `aria-label="Schliessen"` → `"Schließen"` |
| `components/ShareDialog.svelte` (v1) | 84 | `aria-label="Schliessen"` → `"Schließen"` |
| `components/NotePopover.svelte` (v1) | 64 | `aria-label="Notiz speichern und schliessen"` → `"…schließen"` |
| `components/v2/DatePicker.svelte` | 45 | `Faellig am` → `Fällig am` |
| `components/v2/FocusOverlay.svelte` | 102 | `aria-label="Schliessen"` → `"Schließen"` |
| ebd. | 112 | `title="Emoji aendern"` → `"Emoji ändern"` |
| `components/v2/ShareDialog.svelte` | 30 | `'Bitte eine gueltige E-Mail eingeben'` → `'Bitte eine gültige E-Mail eingeben'` |
| ebd. | 76 | `aria-label="Schliessen"` → `"Schließen"` |
| `components/v2/ToastContainer.svelte` | 19 | `Rueckgaengig` → `Rückgängig` |
| ebd. | 25 | `aria-label="Schliessen"` → `"Schließen"` |
| `components/v2/PriorityPicker.svelte` | 43 | `Prioritaet` → `Priorität` |
| `components/v2/NotePopover.svelte` | 51 | `aria-label="Speichern und schliessen"` → `"…schließen"` |
| `components/v2/BulkToolbar.svelte` | 31 | `ausgewaehlt` → `ausgewählt` |
| ebd. | 36 | `title="Prioritaet"` → `"Priorität"` |
| ebd. | 60 | `title="Loeschen"` → `"Löschen"` |
| `components/v2/ConfirmDialog.svelte` | 44 | `Bestaetigen` → `Bestätigen` |
| `components/v2/TaskCard.svelte` | 194 | `'Abwaehlen' : 'Auswaehlen'` → `'Abwählen' : 'Auswählen'` |
| ebd. | 211 | `'Aufgabe wieder oeffnen'` → `'Aufgabe wieder öffnen'` |
| `components/v2/Pinboard.svelte` | 101 | `Alle loesen` → `Alle lösen` |
| ebd. | 127 | `title="Loesen"` → `"Lösen"` |
| `components/v2/WeeklyTracker.svelte` | 30 | `Gute Haelfte geschafft!` → `Gute Hälfte geschafft!` |
| ebd. | 31 | `Schritt fuer Schritt.` → `Schritt für Schritt.` |
| `components/v2/FoxMascot.svelte` | 9 | `Fleissig heute!` → `Fleißig heute!` |
| `stores/v2/achievements.svelte.ts` | 51 | `Fleissiger Fuchs` → `Fleißiger Fuchs` |
| ebd. | 59 | `Aufgaben-Jaeger` → `Aufgaben-Jäger` |
| ebd. | 131 | `Fruehaufsteher` → `Frühaufsteher` |
| `stores/v2/gamification.svelte.ts` | 13 | `'Anfaenger'` → `'Anfänger'`, `'Grossmeister'` → `'Großmeister'` (im RANKS-Array) |
| ebd. | 32 | `return 'Anfaenger'` → `return 'Anfänger'` |
| ebd. | 36 | `return 'Grossmeister'` → `return 'Großmeister'` |
| `routes/+error.svelte` | 17 | `Zurueck zur App` → `Zurück zur App` |
| `routes/app/+layout.svelte` | 75 | `fruehschicht` → `frühschicht` |
| ebd. | 76 | `laeuft bei dir` → `läuft bei dir` |
| ebd. | 322 | `Gruener Terminal-Look` → `Grüner Terminal-Look` |
| ebd. | 330 | `Fuer die Effizienten` → `Für die Effizienten` |
| ebd. | 331 | `Fuer die Perfektionisten` → `Für die Perfektionisten` |
| ebd. | 399 | `aria-label="Sidebar schliessen"` → `"Sidebar schließen"` |
| ebd. | 454 | `aria-label="Prioritaet-Filter ein-/ausklappen"` → `"Prioritäts-Filter ein-/ausklappen"` |
| ebd. | 457 | Text `Prioritaet` → `Priorität` |
| ebd. | 525 | `aria-label="Filter zuruecksetzen"` → `"Filter zurücksetzen"` |
| ebd. | 527 | Text `Filter zuruecksetzen` → `Filter zurücksetzen` |
| ebd. | 822 | `'☑ Auswaehlen' : '☐ Auswaehlen'` → `'☑ Auswählen' : '☐ Auswählen'` |
| ebd. | 840 | `aria-label="Suche oeffnen"` → `"Suche öffnen"` |

**WICHTIG (RANKS-Kopplung):** In `gamification.svelte.ts` sind Zeile 13 (`RANKS` as-const-Array) und die `return`-Werte in `rankFromLevel` (Z. 32, 36) typgekoppelt (`type Rank = (typeof RANKS)[number]`) — alle drei zusammen ändern, sonst TS-Fehler. **Prüfen:** ob Rank-Strings irgendwo persistiert/verglichen werden: `grep -rn "Anfaenger\|Grossmeister" src/ supabase/` — jede weitere Fundstelle konsistent mitziehen.

- [ ] **Step 2: Verifizieren**

Run: `grep -rnE "loesch|aendern|Prioritaet|Auswaehlen|Schliessen|zuruecksetzen|oeffnen|fuer die|Fleissig|Jaeger|Frueh|Anfaenger|Grossmeister|Rueckgaengig|ausgewaehlt|Bestaetigen|Faellig|gueltige|Haelfte|loesen|laeuft|fruehschicht|Gruener|Zurueck" src/ --include="*.svelte" --include="*.ts" | grep -v "Erstelldatum"`
Expected: keine Treffer in user-sichtbaren Strings (Code-Bezeichner wie `loeschen` existieren nicht — Liste muss leer sein oder nur False-Positives in Kommentaren zeigen).

Run: `npm run check`
Expected: `0 errors`

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "Umlaute in UI-Strings korrigieren (52 Stellen)"
```

---

### Task 2: ContextMenu reparieren (Scrolling, Clamping, Submenu, Ghost-Click)

**Files:**
- Modify: `src/lib/components/v2/ContextMenu.svelte` (kompletter Script-/Template-Umbau unten)
- Modify: `src/v2.css:1200-1213` (.v2-context-menu) und `src/v2.css:1258-1271` (.v2-context-submenu)

**Interfaces:**
- Consumes: Props `items: MenuItem[]`, `x: number`, `y: number`, `onclose: () => void` (unverändert — Aufrufer in `+page.svelte:947-954` bleibt wie er ist).
- Produces: Backdrop mit 350-ms-Öffnungs-Grace (Basis für Task 8), scrollbares Menü, viewport-geklemmte Submenüs.

- [ ] **Step 1: `ContextMenu.svelte` Script + Template ersetzen** — vollständiger neuer Inhalt:

```svelte
<script lang="ts">
	export type MenuItem = {
		label: string;
		icon?: string;
		action?: () => void;
		danger?: boolean;
		divider?: boolean;
		submenu?: { label: string; icon?: string; action: () => void; active?: boolean; blink?: boolean }[];
	};

	let {
		items,
		x,
		y,
		onclose
	}: {
		items: MenuItem[];
		x: number;
		y: number;
		onclose: () => void;
	} = $props();

	let menuEl: HTMLDivElement | undefined = $state();
	let submenuEl: HTMLDivElement | undefined = $state();
	let activeSubmenu = $state<string | null>(null);
	let submenuAnchor = $state<DOMRect | null>(null);

	// Grace-Periode: Ghost-Clicks und native contextmenu-Events direkt nach dem
	// Öffnen (Long-Press-Finger liegt noch auf / hebt gerade ab) dürfen das Menü
	// nicht sofort wieder schließen.
	let openedAt = Date.now();
	$effect(() => {
		void items; void x; void y;
		openedAt = Date.now();
		activeSubmenu = null;
	});
	function guardedClose() {
		if (Date.now() - openedAt < 350) return;
		onclose();
	}

	// Hauptmenü in den Viewport klemmen. x/y werden UNBEDINGT vor dem if gelesen,
	// damit der Effect bei jeder Positionsänderung erneut läuft (Svelte-5-Tracking).
	$effect(() => {
		const px = x;
		const py = y;
		if (!menuEl) return;
		menuEl.style.left = `${px}px`;
		menuEl.style.top = `${py}px`;
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		// offsetWidth/Height statt getBoundingClientRect: unbeeinflusst von der
		// scale()-Einblendeanimation
		const mw = menuEl.offsetWidth;
		const mh = menuEl.offsetHeight;
		if (px + mw > vw - 8) menuEl.style.left = `${Math.max(8, vw - mw - 8)}px`;
		if (py + mh > vh - 8) {
			const flippedTop = py - mh;
			menuEl.style.top = `${flippedTop >= 8 ? flippedTop : Math.max(8, vh - mh - 8)}px`;
		}
	});

	function openSubmenu(label: string, anchorEl: HTMLElement) {
		submenuAnchor = anchorEl.getBoundingClientRect();
		activeSubmenu = label;
	}

	function toggleSubmenu(label: string, anchorEl: HTMLElement) {
		if (activeSubmenu === label) {
			activeSubmenu = null;
		} else {
			openSubmenu(label, anchorEl);
		}
	}

	// Submenü (position:fixed) horizontal + vertikal in den Viewport klemmen
	$effect(() => {
		const anchor = submenuAnchor;
		if (!submenuEl || !anchor) return;
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const sw = submenuEl.offsetWidth;
		const sh = submenuEl.offsetHeight;
		let left = anchor.right;
		if (left + sw > vw - 8) left = Math.max(8, anchor.left - sw);
		let top = anchor.top - 1;
		if (top + sh > vh - 8) top = Math.max(8, vh - sh - 8);
		submenuEl.style.left = `${left}px`;
		submenuEl.style.top = `${top}px`;
	});
</script>

<!-- Backdrop -->
<div
	class="fixed inset-0"
	style="z-index: 9998;"
	onclick={guardedClose}
	oncontextmenu={(e) => { e.preventDefault(); guardedClose(); }}
	role="presentation"
></div>

<!-- Menu -->
<div
	bind:this={menuEl}
	class="v2-context-menu"
	style="left: {x}px; top: {y}px;"
>
	{#each items as item}
		{#if item.divider}
			<div class="v2-context-menu-divider"></div>
		{:else if item.submenu}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="v2-ctx-submenu-wrap"
				onmouseenter={(e) => openSubmenu(item.label, e.currentTarget as HTMLElement)}
				onmouseleave={() => (activeSubmenu = null)}
			>
				<button
					class="v2-context-menu-item"
					style="width: 100%;"
					onclick={(e) => toggleSubmenu(item.label, e.currentTarget as HTMLElement)}
				>
					{#if item.icon}<span class="v2-ctx-icon">{item.icon}</span>{/if}
					<span style="flex: 1; text-align: left;">{item.label}</span>
					<span class="v2-ctx-arrow">&#x25B6;</span>
				</button>
				{#if activeSubmenu === item.label}
					<div bind:this={submenuEl} class="v2-context-submenu">
						{#each item.submenu as sub}
							<button
								class="v2-context-menu-item {sub.active ? 'v2-ctx-submenu-active' : ''} {sub.blink ? 'v2-ctx-asap-blink' : ''}"
								style="width: 100%;"
								onclick={() => { sub.action(); onclose(); }}
							>
								{#if sub.icon}<span class="v2-ctx-icon">{sub.icon}</span>{/if}
								<span>{sub.label}</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{:else}
			<button
				class="v2-context-menu-item {item.danger ? 'danger' : ''}"
				style="width: 100%;"
				onclick={() => { item.action?.(); onclose(); }}
			>
				{#if item.icon}<span class="v2-ctx-icon">{item.icon}</span>{/if}
				<span>{item.label}</span>
			</button>
		{/if}
	{/each}
</div>
```

Hinweise: `submenuDirection` entfällt (Klemmung übernimmt der Effect). Das Submenü wird `position: fixed` (Step 2), daher clippt das jetzt scrollende Hauptmenü es nicht.

- [ ] **Step 2: CSS anpassen** — in `src/v2.css`:

`.v2-context-menu` (Z. 1200-1213): `max-height: 80vh; overflow: visible;` ersetzen durch:

```css
  max-height: calc(100dvh - 16px);
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
```

`.v2-context-submenu` (Z. 1258-1271): `position: absolute; left: 100%; top: -1px;` ersetzen durch:

```css
  position: fixed;
  max-height: min(60vh, 400px);
  overflow-y: auto;
```

(übrige Deklarationen beider Regeln unverändert lassen)

- [ ] **Step 3: Verifizieren**

Run: `npm run check`
Expected: `0 errors`

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/v2/ContextMenu.svelte src/v2.css
git commit -m "Kontextmenü scrollbar machen, Viewport-Clamping fixen, Ghost-Click-Schutz"
```

---

### Task 3: Menü-Inhalte umbauen (Umbenennen, Auswählen, Einträge entfernen, Undo)

**Files:**
- Modify: `src/lib/composables/v2/useContextMenus.svelte.ts`
- Modify: `src/lib/stores/tasks.svelte.ts:664-681` (deleteAllSubtasksOfTask → Undo; deleteAllSubtasksInList entfernen) und Export-Block (~Z. 960-970)
- Modify: `src/routes/app/+page.svelte` (ctxDeps, NotePopover-Entfernung)

**Interfaces:**
- Consumes: `showInputDialog(title: string, message: string, defaultValue?: string, placeholder?: string): Promise<string | null>` aus `$lib/stores/toast` (bereits importiert in useContextMenus); `undoableBulkDelete(deleted: Task[], message: string)` (privat in tasks.svelte.ts).
- Produces: `ContextMenuDeps` NEU mit `startBulkSelect: (taskId: string) => void` (top-level, neben `openDatePicker`); OHNE `store.toggleTask`, `store.toggleHighlight`, `store.updateTaskNote`, `store.deleteAllSubtasksInList` und OHNE `openNotePopover`. Task 5/6 verlassen sich darauf, dass `ctx.handleTaskContext(e, task)` für Subtasks (task.parent_id gesetzt) das Subtask-Menü inkl. „Umbenennen" liefert.

- [ ] **Step 1: `tasks.svelte.ts` — `deleteAllSubtasksOfTask` auf Undo umstellen, `deleteAllSubtasksInList` löschen**

Ersetze Z. 664-681 (beide Funktionen) durch:

```typescript
	function deleteAllSubtasksOfTask(taskId: string) {
		const deleted = tasks.filter(t => t.parent_id === taskId);
		if (deleted.length === 0) return;
		tasks = tasks.filter(t => t.parent_id !== taskId);
		undoableBulkDelete(deleted, `${deleted.length} Unteraufgaben gelöscht`);
	}
```

Im Return-Block des Stores (~Z. 967) `deleteAllSubtasksInList,` entfernen (`deleteAllSubtasksOfTask` bleibt exportiert). `grep -n "deleteAllSubtasksInList" src/` → einzige verbliebene Treffer in useContextMenus/+page werden in Step 2/3 entfernt.

- [ ] **Step 2: `useContextMenus.svelte.ts` umbauen**

(a) Interface `ContextMenuDeps` (Z. 20-61): im `store`-Block die Zeilen `deleteAllSubtasksInList`, `toggleTask`, `toggleHighlight`, `updateTaskNote` **entfernen**; top-level die Zeile `openNotePopover: (taskId: string, x: number, y: number) => void;` **entfernen** und ersetzen durch:

```typescript
	startBulkSelect: (taskId: string) => void;
```

(b) Listen-Menü (`handleListContext`): Zeile `{ label: 'Alle Unteraufgaben löschen', icon: '🗑', action: () => store.deleteAllSubtasksInList(list.id) },` **entfernen**.

(c) Subtask-Menü (Z. 156-174): „Umbenennen" als ersten Eintrag ergänzen:

```typescript
		// Subtask context menu
		if (task.parent_id) {
			contextMenu = {
				show: true, x: e.clientX, y: e.clientY,
				items: [
					{
						label: 'Umbenennen',
						icon: '✏️',
						action: async () => {
							const newName = await showInputDialog('Unteraufgabe umbenennen', '', task.text, 'Neuer Text');
							if (newName?.trim()) store.updateTask(task.id, newName.trim());
						}
					},
					{
						label: 'Priorität',
						icon: '🔴',
						submenu: (['low', 'normal', 'high', 'asap'] as Priority[]).map((p) => ({
							label: priorityLabels[p],
							icon: PRIORITY_ICONS[p],
							action: () => store.changeTaskPriority(task.id, p),
							active: task.priority === p
						}))
					},
					{ label: 'Unteraufgabe löschen', icon: '🗑️', action: () => store.deleteTaskDirect(task.id), danger: true }
				]
			};
			return;
		}
```

(d) Task-Menü: den kompletten `items`-Block (Z. 179-275) ersetzen durch:

```typescript
		const items: MenuItem[] = [
			{
				label: 'Umbenennen',
				icon: '✏️',
				action: async () => {
					const newName = await showInputDialog('Aufgabe umbenennen', '', task.text, 'Neuer Text');
					if (newName?.trim()) store.updateTask(task.id, newName.trim());
				}
			},
			{ label: 'Neue Aufgabe darunter', icon: '➕', action: () => store.addTaskAfter(task.id, 'Neue Aufgabe') },
			{ label: 'Unteraufgabe erstellen', icon: '➕', action: () => store.addSubtask(task.id, 'Neue Unteraufgabe') },
			...(taskSubtaskCount > 0 ? [{
				label: `Unteraufgaben löschen (${taskSubtaskCount})`,
				icon: '🗑',
				action: () => store.deleteAllSubtasksOfTask(task.id)
			} as MenuItem] : []),
			{ label: 'Auswählen', icon: '☑', action: () => deps.startBulkSelect(task.id) },
			{ divider: true, label: '' },
			{
				label: 'In andere Liste',
				icon: '📋',
				submenu: otherLists.length > 0
					? otherLists.map((l) => ({
						label: `${l.icon} ${l.title}`,
						action: () => store.moveTaskToList(task.id, l.id)
					}))
					: [{ label: 'Keine weiteren Listen', action: () => {} }]
			},
			{
				label: 'Priorität',
				icon: '🔴',
				submenu: (['low', 'normal', 'high', 'asap'] as Priority[]).map((p) => ({
					label: priorityLabels[p],
					icon: PRIORITY_ICONS[p],
					action: () => store.changeTaskPriority(task.id, p),
					active: task.priority === p
				}))
			},
			{
				label: 'Zeitrahmen',
				icon: '⏱',
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
				icon: '👤',
				submenu: [
					...(task.assigned_to ? [{ label: '❌ Niemand', action: () => store.assignTask(task.id, null) }] : []),
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
				label: task.pinned ? 'Von Pinnwand lösen' : 'An Pinnwand pinnen',
				icon: '📍',
				action: () => store.togglePin(task.id)
			},
			{
				label: 'Terminieren',
				icon: '📅',
				action: () => openDatePicker(task.id, contextMenu.x, contextMenu.y)
			},
			{
				label: task.emoji ? 'Symbol ändern' : 'Mit Symbol versehen',
				icon: '😀',
				action: () => openEmojiPicker(task.id, contextMenu.x, contextMenu.y)
			}
		];
```

Entfallen damit: „Erledigt/Nicht erledigt", „Fixieren/Fixierung aufheben", „Notiz hinzufügen/bearbeiten", „Trenner erstellen". Der „In Liste umwandeln"-Block und der „Aufgabe löschen"-Abschluss (Z. 277-295) bleiben unverändert. In der Destrukturierung am Funktionsanfang (`const { store, openNotePopover, … } = deps;`) `openNotePopover` entfernen und `deps.startBulkSelect` nutzen (Destrukturierung von `deps` um `startBulkSelect` ergänzen oder direkt `deps.startBulkSelect` aufrufen — Code oben nutzt `deps.startBulkSelect`, dafür `handleTaskContext` auf `const { store, openDatePicker, openEmojiPicker, profileMap, userId, userEmail, setActiveListIndex } = deps;` reduzieren).

- [ ] **Step 3: `+page.svelte` anpassen**

(a) In `ctxDeps` (Z. 270-315): die Zeilen `deleteAllSubtasksInList: …`, `toggleTask: …`, `toggleHighlight: …`, `updateTaskNote: …` und `openNotePopover: …` **entfernen**; ergänzen:

```typescript
		startBulkSelect: (taskId: string) => {
			explicitBulkMode = true;
			bulkSelectedIds = new Set([...bulkSelectedIds, taskId]);
		},
```

(b) NotePopover stilllegen: Import `NotePopover` (Z. 23) entfernen, Render-Block `{#if popovers.notePopover.show}…{/if}` (Z. 956-965) entfernen, Escape-Handler-Zeile für notePopover (Z. 372) entfernen. (`usePopovers` selbst bleibt unverändert — `notePopover`-State ist dann schlicht inaktiv. Notizen werden weiterhin im Fokus-Overlay bearbeitet.)

- [ ] **Step 4: Verifizieren**

Run: `npm run check` → `0 errors`. Zusätzlich: `grep -rn "deleteAllSubtasksInList\|openNotePopover" src/routes/app src/lib/composables/v2 src/lib/stores/tasks.svelte.ts` → keine Treffer (v1-Composables dürfen Treffer haben — nicht anfassen; `usePopovers.svelte.ts` behält seine `openNotePopover`-Funktion, das ist OK).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Task-Menü umbauen: Umbenennen + Auswählen rein, Erledigt/Fixieren/Notiz/Trenner raus, Undo für Unteraufgaben-Löschen"
```

---

### Task 4: Fixieren-Feature komplett entfernen

**Files:**
- Modify: `src/lib/stores/tasks.svelte.ts:305-313` (+ Export ~Z. 967, + Z. 517-520)
- Modify: `src/lib/composables/v2/useSortFilter.svelte.ts:44-50`
- Modify: `src/lib/components/v2/TaskCard.svelte:179`
- Modify: `src/v2.css:1034-1035, 1503-1507`
- Modify: `src/routes/app/+layout.svelte:487-491`
- Create: `supabase/migrations/020_reset_highlighted.sql`

**Interfaces:**
- Consumes: nichts aus früheren Tasks (Task 3 hat die Menü-/Deps-Seite bereits entfernt).
- Produces: `store.toggleHighlight` existiert nicht mehr. `filters.ts`, v1-Komponenten und die DB-Spalte `highlighted` bleiben bestehen.

- [ ] **Step 1: Store bereinigen** — in `tasks.svelte.ts`:

(a) Funktion `toggleHighlight` (Z. 305-313) komplett löschen; im Export-Block (`toggleHighlight, togglePin, clearPinboard,` ~Z. 967) `toggleHighlight,` entfernen.

(b) In `reorderTask` (Z. 517-522): den highlighted-Vorrang aus dem visuellen Comparator entfernen — aus

```typescript
		// Visuelle Sortierung (gleich wie activeTasks in ListPanel): highlighted zuerst, dann position
		const visualSort = (a: Task, b: Task) => {
			if (a.highlighted && !b.highlighted) return -1;
			if (!a.highlighted && b.highlighted) return 1;
			return a.position - b.position;
		};
```

wird

```typescript
		// Visuelle Sortierung (gleich wie activeTasks in ListPanel): nach position
		const visualSort = (a: Task, b: Task) => a.position - b.position;
```

(`visualSort` wird weiter unten in der Funktion mehrfach benutzt — Name und Signatur unverändert lassen.)

- [ ] **Step 2: Sortierung v2** — `useSortFilter.svelte.ts` Z. 44-51: aus

```typescript
		if (sortMode === 'position') {
			return [...taskList].sort((a, b) => {
				if (a.highlighted && !b.highlighted) return -1;
				if (!a.highlighted && b.highlighted) return 1;
				return a.position - b.position;
			});
		}
```

wird

```typescript
		if (sortMode === 'position') {
			return [...taskList].sort((a, b) => a.position - b.position);
		}
```

- [ ] **Step 3: UI + CSS** —
(a) `TaskCard.svelte` Z. 179: Zeile `class:v2-highlighted={task.highlighted}` löschen.
(b) `v2.css`: Z. 1034-1035 (`/* Highlighted task */` + `.v2-highlighted { … }`) löschen; Z. 1503-1507 (`/* Highlight pulse */` + `@keyframes v2-highlight-pulse { … }`) löschen.
(c) `+layout.svelte` Z. 487-491: das `<label class="v2-filter-check">`-Block-Element mit der „Nur Fixierte"-Checkbox löschen (die Blöcke „Mit Termin" und „Geteilte Listen" bleiben). Der Import `viewFilters`/`toggleViewFilter` bleibt (wird von den anderen Checkboxen genutzt).

- [ ] **Step 4: Migration anlegen** — `supabase/migrations/020_reset_highlighted.sql`:

```sql
-- 020: Fixieren-Feature entfernt (UI). Bestehende Fixierungen zuruecksetzen,
-- damit keine Task dauerhaft im (nicht mehr abschaltbaren) Zustand haengt.
-- Die Spalte tasks.highlighted bleibt aus Kompatibilitaetsgruenden bestehen.
update public.tasks set highlighted = false where highlighted = true;
```

**Manueller Schritt (nicht Teil dieses Plans):** Migration auf Prod anwenden (Supabase SQL-Editor / CLI) — dem User melden.

- [ ] **Step 5: Verifizieren**

Run: `npm run check` → `0 errors`. `grep -rn "toggleHighlight\|v2-highlighted\|v2-highlight-pulse" src/lib/components/v2 src/lib/composables/v2 src/lib/stores/tasks.svelte.ts src/routes/app src/v2.css` → keine Treffer.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Fixieren-Feature entfernen (UI, Sortierung, Filter) + Migration 020"
```

---

### Task 5: Tap→Fokus-Gestenmodell (TaskCard, ListPanel, +page, touchDrag)

**Files:**
- Modify: `src/lib/components/v2/TaskCard.svelte`
- Modify: `src/lib/components/v2/ListPanel.svelte`
- Modify: `src/routes/app/+page.svelte`
- Modify: `src/lib/actions/touchDrag.ts`
- Modify: `src/v2.css` (Task-Card-Regel ~Z. 910)

**Interfaces:**
- Consumes: Task-3-Menüstruktur (unverändert nutzbar über `oncontextmenu`).
- Produces: TaskCard-Props NEU: `onopen?: (task: Task) => void` (ersetzt `ondblclick`); Props `onedit` und `ondblclick` existieren nicht mehr. ListPanel-Prop `onTaskOpen: (task: Task) => void` (ersetzt `onTaskDblClick`), Prop `onEditTask` entfällt. Task 6 verdrahtet `oncontextmenu` zusätzlich für Subtasks.

- [ ] **Step 1: `touchDrag.ts` — Click nach Hold/Drag unterdrücken**

Nach der Modul-Variablen `let scrollRAF: number | null = null;` (Z. 39) ergänzen:

```typescript
// Unterdrückt den vom Browser nach touchend synthetisierten Click —
// nötig, weil ein Tap auf der Karte jetzt den Fokus-Modus öffnet und ein
// beendeter Hold/Drag sonst wie ein Tap wirken würde.
function suppressNextClick() {
	const blocker = (e: MouseEvent) => {
		e.stopPropagation();
		e.preventDefault();
	};
	window.addEventListener('click', blocker, { capture: true, once: true });
	setTimeout(() => window.removeEventListener('click', blocker, { capture: true } as EventListenerOptions), 400);
}
```

In `touchDragHandle`: neben `let holdTimer` (Z. 154) ein `let holdFired = false;` ergänzen. In `onTouchStart` (Z. 224) nach `dragStarted = false;` ein `holdFired = false;` ergänzen. Im `holdTimer`-Callback (Z. 236-242) nach `holdTimer = null;` ein `holdFired = true;` ergänzen. In `onTouchEnd` (Z. 245) als erste Zeile:

```typescript
		if (holdFired || dragStarted) suppressNextClick();
```

- [ ] **Step 2: `TaskCard.svelte` umbauen**

(a) Props: `onedit` und `ondblclick` (Deklaration Z. 18-20 + Typ Z. 37-39) ersetzen durch `onopen`:

```typescript
		onopen,
```
```typescript
		onopen?: (task: Task) => void;
```

(b) Toten Inline-Edit-Code löschen: `editing`/`editText`/`editInput`-States (Z. 50-52), `startEdit`/`saveEdit`/`handleKeydown` (Z. 106-123), `handleDblClick` (Z. 125-131) sowie den `{#if editing}`-Input-Block im Template (Z. 219-227 — der `{:else}`-Zweig mit `.v2-task-text` bleibt als einziger Inhalt). Imports `tick` (Z. 2) entfernen (wird sonst unbenutzt).

(c) Neue Handler im Script:

```typescript
	// Natives Long-Press-Kontextmenü (Android) unterdrücken: auf Touch öffnet
	// das Menü ausschließlich der ⋮-Button; Long-Press gehört exklusiv dem Drag.
	let lastTouchTs = 0;
	function handleTouchStart() {
		lastTouchTs = Date.now();
	}

	function handleContext(e: MouseEvent) {
		e.preventDefault();
		if (Date.now() - lastTouchTs < 700) return;
		oncontextmenu?.(e, task);
	}

	function handleCardClick() {
		if (bulkMode) {
			onBulkToggle?.(task.id);
		} else {
			onopen?.(task);
		}
	}
```

(d) Karten-Root (Z. 177-187) anpassen:

```svelte
<div
	class="v2-glass-card v2-task-card"
	class:v2-bulk-selected={bulkSelected}
	data-priority={task.priority}
	onclick={handleCardClick}
	oncontextmenu={handleContext}
	ontouchstart={handleTouchStart}
	draggable="true"
	ondragstart={ondragstart}
	ondragend={ondragend}
>
```

(die `class:v2-highlighted`-Zeile ist seit Task 4 weg; `ondblclick` entfällt; `draggable` ist konstant, da `editing` nicht mehr existiert). Direkt darüber den bestehenden svelte-ignore-Kommentar um click-events ergänzen: `<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->`.

(e) **Checkbox-Bubbling stoppen** (KRITISCH — sonst öffnet Abhaken den Fokus-Modus): Haupt-Checkbox (Z. 206-214) ändern von `onclick={() => ontoggle(task.id)}` zu:

```svelte
		onclick={(e) => { e.stopPropagation(); ontoggle(task.id); }}
```

(Bulk-Checkbox, Subtask-Zähler und ⋮-Button haben bereits `stopPropagation`.)

(f) SubtaskCard-Aufruf (Z. 284-290): unverändert lassen (Task 6 erweitert ihn).

- [ ] **Step 3: `ListPanel.svelte` anpassen**

Props: `onEditTask` (Z. 17 + Typ Z. 36) entfernen; `onTaskDblClick` (Z. 21 + Typ Z. 40) umbenennen in `onTaskOpen` (gleiche Signatur `(task: Task) => void`). In beiden TaskCard-Aufrufen (aktive Liste Z. 248-267, Done-Sektion Z. 293-302): Zeile `onedit={onEditTask}` löschen, `ondblclick={onTaskDblClick}` ersetzen durch `onopen={onTaskOpen}`.

- [ ] **Step 4: `+page.svelte` anpassen**

(a) `handleTaskDblClick` (Z. 523-525) umbenennen in `handleTaskOpen` (Inhalt identisch: `popovers.openFocusMode(task.id);`).
(b) Beide ListPanel-Aufrufe (Scroll-View Z. 730-749, Single-List Z. 855-874): `onEditTask={handleEditTask}` löschen, `onTaskDblClick={handleTaskDblClick}` → `onTaskOpen={handleTaskOpen}`. (`onEditSubtask={handleEditTask}` bleibt!)
(c) Alle drei Kanban-TaskCard-Aufrufe (Z. 768-784, 800-816, 830-839): `onedit={handleEditTask}` löschen, `ondblclick={handleTaskDblClick}` → `onopen={handleTaskOpen}`.
(d) `handleEditTask` bleibt bestehen (genutzt von FocusOverlay `onUpdate` + `onUpdateSubtask` und ListPanel `onEditSubtask`).

- [ ] **Step 5: CSS** — in `src/v2.css` der Regel `.v2-task-card` (Z. 910-918) ergänzen:

```css
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
```

- [ ] **Step 6: Verifizieren**

Run: `npm run check` → `0 errors`. `grep -rn "ondblclick\|onTaskDblClick\|handleTaskDblClick" src/lib/components/v2 src/routes/app` → Treffer nur noch in `SubtaskCard.svelte` (Z. 49, wird in Task 6 umgebaut) und `FocusOverlay.svelte` (Z. 131, Task 6).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "Tap öffnet Fokus-Modus, Long-Press exklusiv für Drag, toten Inline-Edit entfernen"
```

---

### Task 6: Subtask-Menüzugang + FocusOverlay-Gesten

**Files:**
- Modify: `src/lib/components/v2/SubtaskCard.svelte`
- Modify: `src/lib/components/v2/TaskCard.svelte` (SubtaskCard-Durchreichung)
- Modify: `src/lib/components/v2/ListPanel.svelte` (Durchreichung)
- Modify: `src/lib/components/v2/FocusOverlay.svelte`
- Modify: `src/lib/components/v2/EmojiPicker.svelte` (z-index)
- Modify: `src/routes/app/+page.svelte` (FocusOverlay-Prop)
- Modify: `src/v2.css` (Subtask-Menü-Button-Styles)

**Interfaces:**
- Consumes: `ctx.handleTaskContext(e, task)` liefert für Tasks mit `parent_id` das Subtask-Menü inkl. „Umbenennen" (Task 3); TaskCard-Prop `oncontextmenu?: (e: MouseEvent, task: Task) => void` (bestehend).
- Produces: SubtaskCard-Prop NEU `oncontextmenu?: (e: MouseEvent, subtask: Task) => void`; FocusOverlay-Prop NEU `onOpenEmojiPicker: (taskId: string, x: number, y: number) => void`.

- [ ] **Step 1: `SubtaskCard.svelte` umbauen** — vollständiger neuer Inhalt:

```svelte
<script lang="ts">
	import { tick } from 'svelte';
	import type { Database } from '$lib/types/database';

	type Task = Database['public']['Tables']['tasks']['Row'];

	let {
		subtask,
		ontoggle,
		onedit,
		oncontextmenu,
		ondragstart,
		ondragend
	}: {
		subtask: Task;
		ontoggle: (id: string) => void;
		onedit: (id: string, text: string) => void;
		oncontextmenu?: (e: MouseEvent, subtask: Task) => void;
		ondragstart?: (e: DragEvent) => void;
		ondragend?: (e: DragEvent) => void;
	} = $props();

	let editing = $state(false);
	let editText = $state('');
	let editInput: HTMLInputElement | undefined = $state();

	function startEdit(e: MouseEvent) {
		e.stopPropagation();
		editText = subtask.text;
		editing = true;
		tick().then(() => editInput?.focus());
	}

	function saveEdit() {
		const trimmed = editText.trim();
		if (trimmed && trimmed !== subtask.text) {
			onedit(subtask.id, trimmed);
		}
		editing = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') { e.preventDefault(); saveEdit(); }
		if (e.key === 'Escape') { editing = false; }
	}

	// Natives Long-Press-Kontextmenü (Android) unterdrücken — Menü nur via ⋮/Rechtsklick
	let lastTouchTs = 0;
	function handleTouchStart() {
		lastTouchTs = Date.now();
	}

	function handleContext(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		if (Date.now() - lastTouchTs < 700) return;
		oncontextmenu?.(e, subtask);
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div
	class="v2-subtask"
	class:done={subtask.done}
	onclick={(e) => e.stopPropagation()}
	oncontextmenu={handleContext}
	ontouchstart={handleTouchStart}
	draggable={!editing ? 'true' : 'false'}
	{ondragstart}
	{ondragend}
>
	<!-- Mini checkbox (13x13, like v6) -->
	<button
		class="v2-mini-check"
		class:checked={subtask.done}
		onclick={() => ontoggle(subtask.id)}
		aria-label="Unteraufgabe abhaken"
	></button>

	<!-- Text / Edit -->
	{#if editing}
		<input
			bind:this={editInput}
			bind:value={editText}
			class="v2-task-input v2-subtask-input"
			onblur={saveEdit}
			onkeydown={handleKeydown}
			maxlength="500"
		/>
	{:else}
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<span class="v2-subtask-text" onclick={startEdit}>{subtask.text}</span>
	{/if}

	{#if oncontextmenu}
		<button
			class="v2-subtask-menu-btn"
			onclick={(e) => { e.stopPropagation(); oncontextmenu?.(e, subtask); }}
			aria-label="Menü"
		>&#x22EE;</button>
	{/if}
</div>
```

- [ ] **Step 2: Durchreichung** —
(a) `TaskCard.svelte`, SubtaskCard-Aufruf: `oncontextmenu={oncontextmenu}` ergänzen (die Signaturen sind kompatibel — `(e, task)`):

```svelte
						<SubtaskCard
							subtask={sub}
							ontoggle={ontogglesubtask ?? (() => {})}
							onedit={oneditsubtask ?? (() => {})}
							oncontextmenu={oncontextmenu}
							ondragstart={(e) => handleSubDragStart(e, sub)}
							ondragend={handleSubDragEnd}
						/>
```

(b) `ListPanel.svelte`: keine Änderung nötig (TaskCard bekommt `oncontextmenu={onContextMenu}` bereits, +page-Handler `handleContextMenu` → `ctx.handleTaskContext` brancht selbst auf `parent_id`).

- [ ] **Step 3: `FocusOverlay.svelte`** —
(a) Neue Prop `onOpenEmojiPicker` deklarieren (nach `onUpdateEmoji`, Z. 17/30):

```typescript
		onOpenEmojiPicker,
```
```typescript
		onOpenEmojiPicker: (taskId: string, x: number, y: number) => void;
```

(b) Emoji-Button (Z. 109-115): `onclick={() => onUpdateEmoji(task.id, '')}` ersetzen durch `onclick={(e) => onOpenEmojiPicker(task.id, e.clientX, e.clientY)}` (Prop `onUpdateEmoji` bleibt für den Picker-Callback in +page erhalten — sie wird in FocusOverlay selbst dann nicht mehr benutzt; aus den Props von FocusOverlay **entfernen** und in +page den Aufruf `onUpdateEmoji={(id, emoji) => store.updateTaskEmoji(id, emoji)}` (Z. 929) **löschen**).
(c) Titel-Edit (Z. 127-135): `ondblclick={startEdit}` ersetzen durch `onclick={startEdit}` und den svelte-ignore-Kommentar um `a11y_click_events_have_key_events` ergänzen.

- [ ] **Step 4: `+page.svelte`** — FocusOverlay-Aufruf (Z. 919-934): Zeile `onUpdateEmoji={…}` ersetzen durch:

```svelte
		onOpenEmojiPicker={(taskId, x, y) => popovers.openEmojiPicker(taskId, x, y)}
```

(Der bestehende `{#if popovers.emojiPicker.show}`-Block rendert den Picker; `popovers.handleEmojiSelect` schreibt via `store.updateTaskEmoji`.)

- [ ] **Step 5: `EmojiPicker.svelte` z-index heben** — das Fokus-Overlay hat `z-index: 1000` (v2.css:1290), der Picker bisher 70/71 und wäre unsichtbar. Im Backdrop-Div `style="z-index: 70;"` → `style="z-index: 10000;"`, im Picker-Div `z-index: 71` → `z-index: 10001`.

- [ ] **Step 6: CSS** — in `src/v2.css` direkt nach der `.v2-task-menu-btn`-Sektion (Z. 1058-1067) ergänzen:

```css
/* 3-dot menu on subtask row */
.v2-subtask-menu-btn {
  margin-left: auto;
  padding: 0 4px;
  font-size: .75rem;
  color: var(--v2-text-muted);
  border-radius: 3px;
  opacity: 0;
  transition: opacity .2s ease;
  line-height: 1;
  background: none;
  border: none;
  cursor: pointer;
  flex-shrink: 0;
}
.v2-subtask-menu-btn:hover { background: var(--v2-hover); color: var(--v2-text); }
.v2-subtask:hover .v2-subtask-menu-btn { opacity: 1; }
@media (max-width: 768px) { .v2-subtask-menu-btn { opacity: 1; } }
```

Prüfen, dass `.v2-subtask` `display: flex` hat (`grep -n "^\.v2-subtask {" src/v2.css` und Regel lesen) — falls nicht, `display: flex; align-items: center;` gehört dort ohnehin hin (Checkbox+Text sitzen nebeneinander, sehr wahrscheinlich vorhanden).

- [ ] **Step 7: Verifizieren**

Run: `npm run check` → `0 errors`.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "Subtask-Menüzugang (⋮ + Rechtsklick) und Fokus-Overlay: Tap-Edit + Emoji-Picker"
```

---

### Task 7: Header einzeilig + Auswählen-Button nur Desktop

**Files:**
- Modify: `src/v2.css:301-308` (.v2-header-actions), `src/v2.css:2140-2160` (Mobile-Overrides)

**Interfaces:**
- Consumes: „Auswählen"-Eintrag im Task-Menü (Task 3) als mobiler Ersatz.
- Produces: nichts für spätere Tasks.

- [ ] **Step 1: `.v2-header-actions` (Z. 301-308)** ersetzen durch:

```css
/* Header Actions */
.v2-header-actions {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 6px;
  margin-left: auto;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.v2-header-actions::-webkit-scrollbar { display: none; }
.v2-header-actions > * { flex-shrink: 0; }
```

- [ ] **Step 2: Mobile-Overrides (Z. 2140-2160)** — im `@media (max-width: 768px)`-Block:

(a) `.v2-header` (Z. 2141-2146): `flex-wrap: nowrap;` ergänzen.
(b) `.v2-header-actions` (Z. 2149-2154): `flex-wrap: wrap;` → `flex-wrap: nowrap;` (Rest bleibt).
(c) Nach `.v2-bulk-mode-btn { font-size: .6rem; padding: 4px 7px; }` (Z. 2160) ergänzen:

```css
  /* Auswählen steckt mobil im Task-Menü — Header-Button nur Desktop */
  .v2-bulk-mode-btn { display: none; }
```

(die beiden `.v2-bulk-mode-btn`-Deklarationen zu einer Regel mit `display: none;` zusammenfassen).
(d) Prüfen: `grep -n "v2-header-search" src/v2.css` — sicherstellen, dass `.v2-header-search` im Mobile-Block `display: none` hat (das Mobile-Such-Icon `.v2-mobile-search-toggle` übernimmt). Falls die Regel fehlt, im Mobile-Block ergänzen: `.v2-header-search { display: none; }` und sicherstellen, dass `.v2-mobile-search-toggle` mobil sichtbar ist (Desktop-Regel versteckt ihn vermutlich — Bestand prüfen, Muster beibehalten).

- [ ] **Step 3: Verifizieren**

Run: `npm run build` → Build OK. (Optische Prüfung folgt in Task 10 bei 360-px-Viewport.)

- [ ] **Step 4: Commit**

```bash
git add src/v2.css && git commit -m "Header-Actions einzeilig scrollbar statt umbrechend, Auswählen-Button nur Desktop"
```

---

### Task 8: Listen-Tabs: Long-Press-Fix, „+"-Button, Neue-Liste-Flow, toter Code

**Files:**
- Modify: `src/routes/app/+page.svelte` (Tab-Handler Z. 626-647, Tab-Markup Z. 691-717, Scroll-View Z. 720-752, addList-Effect Z. 454-459, Empty-State Z. 908-914, toter Code Z. 510-521)
- Modify: `src/routes/app/+layout.svelte:623` (Sidebar-Button)
- Modify: `src/lib/components/v2/ListPanel.svelte` (Prop `onListMenuClick` entfernen)
- Modify: `src/v2.css` (Tab-Touch-CSS + Add-Tab-Style)

**Interfaces:**
- Consumes: ContextMenu-Backdrop-Grace (Task 2) fängt das native contextmenu-Event ~200 ms nach Menü-Öffnung ab; `showInputDialog` aus `$lib/stores/toast`; `store.createList(): Promise<number>` (Index in `store.lists`), `store.renameList(id, title)`.
- Produces: nichts für spätere Tasks.

- [ ] **Step 1: Tab-Long-Press robust machen** — in `+page.svelte` die drei Handler (Z. 626-647) ersetzen durch:

```typescript
	// Long-press on list tabs (mobile touch-and-hold, 300ms)
	let tabLongPressTimer: ReturnType<typeof setTimeout> | null = null;
	let tabLongPressFired = false;
	let tabTouchStartX = 0;
	let tabTouchStartY = 0;

	function handleTabTouchStart(e: TouchEvent, list: List) {
		const touch = e.touches[0];
		tabTouchStartX = touch.clientX;
		tabTouchStartY = touch.clientY;
		tabLongPressFired = false;
		tabLongPressTimer = setTimeout(() => {
			tabLongPressTimer = null;
			tabLongPressFired = true;
			const syntheticEvent = new MouseEvent('contextmenu', {
				clientX: tabTouchStartX,
				clientY: tabTouchStartY,
				bubbles: true
			});
			ctx.handleListContext(syntheticEvent, list);
		}, 300);
	}
	function handleTabTouchMove(e: TouchEvent) {
		if (!tabLongPressTimer) return;
		const touch = e.touches[0];
		// 10px-Toleranz statt Sofort-Abbruch — minimale Fingerbewegung killt den
		// Long-Press nicht mehr
		if (Math.abs(touch.clientX - tabTouchStartX) > 10 || Math.abs(touch.clientY - tabTouchStartY) > 10) {
			clearTimeout(tabLongPressTimer);
			tabLongPressTimer = null;
		}
	}
	function handleTabTouchEnd(e: TouchEvent) {
		if (tabLongPressTimer) { clearTimeout(tabLongPressTimer); tabLongPressTimer = null; }
		// Nach gefeuertem Long-Press: emulierten Ghost-Click unterdrücken, der
		// sonst das frisch geöffnete Menü über dessen Backdrop sofort schließt
		if (tabLongPressFired) e.preventDefault();
	}
	function handleTabTouchCancel() {
		if (tabLongPressTimer) { clearTimeout(tabLongPressTimer); tabLongPressTimer = null; }
	}
```

Im Tab-Markup (Z. 702-705): `ontouchmove={handleTabTouchCancel}` → `ontouchmove={handleTabTouchMove}` (Rest der vier Touch-Attribute bleibt). Zusätzlich im Tab-`oncontextmenu` (Z. 701) Touch-Quellen ignorieren — ersetzen durch:

```svelte
				oncontextmenu={(e) => { e.preventDefault(); if (!tabLongPressFired) ctx.handleListContext(e, list); }}
```

(Desktop-Rechtsklick: `tabLongPressFired` ist false → Menü öffnet. Android-Long-Press: eigener Timer hat bei 300 ms gefeuert und `tabLongPressFired=true` gesetzt → das native contextmenu bei ~500 ms wird geschluckt.)

- [ ] **Step 2: „+"-Button + Neue-Liste-Flow**

(a) In `+page.svelte` Script — Import ergänzen: `import { showInputDialog } from '$lib/stores/toast';` und neuen Handler:

```typescript
	async function handleAddList() {
		const idx = await store.createList();
		if (idx < 0) return;
		const newList = store.lists[idx];
		if (!newList) return;
		const vIdx = visibleLists.findIndex((l: List) => l.id === newList.id);
		if (vIdx >= 0) activeListIndex = vIdx;
		requestAnimationFrame(() => {
			document.querySelector(`[data-tab-list-id="${newList.id}"]`)?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
		});
		const name = await showInputDialog('Liste benennen', '', newList.title, 'Listenname');
		if (name?.trim() && name.trim() !== newList.title) store.renameList(newList.id, name.trim());
	}
```

(b) addList-Signal-Effect (Z. 454-459) ersetzen (Phantom-Listen-Fix: Zähler mit aktuellem Stand initialisieren, nicht mit 0):

```typescript
	let lastAddListSignal = v2Events.addListSignal;
	$effect(() => {
		const val = v2Events.addListSignal;
		if (val > lastAddListSignal) { handleAddList(); }
		lastAddListSignal = val;
	});
```

(c) Tab-Markup: jedem Tab-Button `data-tab-list-id={list.id}` geben und nach dem `{#each}` (vor `</div>` der `.v2-list-tabs`, Z. 715-716) ergänzen:

```svelte
			<button class="v2-list-tab v2-add-list-tab" onclick={handleAddList} aria-label="Neue Liste erstellen">+</button>
```

(d) Scroll-View (nach dem `{#each}` in `.v2-scroll-view`, Z. 751): ergänzen:

```svelte
			<button class="v2-scroll-add-list" onclick={handleAddList} aria-label="Neue Liste erstellen">+ Neue Liste</button>
```

(e) Empty-State-Button (Z. 909): `onclick={() => store.createList()}` → `onclick={handleAddList}`.

(f) `+layout.svelte` Z. 623: Sidebar-Button ersetzen durch:

```svelte
				<button class="v2-nav-add-list" onclick={() => { v2Events.triggerAddList(); if (window.innerWidth < 769) sidebarOpen = false; }} aria-label="Neue Liste">+ Neue Liste</button>
```

- [ ] **Step 3: Toten Code entfernen** —
(a) `+page.svelte`: Funktion `handleListMenuClick` (Z. 510-521) löschen; in beiden ListPanel-Aufrufen die Zeile `onListMenuClick={handleListMenuClick}` löschen.
(b) `ListPanel.svelte`: Prop `onListMenuClick` (Deklaration Z. 22 + Typ Z. 41) löschen.

- [ ] **Step 4: CSS** — in `src/v2.css`:

(a) `.v2-list-tab`-Regel (Z. 2185-2202) ergänzen:

```css
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
```

(b) Nach den Tab-D&D-Regeln (~Z. 2214) ergänzen:

```css
.v2-add-list-tab {
  color: var(--v2-text-muted);
  font-size: .95rem;
  padding: 8px 12px;
}
.v2-add-list-tab:hover { color: var(--v2-accent); }
.v2-scroll-add-list {
  flex-shrink: 0;
  align-self: flex-start;
  margin: 8px;
  padding: 10px 16px;
  border: 1px dashed var(--v2-border);
  border-radius: var(--v2-radius);
  background: transparent;
  color: var(--v2-text-muted);
  font-size: .7rem;
  font-family: var(--v2-font);
  cursor: pointer;
}
.v2-scroll-add-list:hover { color: var(--v2-accent); border-color: var(--v2-accent); }
```

- [ ] **Step 5: Verifizieren**

Run: `npm run check` → `0 errors`. `grep -rn "onListMenuClick\|data-list-menu" src/` → keine Treffer.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Tab-Long-Press-Menü stabilisieren, +-Button für neue Listen, Phantom-Listen-Bug fixen"
```

---

### Task 9: Colorful-Theme: Listen-Akzent von Karten-Kante auf Panel-Oberkante

**Files:**
- Modify: `src/v2.css:145-150`

- [ ] **Step 1: Regeln ersetzen** — Z. 145-150:

```css
/* Colorful per-list accent borders */
.v2-root.v2-theme-colorful [data-col="0"] .v2-task-card { border-left: 3px solid var(--v2-red); }
.v2-root.v2-theme-colorful [data-col="1"] .v2-task-card { border-left: 3px solid var(--v2-accent); }
.v2-root.v2-theme-colorful [data-col="2"] .v2-task-card { border-left: 3px solid var(--v2-green); }
.v2-root.v2-theme-colorful [data-col="3"] .v2-task-card { border-left: 3px solid var(--v2-purple); }
.v2-root.v2-theme-colorful [data-col="4"] .v2-task-card { border-left: 3px solid var(--v2-yellow); }
```

ersetzen durch (Muster identisch zu Aurora Z. 152-157 — die linke Kartenkante gehört exklusiv der Priority-Bar):

```css
/* Colorful per-list top accents (linke Kartenkante bleibt der Prioritätsfarbe vorbehalten) */
.v2-root.v2-theme-colorful [data-col="0"] { border-top: 2px solid var(--v2-red); }
.v2-root.v2-theme-colorful [data-col="1"] { border-top: 2px solid var(--v2-accent); }
.v2-root.v2-theme-colorful [data-col="2"] { border-top: 2px solid var(--v2-green); }
.v2-root.v2-theme-colorful [data-col="3"] { border-top: 2px solid var(--v2-purple); }
.v2-root.v2-theme-colorful [data-col="4"] { border-top: 2px solid var(--v2-yellow); }
```

- [ ] **Step 2: Verifizieren + Commit**

Run: `npm run build` → OK.

```bash
git add src/v2.css && git commit -m "Colorful: Listen-Akzent auf Panel-Oberkante verlegen, Prioritätsleiste freistellen"
```

---

### Task 10: Gesamtverifikation

**Files:** keine neuen Änderungen (nur Fixes für gefundene Probleme).

- [ ] **Step 1: Statische Checks**

Run: `npm run check && npm run lint && npm run build`
Expected: check `0 errors`; lint ohne neue Fehler (Bestandswarnungen OK); Build erfolgreich.

- [ ] **Step 2: Manueller Durchlauf** — `npm run dev`, Chrome mit DevTools-Touch-Emulation (Pixel 7, 412×915) und einmal bei 360 px Breite:

1. Task antippen → Fokus-Modus öffnet; Titel antippen → Inline-Edit; Notizfeld vorhanden; Emoji-Button öffnet Picker ÜBER dem Overlay.
2. ⋮ an einer Task unten am Screenrand → Menü vollständig sichtbar bzw. scrollbar; „Umbenennen" → Dialog → Name ändert sich.
3. Subtask: ⋮ sichtbar → Menü mit „Umbenennen"/„Priorität"/„Löschen"; Subtask-Text antippen → Inline-Edit.
4. Task halten (300 ms, Vibration) + ziehen → Reorder funktioniert; nach dem Drop öffnet sich KEIN Fokus-Modus; Halten + Loslassen ohne Ziehen → ebenfalls kein Fokus-Modus.
5. Listen-Tab gedrückt halten → Menü öffnet und BLEIBT offen; Eintrag antippbar; „Liste umbenennen" funktioniert. Desktop-Rechtsklick auf Tab → Menü öffnet ebenfalls.
6. „+"-Tab → neue Liste erscheint, wird aktiv, Benennen-Dialog öffnet; Sidebar-Button (mobil) schließt die Sidebar.
7. Header bei 360 px: eine Zeile, horizontal scrollbar, kein „Auswählen"-Button; Desktop ≥769 px: „Auswählen"-Button da.
8. ⋮ → „Auswählen" → Bulk-Modus mit vorselektierter Task, BulkToolbar erscheint; Aktionen + Abbrechen OK.
9. Theme Colorful: Panel-Oberkante farbig, Priority-Bar links an der Karte klar erkennbar (Liste mit col 0/rot + Task Priorität low/grün gegentesten).
10. Kein Glow/„Fixieren" mehr irgendwo; Sortierung „Frei" folgt rein der Position.
11. Umlaut-Stichprobe: Task-Menü, Listen-Menü, Sortier-Dropdown, Toast-Undo („Rückgängig"), Sidebar-Filter.
12. Desktop-Regression: Maus-D&D (Tasks, Subtasks, Tabs, Pinnwand), Kanban-Ansicht (Karte anklicken → Fokus), Scroll-Ansicht, Suche (Ctrl+K).

- [ ] **Step 3: Gefundene Probleme fixen** (jeweils kleiner Fix-Commit), dann Schlusscommit falls nötig.

- [ ] **Step 4: Abschluss** — `git log --oneline main..HEAD` zeigt die Task-Commits; User informieren: Migration `020_reset_highlighted.sql` muss noch auf Prod angewendet werden.
