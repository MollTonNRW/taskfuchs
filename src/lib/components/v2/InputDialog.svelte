<script lang="ts">
	import { inputDialogStore, resolveInput } from '$lib/stores/toast';
	import { tick } from 'svelte';

	let inputEl: HTMLInputElement | undefined = $state();

	$effect(() => {
		if ($inputDialogStore.show) {
			tick().then(() => {
				inputEl?.focus();
				inputEl?.select();
			});
		}
	});

	function confirm() {
		if (!inputEl) return;
		const val = inputEl.value.trim();
		resolveInput(val || null);
	}

	function cancel() {
		resolveInput(null);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!$inputDialogStore.show) return;
		e.stopPropagation();
		if (e.key === 'Escape') cancel();
		if (e.key === 'Enter') confirm();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if $inputDialogStore.show}
	<div class="v2-focus-overlay" style="z-index: 9999;">
		<!-- Backdrop -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			style="position: absolute; inset: 0; z-index: -1;"
			onclick={cancel}
		></div>

		<!-- Dialog -->
		<div class="v2-glass-card" style="padding: 24px; max-width: 400px; width: 90%;">
			{#if $inputDialogStore.title}
				<p style="font-size: .72rem; color: var(--v2-accent); margin-bottom: 8px; font-family: var(--v2-font); letter-spacing: 0.05em; text-transform: uppercase;">
					{$inputDialogStore.title}
				</p>
			{/if}
			{#if $inputDialogStore.message}
				<p style="font-size: .72rem; color: var(--v2-text-muted); margin-bottom: 14px; line-height: 1.5;">
					{$inputDialogStore.message}
				</p>
			{/if}
			<input
				bind:this={inputEl}
				type="text"
				value={$inputDialogStore.defaultValue}
				placeholder={$inputDialogStore.placeholder}
				style="width: 100%; padding: 8px 12px; font-size: .75rem; color: var(--v2-text); background: var(--v2-bg); border: 1px dashed var(--v2-border); border-radius: var(--v2-radius); font-family: var(--v2-font); outline: none; margin-bottom: 16px; box-sizing: border-box;"
				onfocus={(e) => { const t = e.currentTarget; t.style.borderColor = 'var(--v2-accent)'; }}
				onblur={(e) => { const t = e.currentTarget; t.style.borderColor = 'var(--v2-border)'; }}
			/>
			<div style="display: flex; justify-content: flex-end; gap: 8px;">
				<button
					onclick={cancel}
					style="padding: 6px 16px; font-size: .65rem; color: var(--v2-text-muted); background: none; border: 1px dashed var(--v2-border); border-radius: var(--v2-radius); cursor: pointer; font-family: var(--v2-font);"
				>
					Abbrechen
				</button>
				<button
					onclick={confirm}
					style="padding: 6px 16px; font-size: .65rem; color: var(--v2-accent); background: var(--v2-accent-glow); border: 1px dashed var(--v2-accent); border-radius: var(--v2-radius); cursor: pointer; font-family: var(--v2-font);"
				>
					OK
				</button>
			</div>
		</div>
	</div>
{/if}
