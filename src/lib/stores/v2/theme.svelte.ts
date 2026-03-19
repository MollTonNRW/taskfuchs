import { browser } from '$app/environment';

// v2 Theme Presets — Terminal/Hacker Aesthetic
export const v2ThemePresets = [
	{ id: 'minimal', name: 'Minimal', icon: '>' },
	{ id: 'colorful', name: 'Colorful', icon: '#' },
	{ id: 'neon', name: 'Neon', icon: '~' },
	{ id: 'aurora', name: 'Aurora', icon: '*' }
] as const;

export type V2ThemePreset = (typeof v2ThemePresets)[number]['id'];

// Gamification display mode
export type GamificationMode = 'full' | 'minimal' | 'off';

function createV2Theme() {
	const storedPreset = browser ? (localStorage.getItem('v2-preset') as V2ThemePreset | null) : null;
	const storedDark = browser ? localStorage.getItem('v2-dark') !== 'false' : true; // default dark
	const storedGamification = browser
		? (localStorage.getItem('v2-gamification') as GamificationMode | null)
		: null;

	let preset = $state<V2ThemePreset>(storedPreset ?? 'minimal');
	let isDark = $state<boolean>(storedDark);
	let gamificationMode = $state<GamificationMode>(storedGamification ?? 'full');

	// Neon + Aurora force dark
	let effectiveDark = $derived(preset === 'neon' || preset === 'aurora' ? true : isDark);

	// CSS class for the v2 root element
	let themeClass = $derived(
		`v2-theme-${preset} ${effectiveDark ? 'v2-dark' : 'v2-light'}`
	);

	// Apply to DOM
	$effect(() => {
		if (!browser) return;
		localStorage.setItem('v2-preset', preset);
		localStorage.setItem('v2-dark', String(isDark));
		localStorage.setItem('v2-gamification', gamificationMode);
	});

	return {
		get preset() { return preset; },
		get isDark() { return isDark; },
		get effectiveDark() { return effectiveDark; },
		get themeClass() { return themeClass; },
		get gamificationMode() { return gamificationMode; },

		setPreset(id: V2ThemePreset) { preset = id; },
		toggleDark() { isDark = !isDark; },
		setGamificationMode(mode: GamificationMode) { gamificationMode = mode; }
	};
}

export const v2Theme = createV2Theme();
