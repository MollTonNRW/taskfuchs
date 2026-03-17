<script lang="ts">
	import { fly } from 'svelte/transition';
	import { toasts } from '$lib/stores/toast';

	const typeStyles: Record<string, string> = {
		error: 'bg-red-500 text-white',
		success: 'bg-green-500 text-white',
		info: 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900'
	};

	const typeIcons: Record<string, string> = {
		error: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
		success: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
		info: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
	};
</script>

{#if $toasts.length > 0}
	<div class="fixed bottom-20 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 items-center pointer-events-none" role="status" aria-live="polite">
		{#each $toasts as toast (toast.id)}
			<div
				class="pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium max-w-sm {typeStyles[toast.type]}"
				role={toast.type === 'error' ? 'alert' : 'status'}
				transition:fly={{ y: 20, duration: 200 }}
			>
				<svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={typeIcons[toast.type]} />
				</svg>
				<span>{toast.message}</span>
				<button
					onclick={() => toasts.dismiss(toast.id)}
					class="ml-1 opacity-60 hover:opacity-100 transition-opacity flex-shrink-0"
					aria-label="Schließen"
				>
					<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>
		{/each}
	</div>
{/if}
