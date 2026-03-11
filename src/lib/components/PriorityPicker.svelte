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
		current: string;
		onSelect: (priority: 'low' | 'normal' | 'high' | 'asap') => void;
		onClose: () => void;
	} = $props();

	const priorities: { key: 'low' | 'normal' | 'high' | 'asap'; label: string; color: string }[] = [
		{ key: 'low', label: 'Niedrig', color: '#22c55e' },
		{ key: 'normal', label: 'Normal', color: '#eab308' },
		{ key: 'high', label: 'Hoch', color: '#ef4444' },
		{ key: 'asap', label: 'ASAP!', color: '#dc2626' }
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
	class="fixed z-[71] rounded-xl p-2 min-w-[140px] tf-popover-bg"
	style="left: {x}px; top: {y}px; border: 1px solid var(--tf-border); box-shadow: 0 12px 40px rgba(0,0,0,.15);"
>
	<div class="text-[10px] font-semibold uppercase tracking-wider tf-text-muted px-2 py-1">Priorität</div>
	{#each priorities as p}
		<button
			onclick={() => { onSelect(p.key); onClose(); }}
			class="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/10"
			style={current === p.key ? `background: ${p.color}15;` : ''}
		>
			<div class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background: {p.color};"></div>
			<span class="tf-text">{p.label}</span>
			{#if current === p.key}
				<svg class="w-3.5 h-3.5 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
			{/if}
		</button>
	{/each}
</div>
