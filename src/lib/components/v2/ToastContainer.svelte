<script lang="ts">
	import { toasts } from '$lib/stores/toast';
</script>

{#if $toasts.length > 0}
	<div style="position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%); z-index: 9999; display: flex; flex-direction: column; gap: 8px; align-items: center; pointer-events: none;" role="status" aria-live="polite">
		{#each $toasts as toast (toast.id)}
			<div
				class="v2-toast"
				style="pointer-events: auto; {toast.type === 'error' ? 'border-color: var(--v2-red);' : toast.type === 'success' ? 'border-color: var(--v2-green);' : toast.type === 'undo' ? 'border-color: var(--v2-orange);' : ''}"
				role={toast.type === 'error' ? 'alert' : 'status'}
			>
				<span>{toast.message}</span>
				{#if toast.type === 'undo' && toast.onUndo}
					<button
						onclick={() => { toast.onUndo?.(); toasts.dismiss(toast.id); }}
						style="margin-left: 8px; padding: 2px 10px; border: 1px dashed var(--v2-accent); border-radius: var(--v2-radius); background: var(--v2-accent-glow); color: var(--v2-accent); font-size: .6rem; cursor: pointer; font-family: var(--v2-font); flex-shrink: 0;"
					>
						Rueckgaengig
					</button>
				{:else}
					<button
						onclick={() => toasts.dismiss(toast.id)}
						style="margin-left: 8px; background: none; border: none; color: var(--v2-text-muted); cursor: pointer; font-size: .6rem; flex-shrink: 0;"
						aria-label="Schliessen"
					>
						&#x2715;
					</button>
				{/if}
			</div>
		{/each}
	</div>
{/if}
