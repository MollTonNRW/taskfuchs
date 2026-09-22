<script lang="ts">
	import { toasts } from '$lib/stores/toast';
</script>

{#if $toasts.length > 0}
	<div style="position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%); z-index: 9999; display: flex; flex-direction: column; gap: 8px; align-items: center; pointer-events: none;" role="status" aria-live="polite">
		{#each $toasts as toast (toast.id)}
			<div
				class="v2-toast"
				style="pointer-events: auto; {toast.type === 'error' ? 'border-color: var(--high);' : toast.type === 'success' ? 'border-color: var(--low);' : toast.type === 'undo' ? 'border-color: var(--accent);' : ''}"
				role={toast.type === 'error' ? 'alert' : 'status'}
			>
				<span>{toast.message}</span>
				{#if toast.type === 'undo' && toast.onUndo}
					<button
						onclick={() => { toast.onUndo?.(); toasts.dismiss(toast.id); }}
						style="margin-left: 8px; padding: 2px 10px; border: 1px solid var(--accent); border-radius: var(--v2-radius); background: var(--accent-glow); color: var(--accent); font-size: .6rem; cursor: pointer; font-family: var(--font-ui); flex-shrink: 0;"
					>
						Rückgängig
					</button>
				{:else}
					<button
						onclick={() => toasts.dismiss(toast.id)}
						style="margin-left: 8px; background: none; border: none; color: var(--ink-3); cursor: pointer; font-size: .6rem; flex-shrink: 0;"
						aria-label="Schließen"
					>
						&#x2715;
					</button>
				{/if}
			</div>
		{/each}
	</div>
{/if}
