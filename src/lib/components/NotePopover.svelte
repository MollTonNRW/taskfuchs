<script lang="ts">
	let {
		note,
		x,
		y,
		onSave,
		onClose
	}: {
		note: string;
		x: number;
		y: number;
		onSave: (text: string) => void;
		onClose: () => void;
	} = $props();

	let text = $state('');
	$effect(() => { text = note; });
	let popoverEl: HTMLDivElement | undefined = $state();

	$effect(() => {
		if (popoverEl) {
			const rect = popoverEl.getBoundingClientRect();
			if (rect.right > window.innerWidth) {
				popoverEl.style.left = `${window.innerWidth - rect.width - 8}px`;
			}
			if (rect.bottom > window.innerHeight) {
				popoverEl.style.top = `${window.innerHeight - rect.height - 8}px`;
			}
		}
	});

	function handleSave() {
		onSave(text);
		onClose();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

<!-- Backdrop -->
<div
	class="fixed inset-0 z-[70]"
	onclick={handleSave}
	role="presentation"
></div>

<!-- Popover -->
<div
	bind:this={popoverEl}
	class="note-popover fixed z-[71] tf-popover-bg"
	style="left: {x}px; top: {y}px; border: 1px solid var(--tf-border);"
	onkeydown={handleKeydown}
	role="dialog"
	aria-label="Notiz bearbeiten"
	tabindex="-1"
>
	<div class="flex items-center justify-between mb-2">
		<span class="text-xs font-semibold uppercase tracking-wider tf-text-muted">Notiz</span>
		<button
			onclick={handleSave}
			class="w-5 h-5 flex items-center justify-center rounded hover:bg-black/5 dark:hover:bg-white/10 tf-text-muted"
			aria-label="Notiz speichern und schliessen"
		>
			<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
			</svg>
		</button>
	</div>
	<!-- svelte-ignore a11y_autofocus -->
	<textarea
		bind:value={text}
		class="w-full text-sm tf-text bg-transparent resize-none outline-none min-h-[60px]"
		placeholder="Notiz eingeben..."
		autofocus
	></textarea>
</div>
