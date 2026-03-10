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

	// Parse existing value: could be "2026-03-15" or "2026-03-15T14:00"
	let dateValue = $state(current?.slice(0, 10) || '');
	let timeValue = $state(current?.includes('T') ? current.slice(11, 16) : '');
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

	function handleSubmit() {
		if (!dateValue) { onSelect(null); onClose(); return; }
		const result = timeValue ? `${dateValue}T${timeValue}` : dateValue;
		onSelect(result);
		onClose();
	}
</script>

<!-- Backdrop -->
<div class="fixed inset-0 z-[70]" onclick={onClose} role="presentation"></div>

<!-- Picker -->
<div
	bind:this={pickerEl}
	class="fixed z-[71] rounded-xl p-3 min-w-[220px]"
	style="left: {x}px; top: {y}px; background: var(--tf-surface); border: 1px solid var(--tf-border); box-shadow: 0 12px 40px rgba(0,0,0,.15);"
>
	<div class="text-[10px] font-semibold uppercase tracking-wider tf-text-muted mb-2">Fällig am</div>
	<input
		type="date"
		bind:value={dateValue}
		class="tf-input w-full px-3 py-1.5 text-sm rounded-lg border"
		onchange={handleSubmit}
	/>
	<div class="text-[10px] font-semibold uppercase tracking-wider tf-text-muted mt-2 mb-1">Uhrzeit (optional)</div>
	<input
		type="time"
		bind:value={timeValue}
		class="tf-input w-full px-3 py-1.5 text-sm rounded-lg border"
		onchange={handleSubmit}
	/>
	{#if current}
		<button
			onclick={() => { onSelect(null); onClose(); }}
			class="w-full flex items-center justify-center gap-1.5 mt-2 px-2.5 py-1.5 rounded-lg text-xs font-medium tf-text-muted transition-colors hover:bg-black/5 dark:hover:bg-white/10"
		>
			<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
			Entfernen
		</button>
	{/if}
</div>
