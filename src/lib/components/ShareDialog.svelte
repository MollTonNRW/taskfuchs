<script lang="ts">
	import type { Database } from '$lib/types/database';

	type List = Database['public']['Tables']['lists']['Row'];
	type ListShare = Database['public']['Tables']['list_shares']['Row'];

	let {
		list,
		shares = [],
		onClose,
		onShare,
		onRemoveShare,
		onChangeRole
	}: {
		list: List;
		shares: ListShare[];
		onClose: () => void;
		onShare: (email: string, role: 'editor' | 'viewer') => void;
		onRemoveShare: (shareId: string) => void;
		onChangeRole: (shareId: string, role: 'editor' | 'viewer') => void;
	} = $props();

	let email = $state('');
	let role = $state<'editor' | 'viewer'>('editor');
	let error = $state('');

	function handleSubmit() {
		const trimmed = email.trim();
		if (!trimmed || !trimmed.includes('@')) {
			error = 'Bitte eine gültige E-Mail eingeben';
			return;
		}
		error = '';
		onShare(trimmed, role);
		email = '';
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); }
		if (e.key === 'Escape') onClose();
	}

	const roleLabels: Record<string, string> = {
		owner: 'Besitzer',
		editor: 'Bearbeiter',
		viewer: 'Betrachter'
	};

	const roleColors: Record<string, string> = {
		owner: 'text-orange-500',
		editor: 'text-blue-500',
		viewer: 'text-gray-500'
	};
</script>

<!-- Backdrop -->
<div
	class="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm"
	onclick={onClose}
	role="presentation"
	style="animation: fade-in .2s ease forwards;"
></div>

<!-- Dialog -->
<div
	class="fixed z-[81] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-md rounded-2xl p-6 scale-in tf-popover-bg"
	style="border: 1px solid var(--tf-border); box-shadow: 0 25px 60px rgba(0,0,0,.2);"
	onkeydown={handleKeydown}
	role="dialog"
	aria-label="Liste teilen"
>
	<!-- Header -->
	<div class="flex items-center justify-between mb-5">
		<div class="flex items-center gap-2">
			<svg class="w-5 h-5" style="color: var(--tf-accent);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
			</svg>
			<h3 class="text-lg font-semibold tf-text">Liste teilen</h3>
		</div>
		<button
			onclick={onClose}
			class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
			aria-label="Schliessen"
		>
			<svg class="w-5 h-5 tf-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
			</svg>
		</button>
	</div>

	<!-- List info -->
	<div class="flex items-center gap-2 mb-5 px-3 py-2 rounded-lg" style="background: var(--tf-surface-hover);">
		<span class="text-lg">{list.icon}</span>
		<span class="text-sm font-medium tf-text">{list.title}</span>
	</div>

	<!-- Invite form -->
	<div class="mb-5">
		<label class="text-xs font-semibold uppercase tracking-wider tf-text-muted mb-2 block">
			Person einladen
		</label>
		<div class="flex gap-2">
			<!-- svelte-ignore a11y_autofocus -->
			<input
				type="email"
				bind:value={email}
				placeholder="email@beispiel.de"
				class="tf-input flex-1 px-3 py-2 text-sm rounded-xl border focus:outline-none focus:ring-2 focus:ring-orange-400/40"
				onkeydown={handleKeydown}
				autofocus
			/>
			<select
				bind:value={role}
				class="tf-input px-2 py-2 text-sm rounded-xl border focus:outline-none"
			>
				<option value="editor">Bearbeiter</option>
				<option value="viewer">Betrachter</option>
			</select>
			<button
				onclick={handleSubmit}
				class="px-4 py-2 text-white text-sm font-medium rounded-xl transition-all hover:shadow-lg active:scale-95"
				style="background: var(--tf-accent-gradient);"
				disabled={!email.trim()}
			>
				Einladen
			</button>
		</div>
		{#if error}
			<p class="text-xs text-red-500 mt-1">{error}</p>
		{/if}
	</div>

	<!-- Current shares -->
	{#if shares.length > 0}
		<div>
			<label class="text-xs font-semibold uppercase tracking-wider tf-text-muted mb-2 block">
				Geteilte Zugriffe
			</label>
			<div class="space-y-2">
				{#each shares as share (share.id)}
					<div class="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
						<div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white" style="background: var(--tf-accent);">
							{share.user_id.charAt(0).toUpperCase()}
						</div>
						<span class="flex-1 text-sm tf-text truncate">{share.user_id}</span>
						{#if share.role === 'owner'}
							<span class="text-xs font-medium {roleColors[share.role]}">{roleLabels[share.role]}</span>
						{:else}
							<select
								value={share.role}
								onchange={(e) => onChangeRole(share.id, (e.target as HTMLSelectElement).value as 'editor' | 'viewer')}
								class="text-xs px-2 py-1 rounded-lg border tf-input"
							>
								<option value="editor">Bearbeiter</option>
								<option value="viewer">Betrachter</option>
							</select>
							<button
								onclick={() => onRemoveShare(share.id)}
								class="w-6 h-6 flex items-center justify-center rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 hover:text-red-500 transition-colors"
								title="Zugriff entfernen"
							>
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
								</svg>
							</button>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{:else}
		<p class="text-sm tf-text-muted italic text-center py-3">
			Diese Liste ist noch nicht geteilt.
		</p>
	{/if}
</div>
