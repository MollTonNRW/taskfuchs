<script lang="ts">
	export type MenuItem = {
		label: string;
		icon?: string;
		action?: () => void;
		danger?: boolean;
		divider?: boolean;
		submenu?: { label: string; icon?: string; action: () => void; active?: boolean; blink?: boolean }[];
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
	let submenuEl: HTMLDivElement | undefined = $state();
	let activeSubmenu = $state<string | null>(null);
	let submenuAnchor = $state<DOMRect | null>(null);

	// Grace-Periode: Ghost-Clicks und native contextmenu-Events direkt nach dem
	// Öffnen (Long-Press-Finger liegt noch auf / hebt gerade ab) dürfen das Menü
	// nicht sofort wieder schließen.
	let openedAt = Date.now();
	$effect(() => {
		void items; void x; void y;
		openedAt = Date.now();
		activeSubmenu = null;
	});
	function guardedClose() {
		if (Date.now() - openedAt < 350) return;
		onclose();
	}

	// Hauptmenü in den Viewport klemmen. x/y werden UNBEDINGT vor dem if gelesen,
	// damit der Effect bei jeder Positionsänderung erneut läuft (Svelte-5-Tracking).
	$effect(() => {
		const px = x;
		const py = y;
		if (!menuEl) return;
		menuEl.style.left = `${px}px`;
		menuEl.style.top = `${py}px`;
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		// offsetWidth/Height statt getBoundingClientRect: unbeeinflusst von der
		// scale()-Einblendeanimation
		const mw = menuEl.offsetWidth;
		const mh = menuEl.offsetHeight;
		if (px + mw > vw - 8) menuEl.style.left = `${Math.max(8, vw - mw - 8)}px`;
		if (py + mh > vh - 8) {
			const flippedTop = py - mh;
			menuEl.style.top = `${flippedTop >= 8 ? flippedTop : Math.max(8, vh - mh - 8)}px`;
		}
	});

	function openSubmenu(label: string, anchorEl: HTMLElement) {
		submenuAnchor = anchorEl.getBoundingClientRect();
		activeSubmenu = label;
	}

	function toggleSubmenu(label: string, anchorEl: HTMLElement) {
		if (activeSubmenu === label) {
			activeSubmenu = null;
		} else {
			openSubmenu(label, anchorEl);
		}
	}

	// Submenü (position:fixed) horizontal + vertikal in den Viewport klemmen
	$effect(() => {
		const anchor = submenuAnchor;
		if (!submenuEl || !anchor) return;
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const sw = submenuEl.offsetWidth;
		const sh = submenuEl.offsetHeight;
		let left = anchor.right;
		if (left + sw > vw - 8) left = Math.max(8, anchor.left - sw);
		let top = anchor.top - 1;
		if (top + sh > vh - 8) top = Math.max(8, vh - sh - 8);
		submenuEl.style.left = `${left}px`;
		submenuEl.style.top = `${top}px`;
	});
</script>

<!-- Backdrop -->
<div
	class="fixed inset-0"
	style="z-index: 9998;"
	onclick={guardedClose}
	oncontextmenu={(e) => { e.preventDefault(); guardedClose(); }}
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
				onmouseenter={(e) => openSubmenu(item.label, e.currentTarget as HTMLElement)}
				onmouseleave={() => (activeSubmenu = null)}
			>
				<button
					class="v2-context-menu-item"
					style="width: 100%;"
					onclick={(e) => toggleSubmenu(item.label, e.currentTarget as HTMLElement)}
				>
					{#if item.icon}<span class="v2-ctx-icon">{item.icon}</span>{/if}
					<span style="flex: 1; text-align: left;">{item.label}</span>
					<span class="v2-ctx-arrow">&#x25B6;</span>
				</button>
				{#if activeSubmenu === item.label}
					<div bind:this={submenuEl} class="v2-context-submenu">
						{#each item.submenu as sub}
							<button
								class="v2-context-menu-item {sub.active ? 'v2-ctx-submenu-active' : ''} {sub.blink ? 'v2-ctx-asap-blink' : ''}"
								style="width: 100%;"
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
