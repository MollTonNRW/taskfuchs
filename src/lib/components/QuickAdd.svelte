<script lang="ts">
	let { onAdd }: { onAdd: (text: string) => void } = $props();
	let text = $state('');

	function handleSubmit() {
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

<form onsubmit={handleSubmit} class="flex gap-2 mt-3">
	<input
		type="text"
		bind:value={text}
		placeholder="Neue Aufgabe..."
		class="input input-sm input-bordered flex-1 bg-base-200/50 focus:bg-base-100"
		onkeydown={handleKeydown}
	/>
	<button type="submit" class="btn btn-sm btn-primary" disabled={!text.trim()} aria-label="Aufgabe hinzufuegen">
		<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
		</svg>
	</button>
</form>
