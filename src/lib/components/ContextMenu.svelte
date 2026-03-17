<script lang="ts">
	/** Structured icon: SVG path + color or plain emoji string */
	export type IconDef = { svg: string; color?: string; filled?: boolean } | string;

	type SubmenuItem = {
		label: string;
		icon?: IconDef;
		color?: string;
		active?: boolean;
		action: () => void;
	};

	export type MenuItem = {
		label: string;
		icon?: IconDef;
		action?: () => void;
		danger?: boolean;
		divider?: boolean;
		submenu?: SubmenuItem[];
	};

	let {
		items,
		x,
		y,
		onClose
	}: {
		items: MenuItem[];
		x: number;
		y: number;
		onClose: () => void;
	} = $props();

	let menuEl: HTMLDivElement | undefined = $state();
	let activeSubmenu = $state<string | null>(null);

	$effect(() => {
		if (menuEl) {
			const rect = menuEl.getBoundingClientRect();
			const maxH = window.innerHeight - 16;
			// Horizontal: nicht über den rechten Rand
			if (rect.right > window.innerWidth) {
				menuEl.style.left = `${window.innerWidth - rect.width - 8}px`;
			}
			// Vertikal: max-height begrenzen und scrollen wenn nötig
			if (rect.height > maxH) {
				menuEl.style.maxHeight = `${maxH}px`;
				menuEl.style.overflowY = 'auto';
				menuEl.style.top = '8px';
			} else if (rect.bottom > window.innerHeight) {
				menuEl.style.top = `${window.innerHeight - rect.height - 8}px`;
			}
		}
	});
</script>

{#snippet renderIcon(icon: IconDef)}
	{#if typeof icon === 'string'}
		<span class="text-base w-5 text-center flex-shrink-0">{icon}</span>
	{:else}
		<span class="w-5 text-center flex-shrink-0 inline-flex items-center justify-center">
			<svg class="w-4 h-4 {icon.color ?? ''}" fill={icon.filled ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={icon.svg} />
			</svg>
		</span>
	{/if}
{/snippet}

<!-- Backdrop (closes menu on click/touch anywhere outside) -->
<div
	class="fixed inset-0 z-[9998]"
	onclick={onClose}
	ontouchend={onClose}
	oncontextmenu={(e) => { e.preventDefault(); onClose(); }}
	role="presentation"
></div>

<!-- Menu -->
<div
	bind:this={menuEl}
	class="context-menu fixed z-[9999]"
	style="left: {x}px; top: {y}px;"
>
	{#each items as item, i}
		{#if item.divider}
			<div class="context-menu-divider" style="background: var(--tf-border);"></div>
		{/if}
		{#if item.submenu}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="relative"
				onmouseenter={() => (activeSubmenu = item.label)}
				onmouseleave={() => (activeSubmenu = null)}
			>
				<button
					class="context-menu-item w-full"
					class:text-red-500={item.danger}
				>
					{#if item.icon}
						{@render renderIcon(item.icon)}
					{/if}
					<span class="flex-1 text-left tf-text">{item.label}</span>
					<svg class="w-3 h-3 tf-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
					</svg>
				</button>
				{#if activeSubmenu === item.label}
					<div
						class="context-submenu absolute left-full top-0 z-[9999]"
					>
						{#each item.submenu as sub}
							<button
								onclick={() => { sub.action(); onClose(); }}
								class="context-menu-item w-full {sub.active ? 'font-bold' : ''}"
							>
								{#if sub.icon}
									{@render renderIcon(sub.icon)}
								{:else if sub.color}
									<span class="w-2 h-2 rounded-full flex-shrink-0" style="background: {sub.color};"></span>
								{/if}
								<span class="tf-text">{sub.label}</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{:else}
			<button
				onclick={() => { item.action?.(); onClose(); }}
				class="context-menu-item w-full {item.danger ? 'text-red-500 hover:!bg-red-50 dark:hover:!bg-red-900/20' : ''}"
			>
				{#if item.icon}
					{@render renderIcon(item.icon)}
				{/if}
				<span class={item.danger ? '' : 'tf-text'}>{item.label}</span>
			</button>
		{/if}
	{/each}
</div>
