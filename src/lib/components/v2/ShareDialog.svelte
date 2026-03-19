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
			error = 'Bitte eine gueltige E-Mail eingeben';
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
</script>

<!-- Backdrop -->
<div
	class="fixed inset-0"
	style="z-index: 80; background: rgba(0,0,0,.6); backdrop-filter: blur(4px);"
	onclick={onClose}
	role="presentation"
></div>

<!-- Dialog -->
<div
	class="fixed v2-glass-card"
	style="z-index: 81; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 90%; max-width: 420px; padding: 24px;"
	onkeydown={handleKeydown}
	role="dialog"
	aria-label="Liste teilen"
	tabindex="-1"
>
	<!-- Header -->
	<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
		<div style="display: flex; align-items: center; gap: 8px;">
			<span style="font-size: .55rem; text-transform: uppercase; letter-spacing: 2px; color: var(--v2-accent);">&gt; share</span>
			<span style="font-size: .85rem; font-weight: 700; color: var(--v2-text);">Liste teilen</span>
		</div>
		<button
			onclick={onClose}
			style="background: none; border: 1px solid var(--v2-border); border-radius: var(--v2-radius); width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; color: var(--v2-text-muted); cursor: pointer; font-size: .65rem;"
			aria-label="Schliessen"
		>
			&#x2715;
		</button>
	</div>

	<!-- List info -->
	<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px; padding: 8px 12px; border: 1px dashed var(--v2-border); border-radius: var(--v2-radius); background: var(--v2-hover);">
		<span style="font-size: 1rem;">{list.icon}</span>
		<span style="font-size: .72rem; font-weight: 600; color: var(--v2-text);">{list.title}</span>
	</div>

	<!-- Invite form -->
	<div style="margin-bottom: 16px;">
		<div style="font-size: .55rem; text-transform: uppercase; letter-spacing: 2px; color: var(--v2-text-muted); margin-bottom: 8px;">Person einladen</div>
		<div style="display: flex; gap: 8px;">
			<!-- svelte-ignore a11y_autofocus -->
			<input
				type="email"
				bind:value={email}
				placeholder="email@beispiel.de"
				class="v2-task-input"
				style="flex: 1; padding: 8px 12px; font-size: .72rem;"
				onkeydown={handleKeydown}
				autofocus
			/>
			<select
				bind:value={role}
				class="v2-task-input"
				style="padding: 8px; font-size: .72rem;"
			>
				<option value="editor">Bearbeiter</option>
				<option value="viewer">Betrachter</option>
			</select>
			<button
				onclick={handleSubmit}
				style="padding: 8px 16px; background: var(--v2-accent); color: var(--v2-bg); font-size: .65rem; font-weight: 600; border: none; border-radius: var(--v2-radius); cursor: pointer; font-family: var(--v2-font); white-space: nowrap;"
				disabled={!email.trim()}
			>
				Einladen
			</button>
		</div>
		{#if error}
			<p style="font-size: .6rem; color: var(--v2-red); margin-top: 4px;">{error}</p>
		{/if}
	</div>

	<!-- Current shares -->
	{#if shares.length > 0}
		<div>
			<div style="font-size: .55rem; text-transform: uppercase; letter-spacing: 2px; color: var(--v2-text-muted); margin-bottom: 8px;">Geteilte Zugriffe</div>
			<div style="display: flex; flex-direction: column; gap: 6px;">
				{#each shares as share (share.id)}
					<div style="display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--v2-border); border-radius: var(--v2-radius); background: var(--v2-surface);">
						<div style="width: 28px; height: 28px; border-radius: var(--v2-radius); display: flex; align-items: center; justify-content: center; font-size: .55rem; font-weight: 700; color: var(--v2-bg); background: var(--v2-accent);">
							{share.user_id.charAt(0).toUpperCase()}
						</div>
						<span style="flex: 1; font-size: .65rem; color: var(--v2-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--v2-font);">
							{share.user_id}
						</span>
						{#if share.role === 'owner'}
							<span style="font-size: .55rem; font-weight: 600; color: var(--v2-accent);">{roleLabels[share.role]}</span>
						{:else}
							<select
								value={share.role}
								onchange={(e) => onChangeRole(share.id, (e.target as HTMLSelectElement).value as 'editor' | 'viewer')}
								class="v2-task-input"
								style="font-size: .6rem; padding: 4px 6px;"
							>
								<option value="editor">Bearbeiter</option>
								<option value="viewer">Betrachter</option>
							</select>
							<button
								onclick={() => onRemoveShare(share.id)}
								style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; background: none; border: 1px solid var(--v2-border); border-radius: var(--v2-radius); color: var(--v2-red); cursor: pointer; font-size: .6rem;"
								title="Zugriff entfernen"
							>
								&#x2715;
							</button>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{:else}
		<p style="font-size: .65rem; color: var(--v2-text-muted); text-align: center; padding: 12px 0; font-style: italic;">
			Diese Liste ist noch nicht geteilt.
		</p>
	{/if}
</div>
