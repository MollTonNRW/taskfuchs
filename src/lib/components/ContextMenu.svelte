<script lang="ts">
	type MenuItem = {
		label: string;
		icon?: string;
		action: () => void;
		danger?: boolean;
		divider?: boolean;
	};

	let {
		items,
		x,
		y,
		onClose
	}: {
		items: MenuItem[];
		x: number;
		y: number;
		onClose: () => void;
	} = $props();

	// Adjust position to stay in viewport
	let menuEl: HTMLDivElement | undefined = $state();

	$effect(() => {
		if (menuEl) {
			const rect = menuEl.getBoundingClientRect();
			if (rect.right > window.innerWidth) {
				menuEl.style.left = `${window.innerWidth - rect.width - 8}px`;
			}
			if (rect.bottom > window.innerHeight) {
				menuEl.style.top = `${window.innerHeight - rect.height - 8}px`;
			}
		}
	});
</script>

<!-- Backdrop -->
<div
	class="fixed inset-0 z-[60]"
	onclick={onClose}
	oncontextmenu={(e) => { e.preventDefault(); onClose(); }}
	role="presentation"
></div>

<!-- Menu -->
<div
	bind:this={menuEl}
	class="fixed z-[61] w-52 bg-base-100 rounded-xl shadow-xl border border-base-300 p-1.5 animate-in"
	style="left: {x}px; top: {y}px;"
>
	{#each items as item}
		{#if item.divider}
			<div class="divider my-1 h-px"></div>
		{/if}
		<button
			onclick={() => { item.action(); onClose(); }}
			class="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-lg transition-colors {item.danger ? 'hover:bg-error/10 text-error' : 'hover:bg-base-200'}"
		>
			{#if item.icon}
				<span class="text-base w-5 text-center">{item.icon}</span>
			{/if}
			{item.label}
		</button>
	{/each}
</div>
