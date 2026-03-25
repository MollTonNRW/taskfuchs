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
	let submenuDirection = $state<'right' | 'left'>('right');

	$effect(() => {
		if (menuEl) {
			const rect = menuEl.getBoundingClientRect();
			const vw = window.innerWidth;
			const vh = window.innerHeight;

			// Determine submenu direction based on available space
			submenuDirection = (rect.right + 180 > vw) ? 'left' : 'right';

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
					// Can't fit above either -- clamp to viewport
					menuEl.style.top = `${Math.max(8, vh - rect.height - 8)}px`;
				}
			}
		}
	});

	function toggleSubmenu(label: string) {
		activeSubmenu = activeSubmenu === label ? null : label;
	}
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
				class="v2-ctx-submenu-wrap"
				onmouseenter={() => (activeSubmenu = item.label)}
				onmouseleave={() => (activeSubmenu = null)}
			>
				<button
					class="v2-context-menu-item"
					style="width: 100%;"
					onclick={() => toggleSubmenu(item.label)}
				>
					{#if item.icon}<span class="v2-ctx-icon">{item.icon}</span>{/if}
					<span style="flex: 1; text-align: left;">{item.label}</span>
					<span class="v2-ctx-arrow">&#x25B6;</span>
				</button>
				{#if activeSubmenu === item.label}
					<div
						class="v2-context-menu v2-context-submenu"
						style="{submenuDirection === 'left' ? 'right: 100%; left: auto;' : 'left: 100%;'} top: 0;"
					>
						{#each item.submenu as sub}
							<button
								class="v2-context-menu-item"
								style="width: 100%; {sub.active ? 'font-weight: 700; color: var(--v2-accent);' : ''}"
								onclick={() => { sub.action(); onclose(); }}
							>
								{#if sub.icon}<span class="v2-ctx-icon">{sub.icon}</span>{/if}
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
				{#if item.icon}<span class="v2-ctx-icon">{item.icon}</span>{/if}
				<span>{item.label}</span>
			</button>
		{/if}
	{/each}
</div>
