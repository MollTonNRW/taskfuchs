<script lang="ts">
	import '../../v2.css';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { v2Theme } from '$lib/stores/v2/theme.svelte';
	import { v2Events } from '$lib/stores/v2/events.svelte';

	let { data, children } = $props();
	let sidebarOpen = $state(browser && window.innerWidth >= 769);

	// Apply DaisyUI data-theme + sync the browser/TWA status-bar color to the active theme
	$effect(() => {
		if (!browser) return;
		const dark = v2Theme.effectiveDark;
		document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');

		const root = document.querySelector('.v2-root');
		const bg = root ? getComputedStyle(root).getPropertyValue('--v2-bg').trim() : '';
		const color = bg || (dark ? '#1a1b26' : '#faf8f5');
		let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
		if (!meta) {
			meta = document.createElement('meta');
			meta.name = 'theme-color';
			document.head.appendChild(meta);
		}
		meta.content = color;
	});

	async function logout() {
		await data.supabase.auth.signOut();
		goto('/auth/login');
	}

	function closeSidebar() {
		sidebarOpen = false;
	}

	// Keyboard shortcut for search
	function handleKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
			e.preventDefault();
			v2Events.toggleSearch();
		}
	}
</script>

<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="v2-root {v2Theme.themeClass}">

	<!-- Sidebar Overlay (mobile) -->
	{#if sidebarOpen}
		<div
			class="v2-sidebar-overlay active"
			onclick={closeSidebar}
			role="presentation"
		></div>
	{/if}

	<!-- Sidebar -->
	<aside class="v2-sidebar" class:open={sidebarOpen} class:collapsed={!sidebarOpen}>
		<!-- Sidebar Header (v6 style) -->
		<div class="v2-sidebar-topbar">
			<span class="v2-sidebar-title">TaskFuchs</span>
			<button class="v2-sidebar-close" onclick={closeSidebar} aria-label="Sidebar schließen">&times;</button>
		</div>

		<!-- Footer -->
		<div class="v2-sidebar-section v2-sidebar-footer">
			<!-- Dark/Light Toggle -->
			<button
				class="v2-dark-toggle"
				onclick={() => v2Theme.toggleDark()}
				aria-label={v2Theme.effectiveDark ? 'Zu Light Mode wechseln' : 'Zu Dark Mode wechseln'}
			>
				{v2Theme.effectiveDark ? '\u263E' : '\u2600'}
				{v2Theme.effectiveDark ? 'Light Mode' : 'Dark Mode'}
			</button>

			<!-- G2 Brille koppeln -->
			<a
				href="/app/g2-koppeln"
				class="v2-dark-toggle"
				style="margin-top: 8px; text-decoration: none; display: block; text-align: left;"
				onclick={() => { if (window.innerWidth < 769) sidebarOpen = false; }}
			>
				&#x1F453; G2 koppeln
			</a>

			<!-- Logout -->
			<button
				class="v2-dark-toggle"
				onclick={logout}
				style="margin-top: 8px; color: var(--v2-red, #ef4444);"
			>
				&#x23FB; Abmelden
			</button>
		</div>
	</aside>

	<div class="v2-app">
		<!-- Main area -->
		<div class="v2-main" class:sidebar-collapsed={!sidebarOpen}>
			<!-- Header -->
			<header class="v2-header">
				<button
					onclick={() => (sidebarOpen = !sidebarOpen)}
					style="background: none; border: none; color: var(--v2-text-secondary); font-size: 1.1rem; padding: 4px; cursor: pointer; min-width: 44px; min-height: 44px; display: flex; align-items: center; justify-content: center;"
					aria-label="Sidebar umschalten"
				>
					&#9776;
				</button>

				<!-- ASCII-Art Logo (v6 style) -->
				<div class="v2-header-logo">
					<pre style="font-size: .55rem; color: var(--v2-text-muted); white-space: pre; line-height: 1.05;">&#x2554;&#x2550;&#x2550;&#x2550;&#x2550;&#x2550;&#x2550;&#x2550;&#x2550;&#x2550;&#x2550;&#x2550;&#x2550;&#x2550;&#x2557;
&#x2551; <span style="color: var(--v2-orange);">TaskFuchs</span> &#x2551;
&#x255A;&#x2550;&#x2550;&#x2550;&#x2550;&#x2550;&#x2550;&#x2550;&#x2550;&#x2550;&#x2550;&#x2550;&#x2550;&#x2550;&#x255D;</pre>
				</div>

				<div class="v2-header-actions">
					<!-- Sort Button -->
					<button class="v2-sort-btn" onclick={() => v2Events.toggleSort()}>
						&#x21C5; <span>{v2Events.sortLabel}</span>
					</button>

					<!-- Bulk Mode -->
					<button
						class="v2-bulk-mode-btn"
						class:active={v2Events.bulkModeActive}
						onclick={() => v2Events.toggleBulk()}
					>
						{v2Events.bulkModeActive ? '\u2611 Ausw\u00e4hlen' : '\u2610 Ausw\u00e4hlen'}
					</button>

					<!-- Inline Search (Desktop: immer sichtbar, Mobile: nur Icon) -->
					<div class="v2-header-search">
						<span class="v2-search-icon">&#x26B2;</span>
						<input
							type="text"
							placeholder="Ctrl+K"
							readonly
							onclick={() => v2Events.toggleSearch()}
							aria-label="Suchen"
						/>
						<span class="v2-cursor-blink">&#x2588;</span>
					</div>
					<button
						class="v2-mobile-search-toggle"
						onclick={() => v2Events.toggleSearch()}
						aria-label="Suche öffnen"
					>
						&#x26B2;
					</button>

					<!-- Dark/Light Toggle -->
					<button
						onclick={() => v2Theme.toggleDark()}
						style="background: none; border: none; color: var(--v2-text-secondary); font-size: .9rem; cursor: pointer; padding: 4px 8px; min-width: 44px; min-height: 44px; display: flex; align-items: center; justify-content: center;"
						aria-label="Dark/Light Mode umschalten"
					>
						{v2Theme.effectiveDark ? '\u2600' : '\u263E'}
					</button>
				</div>
			</header>

			<!-- Page content -->
			<div class="v2-content">
				<svelte:boundary onerror={(e) => console.error('V2_BOUNDARY_ERROR:', e)}>
					{@render children()}
					{#snippet failed(error)}
						<div style="padding: 40px; font-family: monospace; color: var(--v2-red, red);">
							<h2>v2 Error</h2>
							<pre style="white-space: pre-wrap; font-size: 12px; max-width: 100%; overflow-x: auto;">{(error as any)?.message ?? error}</pre>
							<pre style="white-space: pre-wrap; font-size: 10px; color: var(--v2-text-muted, #888); margin-top: 8px;">{(error as any)?.stack ?? ''}</pre>
						</div>
					{/snippet}
				</svelte:boundary>
			</div>
		</div>
	</div>
</div>
