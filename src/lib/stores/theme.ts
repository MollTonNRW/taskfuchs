import { writable } from 'svelte/store';
import { browser } from '$app/environment';

type Theme = 'light' | 'dark';

const stored = browser ? (localStorage.getItem('theme') as Theme) : null;

export const theme = writable<Theme>(stored ?? 'light');

theme.subscribe((value) => {
	if (browser) {
		localStorage.setItem('theme', value);
		document.documentElement.setAttribute('data-theme', value);
	}
});

export function toggleTheme() {
	theme.update((t) => (t === 'light' ? 'dark' : 'light'));
}
