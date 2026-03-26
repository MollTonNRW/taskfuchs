/**
 * Touch Drag & Drop system for TaskFuchs
 * Provides touch support alongside the existing HTML5 Drag API.
 *
 * Usage:
 *   <div use:touchDragHandle={{ data, type, onStart?, onEnd? }}>drag handle</div>
 *   <div use:touchDropZone={{ type, onDragOver?, onDragLeave?, onDrop }}>drop target</div>
 */
import { writable, get } from 'svelte/store';

// ── Global drag state ──────────────────────────────────────────────
export interface DragState {
	active: boolean;
	type: string;
	data: unknown;
	ghost: HTMLElement | null;
	sourceEl: HTMLElement | null;
	currentDropZone: HTMLElement | null;
}

const initialState: DragState = {
	active: false,
	type: '',
	data: null,
	ghost: null,
	sourceEl: null,
	currentDropZone: null
};

export const dragState = writable<DragState>({ ...initialState });

const DRAG_THRESHOLD = 8; // px before drag activates
const SCROLL_EDGE = 80; // px from edge to auto-scroll
const SCROLL_SPEED = 12; // px per frame

let startX = 0;
let startY = 0;
let dragStarted = false;
let scrollRAF: number | null = null;

// ── Auto-scroll while dragging near edges ──────────────────────────
function autoScroll(clientY: number) {
	if (scrollRAF) cancelAnimationFrame(scrollRAF);

	const scrollContainer = findScrollContainer(clientY);
	if (!scrollContainer) return;

	const rect = scrollContainer.getBoundingClientRect();
	const topDist = clientY - rect.top;
	const bottomDist = rect.bottom - clientY;

	if (topDist < SCROLL_EDGE) {
		scrollContainer.scrollTop -= SCROLL_SPEED * (1 - topDist / SCROLL_EDGE);
	} else if (bottomDist < SCROLL_EDGE) {
		scrollContainer.scrollTop += SCROLL_SPEED * (1 - bottomDist / SCROLL_EDGE);
	}

	scrollRAF = requestAnimationFrame(() => {
		const state = get(dragState);
		if (state.active) autoScroll(clientY);
	});
}

let lastTouchX = 0; // Track touch X for scroll container lookup

function findScrollContainer(_clientY: number): HTMLElement | null {
	// Finde den sichtbaren Scroll-Container (nicht den versteckten Desktop/Mobile-Container)
	const candidates = document.querySelectorAll('.task-list-scroll, .v2-content');
	for (const el of candidates) {
		const htmlEl = el as HTMLElement;
		if (htmlEl.offsetParent !== null || htmlEl.getClientRects().length > 0) {
			return htmlEl;
		}
	}
	// Fallback: main-content
	return document.querySelector('.main-content') as HTMLElement ?? null;
}

// ── Ghost element ──────────────────────────────────────────────────
function createGhost(sourceEl: HTMLElement): HTMLElement {
	const taskEl = sourceEl.closest('.task-item, .subtask-item, .list-panel, .v2-task-drop-wrapper, .v2-task-card');
	const cloneSource = taskEl || sourceEl;
	const rect = cloneSource.getBoundingClientRect();

	const ghost = document.createElement('div');
	ghost.className = 'touch-drag-ghost';
	ghost.style.cssText = `
		position: fixed;
		width: ${rect.width}px;
		height: ${Math.min(rect.height, 80)}px;
		pointer-events: none;
		z-index: 9999;
		opacity: 0.85;
		transform: scale(0.95);
		border-radius: 12px;
		overflow: hidden;
		box-shadow: 0 8px 32px rgba(0,0,0,.25);
		background: var(--tf-surface, #fff);
		border: 2px solid var(--tf-accent, #f97316);
	`;

	// Simple text preview inside ghost
	const label = document.createElement('div');
	label.style.cssText = 'padding: 8px 12px; font-size: 13px; color: var(--tf-text, #333); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
	const textEl = cloneSource.querySelector('.task-text, .v2-task-text, span.text-xs, h2');
	label.textContent = textEl?.textContent?.trim() || 'Verschieben...';
	ghost.appendChild(label);

	document.body.appendChild(ghost);
	return ghost;
}

function moveGhost(ghost: HTMLElement, x: number, y: number) {
	ghost.style.left = `${x - ghost.offsetWidth / 2}px`;
	ghost.style.top = `${y - ghost.offsetHeight - 10}px`;
}

// ── Drop zone registry ─────────────────────────────────────────────
interface DropZoneEntry {
	el: HTMLElement;
	type: string;
	onDragOver?: (el: HTMLElement, x: number, y: number) => void;
	onDragLeave?: (el: HTMLElement) => void;
	onDrop: (data: unknown, el: HTMLElement, x: number, y: number) => void;
}

const dropZones: DropZoneEntry[] = [];

function findDropZone(x: number, y: number, type: string): DropZoneEntry | null {
	const els = document.elementsFromPoint(x, y);
	for (const el of els) {
		if (!(el instanceof HTMLElement)) continue;
		const zone = dropZones.find((z) => z.type === type && z.el.contains(el));
		if (zone) return zone;
	}
	return null;
}

// ── Svelte Actions ─────────────────────────────────────────────────

/**
 * Makes an element a touch drag handle.
 */
export function touchDragHandle(
	node: HTMLElement,
	params: {
		data: unknown;
		type: string;
		onStart?: () => void;
		onEnd?: () => void;
	}
) {
	let currentParams = params;
	let holdTimer: ReturnType<typeof setTimeout> | null = null;

	// Non-passive touchmove — wird NUR nach erfolgreichem Hold registriert
	function onDragMove(e: TouchEvent) {
		if (e.touches.length !== 1) return;
		const touch = e.touches[0];

		if (!dragStarted) {
			const dx = touch.clientX - startX;
			const dy = touch.clientY - startY;
			if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
			dragStarted = true;

			const ghost = createGhost(node);
			node.closest('.task-item, .subtask-item, .list-panel, .v2-task-drop-wrapper, .v2-task-card')?.classList.add('touch-dragging-source');
			dragState.set({
				active: true,
				type: currentParams.type,
				data: currentParams.data,
				ghost,
				sourceEl: node,
				currentDropZone: null
			});
			currentParams.onStart?.();
		}

		e.preventDefault(); // Nur hier, nur wenn Drag aktiv

		const state = get(dragState);
		if (!state.active || !state.ghost) return;

		lastTouchX = touch.clientX;
		moveGhost(state.ghost, touch.clientX, touch.clientY);
		autoScroll(touch.clientY);

		const zone = findDropZone(touch.clientX, touch.clientY, state.type);
		if (zone !== (state.currentDropZone ? dropZones.find((z) => z.el === state.currentDropZone) : null)) {
			if (state.currentDropZone) {
				const oldZone = dropZones.find((z) => z.el === state.currentDropZone);
				oldZone?.onDragLeave?.(state.currentDropZone);
			}
			if (zone) {
				zone.onDragOver?.(zone.el, touch.clientX, touch.clientY);
				dragState.update((s) => ({ ...s, currentDropZone: zone.el }));
			} else {
				dragState.update((s) => ({ ...s, currentDropZone: null }));
			}
		} else if (zone) {
			zone.onDragOver?.(zone.el, touch.clientX, touch.clientY);
		}
	}

	function cleanup() {
		if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
		node.removeEventListener('touchmove', onScrollDetect);
		node.removeEventListener('touchmove', onDragMove);
	}

	// Passiver Move-Listener: bricht Hold ab wenn Finger sich bewegt (= User scrollt)
	function onScrollDetect(e: TouchEvent) {
		if (e.touches.length !== 1) return;
		const touch = e.touches[0];
		const dx = Math.abs(touch.clientX - startX);
		const dy = Math.abs(touch.clientY - startY);
		if (dx > 5 || dy > 5) {
			// Finger hat sich bewegt → User scrollt, Hold abbrechen
			cleanup();
		}
	}

	function onTouchStart(e: TouchEvent) {
		if (e.touches.length !== 1) return;
		if (!currentParams.data) return;
		const touch = e.touches[0];
		startX = touch.clientX;
		startY = touch.clientY;
		dragStarted = false;

		// Passiven Move-Listener registrieren um Scroll-Bewegung zu erkennen
		node.addEventListener('touchmove', onScrollDetect, { passive: true });

		// Nach 300ms Hold OHNE Bewegung: Drag aktivieren
		holdTimer = setTimeout(() => {
			holdTimer = null;
			// Scroll-Detector entfernen, Drag-Listener registrieren
			node.removeEventListener('touchmove', onScrollDetect);
			node.addEventListener('touchmove', onDragMove, { passive: false });
			if (navigator.vibrate) navigator.vibrate(30);
		}, 300);
	}

	function onTouchEnd(e: TouchEvent) {
		cleanup();
		if (!dragStarted) return;

		const state = get(dragState);
		if (!state.active) return;

		const lastTouch = e.changedTouches[0];
		const zone = findDropZone(lastTouch.clientX, lastTouch.clientY, state.type);
		if (zone) {
			zone.onDrop(state.data, zone.el, lastTouch.clientX, lastTouch.clientY);
		}

		if (state.ghost) state.ghost.remove();
		state.sourceEl?.closest('.task-item, .subtask-item, .list-panel, .v2-task-drop-wrapper, .v2-task-card')?.classList.remove('touch-dragging-source');
		if (state.currentDropZone) {
			const oldZone = dropZones.find((z) => z.el === state.currentDropZone);
			oldZone?.onDragLeave?.(state.currentDropZone);
		}
		if (scrollRAF) { cancelAnimationFrame(scrollRAF); scrollRAF = null; }

		dragState.set({ ...initialState });
		currentParams.onEnd?.();
		dragStarted = false;
	}

	node.addEventListener('touchstart', onTouchStart, { passive: true });
	// KEIN touchmove hier — wird erst nach Hold dynamisch registriert
	node.addEventListener('touchend', onTouchEnd, { passive: true });
	node.addEventListener('touchcancel', onTouchEnd, { passive: true });

	return {
		update(newParams: typeof params) {
			currentParams = newParams;
		},
		destroy() {
			cleanup();
			node.removeEventListener('touchstart', onTouchStart);
			node.removeEventListener('touchend', onTouchEnd);
			node.removeEventListener('touchcancel', onTouchEnd);
		}
	};
}

/**
 * Makes an element a touch drop zone.
 */
export function touchDropZone(
	node: HTMLElement,
	params: {
		type: string;
		onDragOver?: (el: HTMLElement, x: number, y: number) => void;
		onDragLeave?: (el: HTMLElement) => void;
		onDrop: (data: unknown, el: HTMLElement, x: number, y: number) => void;
	}
) {
	const entry: DropZoneEntry = {
		el: node,
		type: params.type,
		onDragOver: params.onDragOver,
		onDragLeave: params.onDragLeave,
		onDrop: params.onDrop
	};
	dropZones.push(entry);

	return {
		update(newParams: typeof params) {
			entry.type = newParams.type;
			entry.onDragOver = newParams.onDragOver;
			entry.onDragLeave = newParams.onDragLeave;
			entry.onDrop = newParams.onDrop;
		},
		destroy() {
			const idx = dropZones.indexOf(entry);
			if (idx >= 0) dropZones.splice(idx, 1);
		}
	};
}
