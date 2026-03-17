<script lang="ts">
	import { confirmStore, resolveConfirm } from '$lib/stores/toast';

	function handleKeydown(e: KeyboardEvent) {
		if (!$confirmStore.show) return;
		if (e.key === 'Escape') resolveConfirm(false);
		if (e.key === 'Enter') resolveConfirm(true);
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if $confirmStore.show}
	<div class="fixed inset-0 z-[9999] flex items-center justify-center">
		<!-- Backdrop -->
		<div
			class="fixed inset-0 bg-black/40 backdrop-blur-sm"
			onclick={() => resolveConfirm(false)}
			role="presentation"
		></div>
		<!-- Dialog -->
		<div class="relative w-full max-w-sm mx-4 rounded-2xl shadow-2xl p-6 tf-surface border scale-in" style="border-color: var(--tf-border);">
			<p class="text-sm tf-text mb-5">{$confirmStore.message}</p>
			<div class="flex justify-end gap-2">
				<button
					onclick={() => resolveConfirm(false)}
					class="px-4 py-2 text-sm font-medium rounded-xl tf-text-muted hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
				>
					Abbrechen
				</button>
				<button
					onclick={() => resolveConfirm(true)}
					class="px-4 py-2 text-sm font-medium rounded-xl text-white transition-colors"
					style="background: var(--tf-accent);"
				>
					Bestätigen
				</button>
			</div>
		</div>
	</div>
{/if}
