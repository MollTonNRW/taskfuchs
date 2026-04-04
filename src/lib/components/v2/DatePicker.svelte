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
		onSelect: (date: string | null) => void;
		onClose: () => void;
	} = $props();

	let dateValue = $state(current?.slice(0, 10) || '');
	let timeValue = $state(current?.includes('T') ? current.slice(11, 16) : '');
	let pickerEl: HTMLDivElement | undefined = $state();

	$effect(() => {
		if (pickerEl) {
			const rect = pickerEl.getBoundingClientRect();
			if (rect.right > window.innerWidth) pickerEl.style.left = `${window.innerWidth - rect.width - 8}px`;
			if (rect.bottom > window.innerHeight) pickerEl.style.top = `${window.innerHeight - rect.height - 8}px`;
		}
	});

	function handleSubmit() {
		if (!dateValue) { onSelect(null); onClose(); return; }
		const result = timeValue ? `${dateValue}T${timeValue}` : dateValue;
		onSelect(result);
		onClose();
	}
</script>

<!-- Backdrop -->
<div class="fixed inset-0" style="z-index: 70;" onclick={onClose} role="presentation"></div>

<!-- Picker -->
<div
	bind:this={pickerEl}
	class="v2-glass-card"
	style="position: fixed; z-index: 71; left: {x}px; top: {y}px; padding: 12px; min-width: 220px;"
>
	<div style="font-size: .55rem; text-transform: uppercase; letter-spacing: 2px; color: var(--v2-text-muted); margin-bottom: 6px;">Faellig am</div>
	<input
		type="date"
		bind:value={dateValue}
		class="v2-task-input"
		style="width: 100%; padding: 6px 10px; font-size: .72rem;"
		onchange={handleSubmit}
	/>

	<div style="font-size: .55rem; text-transform: uppercase; letter-spacing: 2px; color: var(--v2-text-muted); margin-top: 10px; margin-bottom: 6px;">Uhrzeit (optional)</div>
	<input
		type="time"
		bind:value={timeValue}
		class="v2-task-input"
		style="width: 100%; padding: 6px 10px; font-size: .72rem;"
		onchange={handleSubmit}
	/>

	{#if current}
		<button
			onclick={() => { onSelect(null); onClose(); }}
			style="width: 100%; margin-top: 10px; font-size: .6rem; color: var(--v2-text-muted); background: none; border: 1px dashed var(--v2-border); border-radius: var(--v2-radius); padding: 6px; cursor: pointer; text-align: center;"
		>
			Entfernen
		</button>
	{/if}
</div>
