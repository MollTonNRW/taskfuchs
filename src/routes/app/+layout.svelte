<script lang="ts">
	import '../../v2.css';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { v2Theme, v2ThemePresets, type V2ThemePreset } from '$lib/stores/v2/theme.svelte';
	import { v2Events } from '$lib/stores/v2/events.svelte';
	import { listsStore } from '$lib/stores/lists';
	import { toasts } from '$lib/stores/toast';
	import { hiddenListIds, toggleListVisibility } from '$lib/stores/visibility';
	import {
		priorityFilters,
		viewFilters,
		togglePriorityFilter,
		toggleViewFilter,
		hasActiveFilter,
		resetFilters,
		subtasksCollapsedByDefault,
		toggleSubtasksDefault
	} from '$lib/stores/filters';
	import { onMount } from 'svelte';

	let { data, children } = $props();
	let sidebarOpen = $state(browser && window.innerWidth >= 769);
	let filterOpen = $state(false);
	let prioFilterOpen = $state(false);
	let viewFilterOpen = $state(false);

	// Collapsible sidebar sections
	let listenOpen = $state(true);

	// Calendar sync state
	let calendarSyncEnabled = $state<boolean | null>(null); // null = nicht verbunden
	let reminderMinutes = $state(30);
	const REMINDER_OPTIONS = [
		{ label: 'Keine', value: 0 },
		{ label: '10 min', value: 10 },
		{ label: '30 min', value: 30 },
		{ label: '1 Std', value: 60 },
		{ label: '1 Tag', value: 1440 }
	] as const;

	onMount(() => {
		if (data.supabase && data.user) {
			// Check calendar sync status + reminder setting
			(data.supabase as any)
				.from('user_google_tokens')
				.select('sync_enabled, reminder_minutes')
				.eq('user_id', data.user.id)
				.single()
				.then(({ data: tokenData }: { data: { sync_enabled: boolean; reminder_minutes: number } | null }) => {
					calendarSyncEnabled = tokenData?.sync_enabled ?? null;
					if (tokenData?.reminder_minutes != null) {
						reminderMinutes = tokenData.reminder_minutes;
					}
				});
		}
	});

	async function handleCalendarToggle() {
		if (calendarSyncEnabled === null) {
			toasts.show('Bitte mit Google einloggen für Kalender-Sync');
			return;
		}
		const newVal = !calendarSyncEnabled;
		calendarSyncEnabled = newVal;
		const { error } = await (data.supabase as any)
			.from('user_google_tokens')
			.update({ sync_enabled: newVal })
			.eq('user_id', data.user!.id);
		if (error) {
			calendarSyncEnabled = !newVal;
			toasts.error('Kalender-Sync konnte nicht umgeschaltet werden.');
		}
	}

	async function handleReminderChange(minutes: number) {
		const oldVal = reminderMinutes;
		reminderMinutes = minutes;
		const { error } = await (data.supabase as any)
			.from('user_google_tokens')
			.update({ reminder_minutes: minutes })
			.eq('user_id', data.user!.id);
		if (error) {
			reminderMinutes = oldVal;
			toasts.error('Erinnerung konnte nicht gespeichert werden.');
		}
	}

	// Apply DaisyUI data-theme + sync the browser/TWA status-bar color to the active theme
	$effect(() => {
		if (!browser) return;
		const dark = v2Theme.effectiveDark;
		v2Theme.preset; // track preset so the status bar updates on preset change too
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

		<!-- Filter (collapsible, v6 order: after Stats) -->
		<div class="v2-sidebar-section">
			<button class="v2-section-header" onclick={() => (filterOpen = !filterOpen)} aria-label="Filter ein-/ausklappen">
				<h3>
					&#x250C;&#x2500; Filter
					{#if $hasActiveFilter}
						<span class="v2-active-badge">aktiv</span>
					{/if}
				</h3>
				<span class="v2-section-toggle" class:collapsed={!filterOpen}>&#9660;</span>
			</button>

			<div class="v2-filter-section" class:collapsed={!filterOpen}>
				<!-- Priority Filter -->
				<button
					class="v2-filter-group-btn"
					onclick={() => (prioFilterOpen = !prioFilterOpen)}
					aria-label="Prioritäts-Filter ein-/ausklappen"
				>
					<span class="v2-section-toggle" class:collapsed={!prioFilterOpen}>&#9660;</span>
					Priorität
				</button>
				<div class="v2-filter-options" class:collapsed={!prioFilterOpen}>
					{#each [
						{ key: 'low', label: 'Niedrig', color: 'var(--v2-green)' },
						{ key: 'normal', label: 'Normal', color: 'var(--v2-yellow)' },
						{ key: 'high', label: 'Hoch', color: 'var(--v2-red)' },
						{ key: 'asap', label: 'ASAP!', color: 'var(--v2-red)' }
					] as filter}
						<label class="v2-filter-check">
							<input
								type="checkbox"
								checked={$priorityFilters[filter.key as keyof typeof $priorityFilters]}
								onchange={() => togglePriorityFilter(filter.key as any)}
							/>
							<span class="v2-filter-dot" style="background: {filter.color};"></span>
							{filter.label}
						</label>
					{/each}
				</div>

				<!-- View Filter -->
				<button
					class="v2-filter-group-btn"
					onclick={() => (viewFilterOpen = !viewFilterOpen)}
					aria-label="Ansicht-Filter ein-/ausklappen"
				>
					<span class="v2-section-toggle" class:collapsed={!viewFilterOpen}>&#9660;</span>
					Ansicht
				</button>
				<div class="v2-filter-options" class:collapsed={!viewFilterOpen}>
					<label class="v2-filter-check">
						<input type="checkbox" checked={$viewFilters.withDate} onchange={() => toggleViewFilter('withDate')} />
						Mit Termin
					</label>
					<label class="v2-filter-check">
						<input type="checkbox" checked={$viewFilters.shared} onchange={() => toggleViewFilter('shared')} />
						Geteilte Listen
					</label>
				</div>

				<!-- Subtask default visibility -->
				<div class="v2-subtask-default-label">Unteraufgaben bei Start</div>
				<div class="v2-subtask-default-row">
					<button
						class="v2-subtask-default-btn"
						class:active={!$subtasksCollapsedByDefault}
						onclick={() => { if ($subtasksCollapsedByDefault) toggleSubtasksDefault(); }}
					>
						&#x25BC; Ausgeklappt
					</button>
					<button
						class="v2-subtask-default-btn"
						class:active={$subtasksCollapsedByDefault}
						onclick={() => { if (!$subtasksCollapsedByDefault) toggleSubtasksDefault(); }}
					>
						&#x25B6; Eingeklappt
					</button>
				</div>

				{#if $hasActiveFilter}
					<button
						class="v2-filter-reset"
						onclick={resetFilters}
						aria-label="Filter zurücksetzen"
					>
						Filter zurücksetzen
					</button>
				{/if}
			</div>
		</div>

		<!-- Lists Navigation (collapsible, v6 style) -->
		<div class="v2-sidebar-section v2-nav-section">
			<button class="v2-section-header" onclick={() => (listenOpen = !listenOpen)} aria-label="Listen ein-/ausklappen">
				<h3>&#x250C;&#x2500; Listen</h3>
				<span class="v2-section-toggle" class:collapsed={!listenOpen}>&#9660;</span>
			</button>
			<div class="v2-section-body" class:collapsed={!listenOpen}>
				{#if $listsStore.length > 0}
					<div class="v2-nav-list">
						{#each $listsStore as list, i (list.id)}
							<button
								class="v2-nav-item"
								class:active={i === 0}
								onclick={() => toggleListVisibility(list.id)}
								aria-label="{list.title} {$hiddenListIds.has(list.id) ? 'einblenden' : 'ausblenden'}"
							>
								<span class="v2-nav-item-icon">{list.icon}</span>
								<span class="v2-nav-item-title">{list.title}</span>
								<span class="v2-nav-item-count">{v2Events.navCounts[list.id]?.done ?? 0}/{v2Events.navCounts[list.id]?.total ?? 0}</span>
							</button>
						{/each}
					</div>
				{:else}
					<p class="v2-nav-empty">Noch keine Listen</p>
				{/if}
				<button class="v2-nav-add-list" onclick={() => { v2Events.triggerAddList(); if (window.innerWidth < 769) sidebarOpen = false; }} aria-label="Neue Liste">+ Neue Liste</button>

				<!-- Ansichten sub-section (v6 style) -->
				<h3 class="v2-nav-sub-header">&#x250C;&#x2500; Ansichten</h3>
				<div class="v2-nav-item v2-nav-view-item" role="button" tabindex="0">
					<span class="v2-nav-item-icon">&#x2593;</span>
					<span class="v2-nav-item-title">Kanban Board</span>
				</div>
			</div>
		</div>

		<!-- Footer (v6 style: Theme + Presets) -->
		<div class="v2-sidebar-section v2-sidebar-footer">
			<!-- Calendar Sync Toggle -->
			<button
				class="v2-dark-toggle"
				onclick={handleCalendarToggle}
				aria-label="Kalender-Sync umschalten"
			>
				<span>&#x1F4C5;</span>
				<span>Kalender-Sync {calendarSyncEnabled === null ? '' : calendarSyncEnabled ? 'aktiv' : 'inaktiv'}</span>
				{#if calendarSyncEnabled !== null}
					<div class="v2-toggle-switch" class:on={calendarSyncEnabled}></div>
				{/if}
			</button>

			<!-- Calendar Reminder Picker -->
			{#if calendarSyncEnabled === true}
				<div class="v2-reminder-row">
					<span class="v2-reminder-label">&#x23F0; Erinnerung</span>
					<div class="v2-preset-row">
						{#each REMINDER_OPTIONS as opt}
							<button
								class="v2-preset-btn"
								class:active={reminderMinutes === opt.value}
								onclick={() => handleReminderChange(opt.value)}
								aria-label="Erinnerung: {opt.label}"
							>
								{opt.label}
							</button>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Dark/Light Toggle -->
			<button
				class="v2-dark-toggle"
				onclick={() => v2Theme.toggleDark()}
				disabled={v2Theme.preset === 'neon' || v2Theme.preset === 'aurora'}
				aria-label={v2Theme.effectiveDark ? 'Zu Light Mode wechseln' : 'Zu Dark Mode wechseln'}
			>
				{v2Theme.effectiveDark ? '\u263E' : '\u2600'}
				{v2Theme.effectiveDark ? 'Light Mode' : 'Dark Mode'}
			</button>

			<!-- Theme Preset Row (v6 style: single row) -->
			<div class="v2-preset-row">
				{#each v2ThemePresets as t}
					<button
						class="v2-preset-btn"
						class:active={v2Theme.preset === t.id}
						onclick={() => v2Theme.setPreset(t.id)}
						aria-label="Theme: {t.name}"
					>
						<span class="v2-preset-icon">{t.icon}</span> {t.name}
					</button>
				{/each}
			</div>

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
					<!-- View Toggle -->
					<div class="v2-view-toggle">
						<button
							class:active={v2Events.viewMode === 'list'}
							onclick={() => v2Events.setView('list')}
						>&#x2261; Liste</button>
						<button
							class:active={v2Events.viewMode === 'scroll'}
							onclick={() => v2Events.setView('scroll')}
						>&#x2759;&#x2759; Alle</button>
						<button
							class:active={v2Events.viewMode === 'kanban'}
							onclick={() => v2Events.setView('kanban')}
						>&#x2593; Kanban</button>
					</div>

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
