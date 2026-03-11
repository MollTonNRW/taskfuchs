<script lang="ts">
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { themePresets, themePreset, isDark, effectiveDark, themeClass, setPreset, toggleDark, type ThemePreset } from '$lib/stores/theme';
	import { listsStore } from '$lib/stores/lists';
	import { hiddenListIds, toggleListVisibility } from '$lib/stores/visibility';
	import {
		priorityFilters,
		timeframeFilters,
		viewFilters,
		togglePriorityFilter,
		toggleTimeframeFilter,
		toggleViewFilter,
		hasActiveFilter,
		resetFilters
	} from '$lib/stores/filters';

	let { data, children } = $props();
	let sidebarOpen = $state(false);

	// Apply theme class to body
	$effect(() => {
		if (browser) {
			const cls = $themeClass;
			document.body.className = cls;
			document.body.setAttribute('data-tf-theme', '');
		}
	});

	async function logout() {
		await data.supabase.auth.signOut();
		goto('/auth/login');
	}

	function closeSidebar() {
		sidebarOpen = false;
	}
</script>

<!-- Sidebar Overlay (mobile) -->
{#if sidebarOpen}
	<div
		class="sidebar-overlay active md:!opacity-0 md:!pointer-events-none"
		onclick={closeSidebar}
		role="presentation"
	></div>
{/if}

<!-- Sidebar -->
<aside
	class="sidebar tf-surface border-r tf-border {sidebarOpen ? 'open' : ''}"
	style="background: var(--tf-surface);"
>
	<div class="p-5">
		<div class="flex items-center justify-between mb-6">
			<div class="flex items-center gap-2">
				<span class="text-xl">🦊</span>
				<span class="text-lg font-bold bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent">TaskFuchs</span>
			</div>
			<button onclick={closeSidebar} class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors" aria-label="Sidebar schließen">
				<svg class="w-5 h-5 tf-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
			</button>
		</div>

		<!-- Filters: Priority -->
		<div class="mb-4">
			<div class="flex items-center justify-between mb-3">
				<h3 class="text-xs font-semibold uppercase tracking-wider tf-text-muted">Filter</h3>
				{#if $hasActiveFilter}
					<button
						onclick={resetFilters}
						class="text-[10px] font-medium px-2 py-0.5 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
						style="color: var(--tf-accent);"
					>
						Zurücksetzen
					</button>
				{/if}
			</div>
			<div class="space-y-1">
				<label class="flex items-center gap-2.5 text-sm tf-text cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 px-3 py-1.5 rounded-lg transition-colors">
					<input type="checkbox" checked={$priorityFilters.low} onchange={() => togglePriorityFilter('low')} class="accent-orange-500 w-3.5 h-3.5" />
					<span class="w-2 h-2 rounded-full bg-gray-400"></span> Niedrig
				</label>
				<label class="flex items-center gap-2.5 text-sm tf-text cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 px-3 py-1.5 rounded-lg transition-colors">
					<input type="checkbox" checked={$priorityFilters.normal} onchange={() => togglePriorityFilter('normal')} class="accent-orange-500 w-3.5 h-3.5" />
					<span class="w-2 h-2 rounded-full bg-blue-500"></span> Normal
				</label>
				<label class="flex items-center gap-2.5 text-sm tf-text cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 px-3 py-1.5 rounded-lg transition-colors">
					<input type="checkbox" checked={$priorityFilters.high} onchange={() => togglePriorityFilter('high')} class="accent-orange-500 w-3.5 h-3.5" />
					<span class="w-2 h-2 rounded-full bg-orange-500"></span> Hoch
				</label>
				<label class="flex items-center gap-2.5 text-sm tf-text cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 px-3 py-1.5 rounded-lg transition-colors">
					<input type="checkbox" checked={$priorityFilters.asap} onchange={() => togglePriorityFilter('asap')} class="accent-orange-500 w-3.5 h-3.5" />
					<span class="w-2 h-2 rounded-full bg-red-500"></span> ASAP!
				</label>
			</div>
		</div>

		<!-- Filters: Timeframe -->
		<div class="mb-4">
			<h3 class="text-xs font-semibold uppercase tracking-wider tf-text-muted mb-3">Zeitraum</h3>
			<div class="space-y-1">
				<label class="flex items-center gap-2.5 text-sm tf-text cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 px-3 py-1.5 rounded-lg transition-colors">
					<input type="checkbox" checked={$timeframeFilters.akut} onchange={() => toggleTimeframeFilter('akut')} class="accent-orange-500 w-3.5 h-3.5" />
					<span class="text-red-500">●</span> Akut
				</label>
				<label class="flex items-center gap-2.5 text-sm tf-text cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 px-3 py-1.5 rounded-lg transition-colors">
					<input type="checkbox" checked={$timeframeFilters.zeitnah} onchange={() => toggleTimeframeFilter('zeitnah')} class="accent-orange-500 w-3.5 h-3.5" />
					<span class="text-orange-500">●</span> Zeitnah
				</label>
				<label class="flex items-center gap-2.5 text-sm tf-text cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 px-3 py-1.5 rounded-lg transition-colors">
					<input type="checkbox" checked={$timeframeFilters.mittelfristig} onchange={() => toggleTimeframeFilter('mittelfristig')} class="accent-orange-500 w-3.5 h-3.5" />
					<span class="text-amber-500">●</span> Mittelfristig
				</label>
				<label class="flex items-center gap-2.5 text-sm tf-text cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 px-3 py-1.5 rounded-lg transition-colors">
					<input type="checkbox" checked={$timeframeFilters.langfristig} onchange={() => toggleTimeframeFilter('langfristig')} class="accent-orange-500 w-3.5 h-3.5" />
					<span class="text-green-500">●</span> Langfristig
				</label>
			</div>
		</div>

		<!-- Filters: View -->
		<div class="mb-4">
			<h3 class="text-xs font-semibold uppercase tracking-wider tf-text-muted mb-3">Ansicht</h3>
			<div class="space-y-1">
				<label class="flex items-center gap-2.5 text-sm tf-text cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 px-3 py-1.5 rounded-lg transition-colors">
					<input type="checkbox" checked={$viewFilters.highlighted} onchange={() => toggleViewFilter('highlighted')} class="accent-orange-500 w-3.5 h-3.5" />
					<svg class="w-4 h-4 text-orange-400" fill="currentColor" viewBox="0 0 24 24"><path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/></svg>
					Nur Fixierte
				</label>
				<label class="flex items-center gap-2.5 text-sm tf-text cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 px-3 py-1.5 rounded-lg transition-colors">
					<input type="checkbox" checked={$viewFilters.withDate} onchange={() => toggleViewFilter('withDate')} class="accent-orange-500 w-3.5 h-3.5" />
					<svg class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
					Mit Termin
				</label>
				<label class="flex items-center gap-2.5 text-sm tf-text cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 px-3 py-1.5 rounded-lg transition-colors">
					<input type="checkbox" checked={$viewFilters.shared} onchange={() => toggleViewFilter('shared')} class="accent-orange-500 w-3.5 h-3.5" />
					<svg class="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
					Geteilte Listen
				</label>
			</div>
		</div>

		<div class="h-px mb-4" style="background: var(--tf-border);"></div>

		<!-- Lists -->
		<div class="mb-6">
			<h3 class="text-xs font-semibold uppercase tracking-wider tf-text-muted mb-3">Listen</h3>
			{#if $listsStore.length > 0}
				<div class="space-y-0.5">
					{#each $listsStore as list (list.id)}
						<div class="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors group">
							<span class="text-base">{list.icon}</span>
							<span class="flex-1 text-sm font-medium tf-text truncate">{list.title}</span>
							<button
								onclick={() => toggleListVisibility(list.id)}
								class="w-6 h-6 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 transition-all"
								title={$hiddenListIds.has(list.id) ? 'Einblenden' : 'Ausblenden'}
							>
								{#if $hiddenListIds.has(list.id)}
									<svg class="w-4 h-4 tf-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L6.11 6.11m3.768 3.768L3 3m18 18l-6.12-6.12m0 0L21 21"/></svg>
								{:else}
									<svg class="w-4 h-4 tf-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
								{/if}
							</button>
						</div>
					{/each}
				</div>
			{:else}
				<p class="text-sm tf-text-muted italic">Noch keine Listen</p>
			{/if}
		</div>

		<div class="h-px mb-4" style="background: var(--tf-border);"></div>

		<!-- Theme Preset -->
		<div class="mb-4">
			<h3 class="text-xs font-semibold uppercase tracking-wider tf-text-muted mb-3">Design</h3>
			<div class="grid grid-cols-2 gap-1.5">
				{#each themePresets as t}
					<button
						onclick={() => setPreset(t.id)}
						class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors {$themePreset === t.id ? 'font-medium' : 'hover:bg-black/5 dark:hover:bg-white/5'}"
						style={$themePreset === t.id ? 'background: var(--tf-accent); color: white;' : ''}
					>
						<span>{t.icon}</span>
						<span>{t.name}</span>
					</button>
				{/each}
			</div>
		</div>

		<div class="h-px mb-4" style="background: var(--tf-border);"></div>

		<!-- User & Settings -->
		<div class="space-y-2">
			<div class="flex items-center gap-3 px-3 py-2 rounded-lg">
				<div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white" style="background: var(--tf-accent);">
					{data.user?.email?.charAt(0).toUpperCase() ?? '?'}
				</div>
				<span class="text-sm font-medium truncate flex-1 tf-text">{data.user?.email ?? ''}</span>
			</div>

			<button onclick={logout} class="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
				<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
				</svg>
				Abmelden
			</button>
		</div>
	</div>
</aside>

<!-- Header -->
<header class="tf-header sticky top-0 z-30 border-b px-4 py-3 transition-all duration-500">
	<div class="max-w-7xl mx-auto flex items-center justify-between">
		<div class="flex items-center gap-3">
			<button onclick={() => (sidebarOpen = !sidebarOpen)} class="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition-all duration-200" aria-label="Sidebar öffnen">
				<svg class="w-5 h-5 tf-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
				</svg>
			</button>
			<div class="flex items-center gap-2.5">
				<span class="text-2xl">🦊</span>
				<h1 class="text-xl font-bold tracking-tight bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent tf-header-text" style={$themePreset === 'colorful' ? 'color: white; background: none; -webkit-text-fill-color: white;' : ''}>TaskFuchs</h1>
			</div>
			{#if $hasActiveFilter}
				<span class="text-[10px] font-medium px-2 py-0.5 rounded-full text-white" style="background: var(--tf-accent);">Filter aktiv</span>
			{/if}
		</div>
		<div class="flex items-center gap-2">
			<!-- Theme Preset Buttons -->
			<div class="hidden sm:flex items-center bg-gray-100 dark:bg-gray-800 rounded-xl p-1 gap-0.5">
				{#each themePresets as t}
					<button
						onclick={() => setPreset(t.id)}
						class="theme-btn px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-300 {$themePreset === t.id ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}"
					>
						{t.name}
					</button>
				{/each}
			</div>
			<!-- Dark/Light Toggle -->
			<button onclick={toggleDark} class="tf-tooltip w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-300" data-tip="Dark/Light Mode">
				<span class="text-lg transition-transform duration-500" style={$effectiveDark ? 'transform: rotate(360deg)' : ''}>
					{$effectiveDark ? '☀️' : '🌙'}
				</span>
			</button>
		</div>
	</div>
</header>

<!-- Main Content -->
<main class="main-content transition-all duration-350" class:shifted={sidebarOpen}>
	{@render children()}
</main>
