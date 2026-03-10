<script lang="ts">
	let {
		x,
		y,
		current,
		onSelect,
		onClose
	}: {
		x: number;
		y: number;
		current: string | null;
		onSelect: (timeframe: 'akut' | 'zeitnah' | 'mittelfristig' | 'langfristig' | null) => void;
		onClose: () => void;
	} = $props();

	const timeframes: { key: 'akut' | 'zeitnah' | 'mittelfristig' | 'langfristig'; label: string; color: string }[] = [
		{ key: 'akut', label: 'Akut', color: '#dc2626' },
		{ key: 'zeitnah', label: 'Zeitnah', color: '#ea580c' },
		{ key: 'mittelfristig', label: 'Mittelfristig', color: '#d97706' },
		{ key: 'langfristig', label: 'Langfristig', color: '#16a34a' }
	];

	let pickerEl: HTMLDivElement | undefined = $state();

	$effect(() => {
		if (pickerEl) {
			const rect = pickerEl.getBoundingClientRect();
			if (rect.right > window.innerWidth) {
				pickerEl.style.left = `${window.innerWidth - rect.width - 8}px`;
			}
			if (rect.bottom > window.innerHeight) {
				pickerEl.style.top = `${window.innerHeight - rect.height - 8}px`;
			}
		}
	});
</script>

<!-- Backdrop -->
<div class="fixed inset-0 z-[70]" onclick={onClose} role="presentation"></div>

<!-- Picker -->
<div
	bind:this={pickerEl}
	class="fixed z-[71] rounded-xl p-2 min-w-[160px]"
	style="left: {x}px; top: {y}px; background: var(--tf-surface); border: 1px solid var(--tf-border); box-shadow: 0 12px 40px rgba(0,0,0,.15);"
>
	<div class="text-[10px] font-semibold uppercase tracking-wider tf-text-muted px-2 py-1">Zeitrahmen</div>
	{#each timeframes as tf}
		<button
			onclick={() => { onSelect(current === tf.key ? null : tf.key); onClose(); }}
			class="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/10"
			style={current === tf.key ? `background: ${tf.color}15;` : ''}
		>
			<div class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background: {tf.color};"></div>
			<span class="tf-text">{tf.label}</span>
			{#if current === tf.key}
				<svg class="w-3.5 h-3.5 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
			{/if}
		</button>
	{/each}
	{#if current}
		<div class="border-t mt-1 pt-1" style="border-color: var(--tf-border);">
			<button
				onclick={() => { onSelect(null); onClose(); }}
				class="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium tf-text-muted transition-colors hover:bg-black/5 dark:hover:bg-white/10"
			>
				<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
				Entfernen
			</button>
		</div>
	{/if}
</div>
