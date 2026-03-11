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

	const emojis = ['📋','🎯','🔒','🦊','💡','🚀','⚡','🔥','📌','🏠','💼','🖥️','📝','✨','🎨','🛠️','📊','🗂️','🔔','❤️','⭐','🎉','📦','🌟','🦷','📅','🎪','💎','🧩','📱','🌍','🔧'];

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
	class="emoji-picker fixed z-[71] tf-popover-bg"
	style="left: {x}px; top: {y}px; border: 1px solid var(--tf-border);"
>
	{#each emojis as emoji}
		<button
			onclick={() => { onSelect(emoji); onClose(); }}
			class="w-8 h-8 flex items-center justify-center rounded-lg text-base hover:scale-115 transition-transform"
			style="background: none; border: none;"
		>
			{emoji}
		</button>
	{/each}
	<button
		onclick={() => { onSelect(''); onClose(); }}
		class="w-full flex items-center justify-center gap-1 py-1 rounded-lg text-[10px] tf-text-muted hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
		style="background: none; border: none; grid-column: 1 / -1;"
		title="Symbol entfernen"
	>
		<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
	</button>
</div>
