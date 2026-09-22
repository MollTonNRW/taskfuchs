<script lang="ts">
	/**
	 * Fuchskopf-Siegel der Marke.
	 * Pfade und Farben woertlich aus A-klar-spec.md, Abschnitt 8.
	 * Die drei Farben sind bewusst konstant (Abschnitt 1) und folgen
	 * deshalb NICHT dem Hell/Dunkel-Token-Set.
	 */
	let { size = 28, class: extraClass = '' }: { size?: number; class?: string } = $props();
</script>

<svg
	class={extraClass}
	viewBox="0 0 32 32"
	width={size}
	height={size}
	role="img"
	aria-label="TaskFuchs"
	focusable="false"
	style="flex:none;display:block"
>
	<path
		d="M4 4.5l7.5 5.5h9L28 4.5v11.2C28 22.4 22.6 28 16 28S4 22.4 4 15.7z"
		fill="#E4641B"
	/>
	<path
		d="M10.5 21.2c1.7-1.3 3.4-2.1 5.5-2.1s3.8.8 5.5 2.1c-1.7 2-3.4 4-5.5 4s-3.8-2-5.5-4z"
		fill="#FBF8F2"
	/>
	<circle cx="12" cy="15.2" r="1.4" fill="#2B2521" />
	<circle cx="20" cy="15.2" r="1.4" fill="#2B2521" />
	<path d="M14.4 20.4h3.2L16 21.9z" fill="#2B2521" />
</svg>
