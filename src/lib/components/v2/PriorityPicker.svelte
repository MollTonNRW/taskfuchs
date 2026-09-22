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
		{ key: 'low', label: 'Niedrig', color: 'var(--low)' },
		{ key: 'normal', label: 'Normal', color: 'var(--normal)' },
		{ key: 'high', label: 'Hoch', color: 'var(--high)' },
		{ key: 'asap', label: 'ASAP!', color: 'var(--high)' }
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
	style="position: fixed; z-index: 71; left: {x}px; top: {y}px; padding: 8px; min-width: 140px;"
>
	<div style="font-size: .55rem; text-transform: uppercase; letter-spacing: 2px; color: var(--ink-3); padding: 4px 8px; margin-bottom: 4px;">Priorität</div>
	{#each priorities as p}
		<button
			onclick={() => { onSelect(p.key); onClose(); }}
			style="width: 100%; display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: var(--v2-radius); font-size: .65rem; color: var(--ink-2); background: {current === p.key ? 'var(--accent-glow)' : 'transparent'}; border: none; cursor: pointer; transition: all .15s ease;"
			onmouseenter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
			onmouseleave={(e) => { (e.currentTarget as HTMLElement).style.background = current === p.key ? 'var(--accent-glow)' : 'transparent'; }}
		>
			<span style="width: 8px; height: 8px; border-radius: 50%; background: {p.color}; flex-shrink: 0;"></span>
			<span>{p.label}</span>
			{#if current === p.key}
				<span style="margin-left: auto; font-size: .6rem; color: var(--accent);">\u2713</span>
			{/if}
		</button>
	{/each}
</div>
