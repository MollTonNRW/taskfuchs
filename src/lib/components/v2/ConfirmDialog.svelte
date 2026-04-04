<script lang="ts">
	import { confirmStore, resolveConfirm } from '$lib/stores/toast';

	function handleKeydown(e: KeyboardEvent) {
		if (!$confirmStore.show) return;
		if (e.key === 'Escape') {
			e.stopPropagation();
			resolveConfirm(false);
		}
		if (e.key === 'Enter') {
			e.stopPropagation();
			resolveConfirm(true);
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if $confirmStore.show}
	<div class="v2-focus-overlay" style="z-index: 9999;">
		<!-- Backdrop -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			style="position: absolute; inset: 0; z-index: -1;"
			onclick={() => resolveConfirm(false)}
		></div>

		<!-- Dialog -->
		<div class="v2-glass-card" style="padding: 24px; max-width: 360px; width: 90%;">
			<p style="font-size: .78rem; color: var(--v2-text); margin-bottom: 20px; line-height: 1.5;">
				{$confirmStore.message}
			</p>
			<div style="display: flex; justify-content: flex-end; gap: 8px;">
				<button
					onclick={() => resolveConfirm(false)}
					style="padding: 6px 16px; font-size: .65rem; color: var(--v2-text-muted); background: none; border: 1px dashed var(--v2-border); border-radius: var(--v2-radius); cursor: pointer; font-family: var(--v2-font);"
				>
					Abbrechen
				</button>
				<button
					onclick={() => resolveConfirm(true)}
					style="padding: 6px 16px; font-size: .65rem; color: var(--v2-accent); background: var(--v2-accent-glow); border: 1px dashed var(--v2-accent); border-radius: var(--v2-radius); cursor: pointer; font-family: var(--v2-font);"
				>
					Bestaetigen
				</button>
			</div>
		</div>
	</div>
{/if}
