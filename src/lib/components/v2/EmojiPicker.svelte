<script lang="ts">
	let {
		x,
		y,
		onSelect,
		onClose
	}: {
		x: number;
		y: number;
		onSelect: (emoji: string) => void;
		onClose: () => void;
	} = $props();

	const emojis = [
		'\u{1F4CB}', '\u{1F3AF}', '\u{1F512}', '\u{1F98A}', '\u{1F4A1}', '\u{1F680}', '\u26A1', '\u{1F525}',
		'\u{1F4CC}', '\u{1F3E0}', '\u{1F4BC}', '\u{1F5A5}\uFE0F', '\u{1F4DD}', '\u2728', '\u{1F3A8}', '\u{1F6E0}\uFE0F',
		'\u{1F4CA}', '\u{1F5C2}\uFE0F', '\u{1F514}', '\u2764\uFE0F', '\u2B50', '\u{1F389}', '\u{1F4E6}', '\u{1F31F}',
		'\u{1F9B7}', '\u{1F4C5}', '\u{1F3AA}', '\u{1F48E}', '\u{1F9E9}', '\u{1F4F1}', '\u{1F30D}', '\u{1F527}'
	];

	let pickerEl: HTMLDivElement | undefined = $state();

	$effect(() => {
		if (pickerEl) {
			const rect = pickerEl.getBoundingClientRect();
			if (rect.right > window.innerWidth) pickerEl.style.left = `${window.innerWidth - rect.width - 8}px`;
			if (rect.bottom > window.innerHeight) pickerEl.style.top = `${window.innerHeight - rect.height - 8}px`;
		}
	});
</script>

<!-- Backdrop -->
<div class="fixed inset-0" style="z-index: 70;" onclick={onClose} role="presentation"></div>

<!-- Picker -->
<div
	bind:this={pickerEl}
	class="v2-glass-card"
	style="position: fixed; z-index: 71; left: {x}px; top: {y}px; padding: 10px; display: grid; grid-template-columns: repeat(8, 1fr); gap: 2px;"
>
	{#each emojis as emoji}
		<button
			onclick={() => { onSelect(emoji); onClose(); }}
			style="width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 6px; font-size: 1rem; background: none; border: none; cursor: pointer; transition: transform .15s ease;"
			onmouseenter={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.15)'; }}
			onmouseleave={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
		>
			{emoji}
		</button>
	{/each}
	<button
		onclick={() => { onSelect(''); onClose(); }}
		style="grid-column: 1 / -1; font-size: .5rem; color: var(--v2-text-muted); background: none; border: 1px dashed var(--v2-border); border-radius: var(--v2-radius); padding: 4px; cursor: pointer; margin-top: 4px;"
	>
		Entfernen
	</button>
</div>
