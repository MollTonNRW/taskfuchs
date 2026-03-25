<script lang="ts">
	export type MenuItem = {
		label: string;
		icon?: string;
		action?: () => void;
		danger?: boolean;
		divider?: boolean;
		submenu?: { label: string; icon?: string; action: () => void; active?: boolean }[];
	};

	let {
		items,
		x,
		y,
		onclose
	}: {
		items: MenuItem[];
		x: number;
		y: number;
		onclose: () => void;
	} = $props();

	let menuEl: HTMLDivElement | undefined = $state();
	let activeSubmenu = $state<string | null>(null);

	$effect(() => {
		if (menuEl) {
			const rect = menuEl.getBoundingClientRect();
			const vw = window.innerWidth;
			const vh = window.innerHeight;

			// Horizontal: keep within viewport
			if (rect.right > vw) {
				menuEl.style.left = `${Math.max(8, vw - rect.width - 8)}px`;
			}

			// Vertical: if menu overflows bottom, flip upward from click point
			if (rect.bottom > vh) {
				const flippedTop = y - rect.height;
				if (flippedTop >= 8) {
					menuEl.style.top = `${flippedTop}px`;
				} else {
					// Can't fit above either — clamp to viewport
					menuEl.style.top = `${Math.max(8, vh - rect.height - 8)}px`;
				}
			}
		}
	});
</script>

<!-- Backdrop -->
<div
	class="fixed inset-0"
	style="z-index: 9998;"
	onclick={onclose}
	oncontextmenu={(e) => { e.preventDefault(); onclose(); }}
	role="presentation"
></div>

<!-- Menu -->
<div
	bind:this={menuEl}
	class="v2-context-menu"
	style="left: {x}px; top: {y}px;"
>
	{#each items as item}
		{#if item.divider}
			<div class="v2-context-menu-divider"></div>
		{:else if item.submenu}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="relative"
				onmouseenter={() => (activeSubmenu = item.label)}
				onmouseleave={() => (activeSubmenu = null)}
			>
				<button class="v2-context-menu-item" style="width: 100%;">
					{#if item.icon}<span style="font-size: .75rem; width: 20px; text-align: center; flex-shrink: 0;">{item.icon}</span>{/if}
					<span style="flex: 1; text-align: left;">{item.label}</span>
					<span style="font-size: .5rem; color: var(--v2-text-muted);">&#x25B6;</span>
				</button>
				{#if activeSubmenu === item.label}
					<div class="v2-context-menu" style="position: absolute; left: 100%; top: 0;">
						{#each item.submenu as sub}
							<button
								class="v2-context-menu-item"
								style="width: 100%; {sub.active ? 'font-weight: 700; color: var(--v2-accent);' : ''}"
								onclick={() => { sub.action(); onclose(); }}
							>
								{#if sub.icon}<span style="font-size: .75rem; width: 20px; text-align: center; flex-shrink: 0;">{sub.icon}</span>{/if}
								<span>{sub.label}</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{:else}
			<button
				class="v2-context-menu-item {item.danger ? 'danger' : ''}"
				style="width: 100%;"
				onclick={() => { item.action?.(); onclose(); }}
			>
				{#if item.icon}<span style="font-size: .75rem; width: 20px; text-align: center; flex-shrink: 0;">{item.icon}</span>{/if}
				<span>{item.label}</span>
			</button>
		{/if}
	{/each}
</div>
