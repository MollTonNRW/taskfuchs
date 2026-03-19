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
			if (rect.right > window.innerWidth) popoverEl.style.left = `${window.innerWidth - rect.width - 8}px`;
			if (rect.bottom > window.innerHeight) popoverEl.style.top = `${window.innerHeight - rect.height - 8}px`;
		}
	});

	function handleSave() {
		onSave(text);
		onClose();
	}
</script>

<!-- Backdrop -->
<div class="fixed inset-0" style="z-index: 70;" onclick={handleSave} role="presentation"></div>

<!-- Popover -->
<div
	bind:this={popoverEl}
	class="v2-glass-card"
	style="position: fixed; z-index: 71; left: {x}px; top: {y}px; padding: 12px; min-width: 220px; max-width: 300px;"
	role="dialog"
	aria-label="Notiz bearbeiten"
>
	<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
		<span style="font-size: .55rem; text-transform: uppercase; letter-spacing: 2px; color: var(--v2-text-muted);">Notiz</span>
		<button
			onclick={handleSave}
			style="background: none; border: none; color: var(--v2-text-muted); font-size: .6rem; cursor: pointer;"
			aria-label="Speichern und schliessen"
		>
			&#x2715;
		</button>
	</div>
	<!-- svelte-ignore a11y_autofocus -->
	<textarea
		bind:value={text}
		class="v2-task-input"
		style="width: 100%; min-height: 60px; resize: vertical; font-size: .72rem;"
		placeholder="Notiz eingeben..."
		autofocus
		onkeydown={(e) => { if (e.key === 'Escape') handleSave(); }}
	></textarea>
</div>
