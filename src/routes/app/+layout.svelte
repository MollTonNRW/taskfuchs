<script lang="ts">
	import { goto } from '$app/navigation';
	import { theme, themes, setTheme, type ThemeId } from '$lib/stores/theme';
	import { listsStore } from '$lib/stores/lists';

	let { data, children } = $props();
	let sidebarOpen = $state(false);
	let themeMenuOpen = $state(false);

	async function logout() {
		await data.supabase.auth.signOut();
		goto('/auth/login');
	}
</script>

<!-- Sidebar Overlay (mobile) -->
{#if sidebarOpen}
	<div
		class="fixed inset-0 z-40 bg-black/40 md:hidden"
		onclick={() => (sidebarOpen = false)}
		role="presentation"
	></div>
{/if}

<!-- Sidebar -->
<aside
	class="fixed top-0 left-0 bottom-0 z-50 w-72 bg-base-100 border-r border-base-300 transform transition-transform duration-300 ease-out overflow-y-auto"
	class:translate-x-0={sidebarOpen}
	class:-translate-x-full={!sidebarOpen}
>
	<div class="p-5">
		<div class="flex items-center justify-between mb-6">
			<div class="flex items-center gap-2">
				<span class="text-xl">🦊</span>
				<span class="text-lg font-bold bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent">TaskFuchs</span>
			</div>
			<button onclick={() => (sidebarOpen = false)} class="btn btn-ghost btn-sm btn-square" aria-label="Seitenleiste schliessen">
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>

		<!-- Lists -->
		<div class="mb-6">
			<h3 class="text-xs font-semibold uppercase tracking-wider text-base-content/40 mb-3">Listen</h3>
			{#if $listsStore.length > 0}
				<ul class="space-y-0.5">
					{#each $listsStore as list (list.id)}
						<li>
							<span class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-base-200 transition-colors cursor-default">
								<span>{list.icon}</span>
								<span class="truncate flex-1">{list.title}</span>
							</span>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="text-sm text-base-content/50 italic">Noch keine Listen</p>
			{/if}
		</div>

		<div class="divider my-2"></div>

		<!-- Theme Switcher -->
		<div class="mb-4">
			<h3 class="text-xs font-semibold uppercase tracking-wider text-base-content/40 mb-3">Design</h3>
			<div class="grid grid-cols-2 gap-1.5">
				{#each themes as t}
					<button
						onclick={() => setTheme(t.id)}
						class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors {$theme === t.id ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-base-200'}"
					>
						<span>{t.icon}</span>
						<span>{t.name}</span>
					</button>
				{/each}
			</div>
		</div>

		<div class="divider my-2"></div>

		<!-- User & Settings -->
		<div class="space-y-2">
			<div class="flex items-center gap-3 px-3 py-2 rounded-lg">
				<div class="avatar placeholder">
					<div class="bg-primary text-primary-content rounded-full w-8 h-8">
						<span class="text-xs">{data.user?.email?.charAt(0).toUpperCase() ?? '?'}</span>
					</div>
				</div>
				<span class="text-sm font-medium truncate flex-1">{data.user?.email ?? ''}</span>
			</div>

			<button onclick={logout} class="btn btn-ghost btn-sm w-full justify-start gap-2 text-error">
				<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
				</svg>
				Abmelden
			</button>
		</div>
	</div>
</aside>

<!-- Header -->
<header class="sticky top-0 z-30 bg-base-100/80 backdrop-blur-xl border-b border-base-300">
	<div class="max-w-7xl mx-auto flex items-center justify-between px-4 py-3">
		<div class="flex items-center gap-3">
			<button onclick={() => (sidebarOpen = !sidebarOpen)} class="btn btn-ghost btn-sm btn-square" aria-label="Seitenleiste oeffnen">
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
				</svg>
			</button>
			<div class="flex items-center gap-2">
				<span class="text-2xl">🦊</span>
				<h1 class="text-xl font-bold tracking-tight bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent">
					TaskFuchs
				</h1>
			</div>
		</div>
		<div class="flex items-center gap-2">
			<!-- Quick theme toggle (light/dark) -->
			<button onclick={() => setTheme($theme === 'light' ? 'dark' : 'light')} class="btn btn-ghost btn-sm btn-square">
				{#if $theme === 'dark' || $theme === 'dracula'}
					<span class="text-lg">☀️</span>
				{:else}
					<span class="text-lg">🌙</span>
				{/if}
			</button>
		</div>
	</div>
</header>

<!-- Main Content -->
<main class="transition-all duration-300" class:md:ml-72={sidebarOpen}>
	{@render children()}
</main>
