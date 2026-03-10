<script lang="ts">
	let { onAdd }: { onAdd: (text: string) => void } = $props();
	let text = $state('');

	function handleSubmit(e?: Event) {
		e?.preventDefault();
		const trimmed = text.trim();
		if (!trimmed) return;
		onAdd(trimmed);
		text = '';
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			handleSubmit();
		}
	}
</script>

<form onsubmit={handleSubmit} class="flex gap-2">
	<input
		type="text"
		bind:value={text}
		placeholder="Neue Aufgabe..."
		class="quick-add-input tf-input flex-1 px-4 py-2.5 text-sm rounded-xl border focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-orange-400 transition-all duration-300"
		onkeydown={handleKeydown}
		maxlength={500}
	/>
	<button
		type="submit"
		class="quick-add-btn px-4 py-2.5 text-white text-sm font-medium rounded-xl hover:shadow-lg hover:shadow-orange-500/25 active:scale-95 transition-all duration-300"
		style="background: var(--tf-accent-gradient);"
		disabled={!text.trim()}
		aria-label="Aufgabe hinzufügen"
	>
		<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg>
	</button>
</form>
