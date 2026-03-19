<script lang="ts">
	import '../../v2.css';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { v2Theme, v2ThemePresets, type V2ThemePreset } from '$lib/stores/v2/theme.svelte';
	import { listsStore } from '$lib/stores/lists';
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

	let { data, children } = $props();
	let sidebarOpen = $state(false);
	let filterOpen = $state(true);
	let prioFilterOpen = $state(false);
	let viewFilterOpen = $state(false);

	// Apply DaisyUI data-theme for utility classes
	$effect(() => {
		if (browser) {
			document.documentElement.setAttribute(
				'data-theme',
				v2Theme.effectiveDark ? 'dark' : 'light'
			);
		}
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
			// Will dispatch custom event for search overlay
			window.dispatchEvent(new CustomEvent('v2:toggle-search'));
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="v2-root {v2Theme.themeClass}" data-gamification={v2Theme.gamificationMode}>
	<!-- Sidebar Overlay (mobile) -->
	{#if sidebarOpen}
		<div
			class="v2-sidebar-overlay active"
			onclick={closeSidebar}
			role="presentation"
		></div>
	{/if}

	<!-- Sidebar -->
	<aside class="v2-sidebar {sidebarOpen ? 'open' : ''}" class:collapsed={!sidebarOpen && typeof window !== 'undefined' && window.innerWidth >= 769}>
		<!-- Fox Area (placeholder for Run 5) -->
		<div class="v2-sidebar-section" style="padding: 18px 16px 14px;">
			<div style="display: flex; align-items: center; gap: 14px;">
				<div style="width: 48px; height: 48px; background: var(--v2-orange); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.4rem; flex-shrink: 0;">
					🦊
				</div>
				<div style="min-width: 0;">
					<div style="font-size: .72rem; font-weight: 700; color: var(--v2-orange);">
						{data.user?.email?.split('@')[0] ?? 'User'}
					</div>
					<div style="font-size: .58rem; color: var(--v2-text-muted); margin-top: 2px;">
						TaskFuchs v2
					</div>
				</div>
			</div>
		</div>

		<!-- Filter Section -->
		<div class="v2-sidebar-section">
			<button class="v2-section-header" onclick={() => (filterOpen = !filterOpen)} style="background: none; border: none; width: 100%; cursor: pointer;">
				<h3>
					Filter
					{#if $hasActiveFilter}
						<span style="font-size: .45rem; padding: 1px 5px; border-radius: 8px; background: var(--v2-accent-glow); color: var(--v2-accent); font-weight: 600; margin-left: 6px;">
							aktiv
						</span>
					{/if}
				</h3>
				<span class="v2-section-toggle" class:collapsed={!filterOpen}>▼</span>
			</button>

			{#if filterOpen}
				<div style="margin-top: 8px; display: flex; flex-direction: column; gap: 4px;">
					<!-- Priority Filter -->
					<button
						onclick={() => (prioFilterOpen = !prioFilterOpen)}
						style="display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: var(--v2-radius); font-size: .65rem; color: var(--v2-text-secondary); background: none; border: none; cursor: pointer; width: 100%; text-align: left;"
					>
						<span class="v2-section-toggle" style="font-size: .5rem;" class:collapsed={!prioFilterOpen}>▼</span>
						Prioritaet
					</button>
					{#if prioFilterOpen}
						<div style="margin-left: 12px; display: flex; flex-direction: column; gap: 2px;">
							{#each [
								{ key: 'low', label: 'Niedrig', color: 'var(--v2-green)' },
								{ key: 'normal', label: 'Normal', color: 'var(--v2-yellow)' },
								{ key: 'high', label: 'Hoch', color: 'var(--v2-red)' },
								{ key: 'asap', label: 'ASAP!', color: 'var(--v2-red)' }
							] as filter}
								<label style="display: flex; align-items: center; gap: 6px; font-size: .65rem; color: var(--v2-text-secondary); cursor: pointer; padding: 3px 6px; border-radius: var(--v2-radius);">
									<input
										type="checkbox"
										checked={$priorityFilters[filter.key as keyof typeof $priorityFilters]}
										onchange={() => togglePriorityFilter(filter.key as any)}
										style="accent-color: var(--v2-accent); width: 13px; height: 13px;"
									/>
									<span style="width: 8px; height: 8px; border-radius: 50%; background: {filter.color}; flex-shrink: 0;"></span>
									{filter.label}
								</label>
							{/each}
						</div>
					{/if}

					<!-- View Filter -->
					<button
						onclick={() => (viewFilterOpen = !viewFilterOpen)}
						style="display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: var(--v2-radius); font-size: .65rem; color: var(--v2-text-secondary); background: none; border: none; cursor: pointer; width: 100%; text-align: left;"
					>
						<span class="v2-section-toggle" style="font-size: .5rem;" class:collapsed={!viewFilterOpen}>▼</span>
						Ansicht
					</button>
					{#if viewFilterOpen}
						<div style="margin-left: 12px; display: flex; flex-direction: column; gap: 2px;">
							<label style="display: flex; align-items: center; gap: 6px; font-size: .65rem; color: var(--v2-text-secondary); cursor: pointer; padding: 3px 6px;">
								<input type="checkbox" checked={$viewFilters.highlighted} onchange={() => toggleViewFilter('highlighted')} style="accent-color: var(--v2-accent); width: 13px; height: 13px;" />
								Nur Fixierte
							</label>
							<label style="display: flex; align-items: center; gap: 6px; font-size: .65rem; color: var(--v2-text-secondary); cursor: pointer; padding: 3px 6px;">
								<input type="checkbox" checked={$viewFilters.withDate} onchange={() => toggleViewFilter('withDate')} style="accent-color: var(--v2-accent); width: 13px; height: 13px;" />
								Mit Termin
							</label>
							<label style="display: flex; align-items: center; gap: 6px; font-size: .65rem; color: var(--v2-text-secondary); cursor: pointer; padding: 3px 6px;">
								<input type="checkbox" checked={$viewFilters.shared} onchange={() => toggleViewFilter('shared')} style="accent-color: var(--v2-accent); width: 13px; height: 13px;" />
								Geteilte Listen
							</label>
						</div>
					{/if}

					<!-- Subtasks collapsed -->
					<label style="display: flex; align-items: center; gap: 6px; font-size: .65rem; color: var(--v2-text-secondary); cursor: pointer; padding: 3px 8px; margin-top: 4px;">
						<input type="checkbox" checked={$subtasksCollapsedByDefault} onchange={toggleSubtasksDefault} style="accent-color: var(--v2-accent); width: 13px; height: 13px;" />
						Unteraufgaben eingeklappt
					</label>

					{#if $hasActiveFilter}
						<button
							onclick={resetFilters}
							style="font-size: .55rem; color: var(--v2-accent); cursor: pointer; text-decoration: underline; padding: 4px 8px; background: none; border: none; text-align: left;"
						>
							Filter zuruecksetzen
						</button>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Lists Navigation -->
		<div class="v2-sidebar-section" style="flex: 1; overflow-y: auto;">
			<h3 style="font-size: .55rem; text-transform: uppercase; letter-spacing: 2px; color: var(--v2-text-muted); margin-bottom: 8px;">Listen</h3>
			{#if $listsStore.length > 0}
				<div style="display: flex; flex-direction: column; gap: 2px;">
					{#each $listsStore as list (list.id)}
						<div class="v2-nav-item" style="position: relative;">
							<span style="font-size: .9rem;">{list.icon}</span>
							<span style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{list.title}</span>
							<button
								onclick={() => toggleListVisibility(list.id)}
								style="opacity: 0; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; border-radius: 4px; background: none; border: none; color: var(--v2-text-muted); font-size: .6rem; transition: opacity .2s; cursor: pointer;"
								onmouseenter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
								onmouseleave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0'; }}
								title={$hiddenListIds.has(list.id) ? 'Einblenden' : 'Ausblenden'}
							>
								{$hiddenListIds.has(list.id) ? '○' : '●'}
							</button>
						</div>
					{/each}
				</div>
			{:else}
				<p style="font-size: .65rem; color: var(--v2-text-muted); font-style: italic;">Noch keine Listen</p>
			{/if}
		</div>

		<!-- Theme + User -->
		<div class="v2-sidebar-section" style="border-top: 1px dashed var(--v2-border); border-bottom: none;">
			<h3 style="font-size: .55rem; text-transform: uppercase; letter-spacing: 2px; color: var(--v2-text-muted); margin-bottom: 8px;">Design</h3>
			<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 12px;">
				{#each v2ThemePresets as t}
					<button
						onclick={() => v2Theme.setPreset(t.id)}
						style="display: flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: var(--v2-radius); font-size: .65rem; border: 1px dashed {v2Theme.preset === t.id ? 'var(--v2-accent)' : 'var(--v2-border)'}; background: {v2Theme.preset === t.id ? 'var(--v2-accent-glow)' : 'transparent'}; color: {v2Theme.preset === t.id ? 'var(--v2-accent)' : 'var(--v2-text-secondary)'}; cursor: pointer; transition: all .2s ease;"
					>
						<span style="font-family: var(--v2-font);">{t.icon}</span>
						{t.name}
					</button>
				{/each}
			</div>

			<!-- Dark/Light Toggle -->
			<button
				onclick={() => v2Theme.toggleDark()}
				style="display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 10px; border-radius: var(--v2-radius); border: 1px dashed var(--v2-border); background: transparent; color: var(--v2-text-secondary); font-size: .65rem; cursor: pointer; margin-bottom: 12px;"
				disabled={v2Theme.preset === 'neon' || v2Theme.preset === 'aurora'}
			>
				{v2Theme.effectiveDark ? '☀' : '☾'}
				{v2Theme.effectiveDark ? 'Light Mode' : 'Dark Mode'}
				{#if v2Theme.preset === 'neon' || v2Theme.preset === 'aurora'}
					<span style="margin-left: auto; font-size: .5rem; color: var(--v2-text-muted);">(erzwungen)</span>
				{/if}
			</button>

			<!-- Logout -->
			<button
				onclick={logout}
				style="display: flex; align-items: center; gap: 6px; width: 100%; padding: 6px 10px; border-radius: var(--v2-radius); border: 1px dashed var(--v2-border); background: transparent; color: var(--v2-red); font-size: .65rem; cursor: pointer;"
			>
				⏻ Abmelden
			</button>
		</div>
	</aside>

	<div class="v2-app">
		<!-- Main area -->
		<div class="v2-main" class:sidebar-collapsed={sidebarOpen === false && typeof window !== 'undefined' && window.innerWidth < 769}>
			<!-- Header -->
			<header class="v2-header">
				<button
					onclick={() => (sidebarOpen = !sidebarOpen)}
					style="background: none; border: none; color: var(--v2-text-secondary); font-size: 1.1rem; padding: 4px; cursor: pointer;"
					aria-label="Sidebar umschalten"
				>
					☰
				</button>
				<div style="display: flex; align-items: center; gap: 8px;">
					<span style="font-size: 1rem;">🦊</span>
					<span style="font-size: .85rem; font-weight: 700; color: var(--v2-orange);">TaskFuchs</span>
					<span style="font-size: .55rem; color: var(--v2-text-muted); padding: 2px 6px; border: 1px dashed var(--v2-border); border-radius: var(--v2-radius);">v2</span>
				</div>
				<div style="flex: 1;"></div>
				<!-- Theme quick toggle (desktop) -->
				<div style="display: none; gap: 4px;" class="hidden md:flex">
					{#each v2ThemePresets as t}
						<button
							onclick={() => v2Theme.setPreset(t.id)}
							style="padding: 4px 10px; border-radius: var(--v2-radius); font-size: .6rem; border: 1px dashed {v2Theme.preset === t.id ? 'var(--v2-accent)' : 'transparent'}; background: {v2Theme.preset === t.id ? 'var(--v2-accent-glow)' : 'transparent'}; color: {v2Theme.preset === t.id ? 'var(--v2-accent)' : 'var(--v2-text-muted)'}; cursor: pointer; transition: all .15s;"
						>
							{t.name}
						</button>
					{/each}
				</div>
				<button
					onclick={() => v2Theme.toggleDark()}
					style="background: none; border: none; color: var(--v2-text-secondary); font-size: .9rem; cursor: pointer; padding: 4px 8px;"
					aria-label="Dark/Light Mode"
				>
					{v2Theme.effectiveDark ? '☀' : '☾'}
				</button>
			</header>

			<!-- Page content -->
			<div class="v2-content">
				{@render children()}
			</div>
		</div>
	</div>
</div>
