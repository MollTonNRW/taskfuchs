import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export const themes = [
	{ id: 'light', name: 'Hell', icon: '☀️' },
	{ id: 'dark', name: 'Dunkel', icon: '🌙' },
	{ id: 'cupcake', name: 'Minimal', icon: '🧁' },
	{ id: 'dracula', name: 'Dracula', icon: '🧛' },
	{ id: 'cyberpunk', name: 'Neon', icon: '⚡' },
	{ id: 'nord', name: 'Aurora', icon: '🌌' }
] as const;

export type ThemeId = (typeof themes)[number]['id'];

const stored = browser ? (localStorage.getItem('theme') as ThemeId) : null;

export const theme = writable<ThemeId>(stored ?? 'light');

theme.subscribe((value) => {
	if (browser) {
		localStorage.setItem('theme', value);
		document.documentElement.setAttribute('data-theme', value);
	}
});

export function setTheme(id: ThemeId) {
	theme.set(id);
}

export function toggleTheme() {
	theme.update((t) => (t === 'light' ? 'dark' : 'light'));
}
