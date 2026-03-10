import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';

// Theme presets (visual style)
export const themePresets = [
	{ id: 'minimal', name: 'Minimal', icon: '✨' },
	{ id: 'colorful', name: 'Colorful', icon: '🎨' },
	{ id: 'neon', name: 'Neon', icon: '⚡' },
	{ id: 'aurora', name: 'Aurora', icon: '🌌' }
] as const;

export type ThemePreset = (typeof themePresets)[number]['id'];

// Dark mode state
const storedDark = browser ? localStorage.getItem('tf-dark') === 'true' : false;
export const isDark = writable<boolean>(storedDark);

// Theme preset state
const storedPreset = browser ? (localStorage.getItem('tf-preset') as ThemePreset) : null;
export const themePreset = writable<ThemePreset>(storedPreset ?? 'minimal');

// Neon and Aurora force dark mode
export const effectiveDark = derived([isDark, themePreset], ([$isDark, $preset]) => {
	if ($preset === 'neon' || $preset === 'aurora') return true;
	return $isDark;
});

// CSS class string for <body>
export const themeClass = derived([themePreset, effectiveDark], ([$preset, $dark]) => {
	const classes = [`theme-${$preset}`];
	if ($dark) classes.push('dark');
	return classes.join(' ');
});

// Persist to localStorage
isDark.subscribe((value) => {
	if (browser) {
		localStorage.setItem('tf-dark', String(value));
	}
});

themePreset.subscribe((value) => {
	if (browser) {
		localStorage.setItem('tf-preset', value);
		// Set DaisyUI data-theme for base utility classes
		document.documentElement.setAttribute('data-theme',
			value === 'neon' || value === 'aurora' ? 'dark' :
			localStorage.getItem('tf-dark') === 'true' ? 'dark' : 'light'
		);
	}
});

effectiveDark.subscribe((value) => {
	if (browser) {
		document.documentElement.setAttribute('data-theme', value ? 'dark' : 'light');
	}
});

export function setPreset(id: ThemePreset) {
	themePreset.set(id);
}

export function toggleDark() {
	isDark.update((d) => !d);
}

// Legacy exports for compatibility
export const theme = effectiveDark;
export const themes = themePresets;
export function setTheme(id: string) {
	if (id === 'dark') { isDark.set(true); }
	else if (id === 'light') { isDark.set(false); }
	else { setPreset(id as ThemePreset); }
}
