<script lang="ts" module>
	type Shape =
		| { t: 'path'; d: string }
		| { t: 'circle'; cx: number; cy: number; r: number }
		| { t: 'rect'; x: number; y: number; w: number; h: number; rx: number };

	/**
	 * Icon-Set der Richtung A „Klar".
	 * Alle Pfade stammen woertlich aus A-klar-spec.md, Abschnitt 8
	 * (viewBox 0 0 24 24, Stroke-Set, stroke-width 1.75).
	 * Funktionen tragen ausschliesslich diese Icons — Emoji bleiben den
	 * Listen-Symbolen vorbehalten.
	 */
	const ICONS = {
		suche: [
			{ t: 'circle', cx: 11, cy: 11, r: 7 },
			{ t: 'path', d: 'M20 20l-3.5-3.5' }
		],
		pin: [{ t: 'path', d: 'M12 17v5M8 3h8l-1 6 3 3v2H6v-2l3-3z' }],
		blitz: [{ t: 'path', d: 'M13 2L4 14h7l-1 8 9-12h-7z' }],
		kalender: [
			{ t: 'rect', x: 3, y: 5, w: 18, h: 16, rx: 2 },
			{ t: 'path', d: 'M3 10h18M8 3v4M16 3v4' }
		],
		auswahl: [
			{ t: 'rect', x: 3, y: 3, w: 18, h: 18, rx: 3 },
			{ t: 'path', d: 'M9 11l2 2 4-4' }
		],
		notiz: [
			{ t: 'path', d: 'M4 4h12l4 4v12H4z' },
			{ t: 'path', d: 'M8 12h8M8 16h5' }
		],
		haken: [{ t: 'path', d: 'M5 12l5 5 9-10' }],
		plus: [{ t: 'path', d: 'M12 5v14M5 12h14' }],
		mehr: [
			{ t: 'circle', cx: 12, cy: 5, r: 1 },
			{ t: 'circle', cx: 12, cy: 12, r: 1 },
			{ t: 'circle', cx: 12, cy: 19, r: 1 }
		],
		'chevron-ab': [{ t: 'path', d: 'M6 9l6 6 6-6' }],
		'chevron-auf': [{ t: 'path', d: 'M18 15l-6-6-6 6' }],
		'chevron-rechts': [{ t: 'path', d: 'M9 6l6 6-6 6' }],
		'chevron-links': [{ t: 'path', d: 'M15 6l-6 6 6 6' }],
		'chevron-erledigt': [{ t: 'path', d: 'M9 18l6-6-6-6' }],
		verschieben: [{ t: 'path', d: 'M4 12h16M14 6l6 6-6 6' }],
		loeschen: [{ t: 'path', d: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3' }],
		sortierung: [{ t: 'path', d: 'M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3' }],
		'sortierung-menue': [{ t: 'path', d: 'M4 7h10M4 12h7M4 17h4M17 6v12M14 15l3 3 3-3' }],
		mond: [{ t: 'path', d: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z' }],
		zahnrad: [
			{ t: 'circle', cx: 12, cy: 12, r: 3 },
			{
				t: 'path',
				d: 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'
			}
		],
		umbenennen: [{ t: 'path', d: 'M4 20h4l10-10-4-4L4 16z' }],
		emoji: [
			{ t: 'circle', cx: 12, cy: 12, r: 9 },
			{ t: 'path', d: 'M9 10h.01M15 10h.01M8.5 14.5a5 5 0 0 0 7 0' }
		],
		teilen: [
			{
				t: 'path',
				d: 'M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 21a6 6 0 0 1 12 0M14 21a6 6 0 0 1 8-5.6'
			}
		],
		person: [
			{ t: 'path', d: 'M20 21a8 8 0 1 0-16 0' },
			{ t: 'circle', cx: 12, cy: 8, r: 4 }
		],
		listen: [{ t: 'path', d: 'M4 6h16M4 12h16M4 18h10' }],
		leeren: [
			{ t: 'circle', cx: 12, cy: 12, r: 9 },
			{ t: 'path', d: 'M9 9l6 6M15 9l-6 6' }
		]
	} as const satisfies Record<string, readonly Shape[]>;

	export type IconName = keyof typeof ICONS;
	export const iconNames = Object.keys(ICONS) as IconName[];
</script>

<script lang="ts">
	let {
		name,
		size = 20,
		label = '',
		class: extraClass = ''
	}: {
		name: IconName;
		/** 24 Tab-Bar · 20 Standard · 16 klein · 14 sehr klein (Spezifikation Abschnitt 2) */
		size?: 24 | 20 | 16 | 14;
		/** Gesetzt, wenn das Icon allein die Bedeutung traegt; sonst rein dekorativ. */
		label?: string;
		class?: string;
	} = $props();

	const shapes = $derived(ICONS[name] as readonly Shape[]);
</script>

<svg
	class="tf-ico {extraClass}"
	viewBox="0 0 24 24"
	width={size}
	height={size}
	role={label ? 'img' : 'presentation'}
	aria-label={label || undefined}
	aria-hidden={label ? undefined : 'true'}
	focusable="false"
>
	{#each shapes as s, i (i)}
		{#if s.t === 'path'}
			<path d={s.d} />
		{:else if s.t === 'circle'}
			<circle cx={s.cx} cy={s.cy} r={s.r} />
		{:else}
			<rect x={s.x} y={s.y} width={s.w} height={s.h} rx={s.rx} />
		{/if}
	{/each}
</svg>
