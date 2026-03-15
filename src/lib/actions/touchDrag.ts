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
const SCROLL_EDGE = 60; // px from edge to auto-scroll
const SCROLL_SPEED = 8; // px per frame

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

function findScrollContainer(clientY: number): HTMLElement | null {
	// Find the nearest scrollable task list
	const els = document.elementsFromPoint(window.innerWidth / 2, clientY);
	for (const el of els) {
		if (el instanceof HTMLElement && el.classList.contains('task-list-scroll')) {
			return el;
		}
	}
	return null;
}

// ── Ghost element ──────────────────────────────────────────────────
function createGhost(sourceEl: HTMLElement): HTMLElement {
	const taskEl = sourceEl.closest('.task-item, .subtask-item, .list-panel');
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
	const textEl = cloneSource.querySelector('.task-text, span.text-xs, h2');
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

	function onTouchStart(e: TouchEvent) {
		if (e.touches.length !== 1) return;
		const touch = e.touches[0];
		startX = touch.clientX;
		startY = touch.clientY;
		dragStarted = false;
	}

	function onTouchMove(e: TouchEvent) {
		if (e.touches.length !== 1) return;
		const touch = e.touches[0];
		const dx = touch.clientX - startX;
		const dy = touch.clientY - startY;

		if (!dragStarted) {
			if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
			dragStarted = true;

			// Start drag
			const ghost = createGhost(node);
			node.closest('.task-item, .subtask-item, .list-panel')?.classList.add('touch-dragging-source');

			dragState.set({
				active: true,
				type: currentParams.type,
				data: currentParams.data,
				ghost,
				sourceEl: node,
				currentDropZone: null
			});
			currentParams.onStart?.();

			// Vibrate for haptic feedback
			if (navigator.vibrate) navigator.vibrate(30);
		}

		e.preventDefault(); // Prevent scrolling while dragging

		const state = get(dragState);
		if (!state.active || !state.ghost) return;

		moveGhost(state.ghost, touch.clientX, touch.clientY);
		autoScroll(touch.clientY);

		// Check drop zones
		const zone = findDropZone(touch.clientX, touch.clientY, state.type);
		if (zone !== (state.currentDropZone ? dropZones.find((z) => z.el === state.currentDropZone) : null)) {
			// Leave old zone
			if (state.currentDropZone) {
				const oldZone = dropZones.find((z) => z.el === state.currentDropZone);
				oldZone?.onDragLeave?.(state.currentDropZone);
			}
			// Enter new zone
			if (zone) {
				zone.onDragOver?.(zone.el, touch.clientX, touch.clientY);
				dragState.update((s) => ({ ...s, currentDropZone: zone.el }));
			} else {
				dragState.update((s) => ({ ...s, currentDropZone: null }));
			}
		} else if (zone) {
			// Still in same zone, update position
			zone.onDragOver?.(zone.el, touch.clientX, touch.clientY);
		}
	}

	function onTouchEnd(e: TouchEvent) {
		if (!dragStarted) return;

		const state = get(dragState);
		if (!state.active) return;

		// Find final drop zone
		const lastTouch = e.changedTouches[0];
		const zone = findDropZone(lastTouch.clientX, lastTouch.clientY, state.type);
		if (zone) {
			zone.onDrop(state.data, zone.el, lastTouch.clientX, lastTouch.clientY);
		}

		// Cleanup
		if (state.ghost) state.ghost.remove();
		state.sourceEl?.closest('.task-item, .subtask-item, .list-panel')?.classList.remove('touch-dragging-source');
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
	node.addEventListener('touchmove', onTouchMove, { passive: false });
	node.addEventListener('touchend', onTouchEnd, { passive: true });
	node.addEventListener('touchcancel', onTouchEnd, { passive: true });

	return {
		update(newParams: typeof params) {
			currentParams = newParams;
		},
		destroy() {
			node.removeEventListener('touchstart', onTouchStart);
			node.removeEventListener('touchmove', onTouchMove);
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
