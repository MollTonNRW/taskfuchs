import { browser } from '$app/environment';

/**
 * Theme-Store der Richtung A „Klar" — genau zwei Zustaende: hell und dunkel.
 *
 * HELL ist der Default. Ohne gespeicherte Wahl startet die App hell,
 * deshalb die strikte Pruefung auf den String 'true'.
 * Die vier Presets (minimal/colorful/neon/aurora), `effectiveDark` und
 * `themeClass` sind mit dem Redesign entfallen.
 */
const KEY = 'tf-dark';

function createTheme() {
	let isDark = $state<boolean>(browser ? localStorage.getItem(KEY) === 'true' : false);

	function persist() {
		if (!browser) return;
		try {
			localStorage.setItem(KEY, String(isDark));
		} catch {
			/* privater Modus — Auswahl gilt nur fuer diese Sitzung */
		}
	}

	return {
		get isDark() {
			return isDark;
		},
		toggle() {
			if (!browser) return;
			isDark = !isDark;
			persist();
		},
		set(value: boolean) {
			if (!browser) return;
			isDark = value;
			persist();
		}
	};
}

export const theme = createTheme();
