<script lang="ts">
	import { toasts } from '$lib/stores/toast';

	let { data } = $props();

	let code = $state('');
	let loading = $state(false);
	let success = $state(false);
	let errorMsg = $state('');

	// Only allow digits, max 6
	function handleInput(e: Event) {
		const input = e.target as HTMLInputElement;
		input.value = input.value.replace(/\D/g, '').slice(0, 6);
		code = input.value;
		errorMsg = '';
	}

	async function handleSubmit() {
		if (code.length !== 6) {
			errorMsg = 'Bitte 6-stelligen Code eingeben';
			return;
		}

		loading = true;
		errorMsg = '';

		try {
			// Check if code exists and is unclaimed
			const { data: row, error: fetchErr } = await data.supabase
				.from('g2_pairing_codes')
				.select('code, claimed, created_at')
				.eq('code', code)
				.single();

			if (fetchErr || !row) {
				errorMsg = 'Code nicht gefunden. Bitte auf der Brille pruefen.';
				loading = false;
				return;
			}

			if (row.claimed) {
				errorMsg = 'Code bereits verwendet. Neuen Code auf der Brille generieren.';
				loading = false;
				return;
			}

			// Check TTL (10 minutes)
			const ageMs = Date.now() - new Date(row.created_at).getTime();
			if (ageMs > 10 * 60 * 1000) {
				errorMsg = 'Code abgelaufen. Neuen Code auf der Brille generieren.';
				loading = false;
				return;
			}

			// Get current session tokens
			const { data: sessionData } = await data.supabase.auth.getSession();
			const session = sessionData?.session;
			if (!session) {
				errorMsg = 'Sitzung abgelaufen. Bitte neu einloggen.';
				loading = false;
				return;
			}

			// Write token to pairing code row
			const { error: updateErr } = await data.supabase
				.from('g2_pairing_codes')
				.update({
					token: {
						access_token: session.access_token,
						refresh_token: session.refresh_token
					}
				})
				.eq('code', code);

			if (updateErr) {
				errorMsg = 'Kopplung fehlgeschlagen: ' + updateErr.message;
				loading = false;
				return;
			}

			success = true;
			toasts.show('G2 Brille erfolgreich gekoppelt!');
		} catch (err) {
			errorMsg = 'Unerwarteter Fehler. Bitte erneut versuchen.';
			console.error('G2 pairing error:', err);
		} finally {
			loading = false;
		}
	}

	function reset() {
		code = '';
		success = false;
		errorMsg = '';
	}
</script>

<svelte:head>
	<title>G2 koppeln — TaskFuchs</title>
</svelte:head>

<div class="g2-pairing-page">
	<div class="g2-card">
		<pre class="g2-ascii-header">+------------------+
| G2 KOPPELN       |
+------------------+</pre>

		{#if success}
			<div class="g2-success">
				<span class="g2-check">&#x2714;</span>
				<p class="g2-msg">&gt; kopplung erfolgreich.</p>
				<p class="g2-hint">Die Brille verbindet sich jetzt automatisch.</p>
				<button class="g2-btn" onclick={reset}>Weitere Brille koppeln</button>
			</div>
		{:else}
			<div class="g2-instructions">
				<p>&gt; Even Reality G2 Brille mit TaskFuchs verbinden.</p>
				<p>&gt; Den 6-stelligen Code von der Brille hier eingeben:</p>
			</div>

			<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
				<div class="g2-input-row">
					<span class="g2-prompt">code:~$</span>
					<input
						type="text"
						inputmode="numeric"
						pattern="[0-9]*"
						maxlength="6"
						placeholder="______"
						value={code}
						oninput={handleInput}
						disabled={loading}
						class="g2-code-input"
						autocomplete="off"
					/>
				</div>

				{#if errorMsg}
					<p class="g2-error">&gt; ERROR: {errorMsg}</p>
				{/if}

				<button
					type="submit"
					class="g2-btn g2-btn-primary"
					disabled={loading || code.length !== 6}
				>
					{loading ? '> verbinde...' : '> koppeln'}
				</button>
			</form>

			<div class="g2-footer-hints">
				<p>&gt; Code wird auf dem G2 Display angezeigt.</p>
				<p>&gt; Code ist 10 Minuten gueltig.</p>
			</div>
		{/if}
	</div>
</div>

<style>
	.g2-pairing-page {
		display: flex;
		justify-content: center;
		align-items: flex-start;
		padding: 2rem 1rem;
		min-height: 60vh;
	}

	.g2-card {
		width: 100%;
		max-width: 440px;
		border: 1px solid var(--v2-border, #333);
		border-radius: 4px;
		padding: 1.5rem;
		background: var(--v2-surface, #1e1f2e);
		font-family: 'JetBrains Mono', monospace;
	}

	.g2-ascii-header {
		font-size: 0.75rem;
		color: var(--v2-orange, #ff9e64);
		margin: 0 0 1.25rem 0;
		line-height: 1.2;
	}

	.g2-instructions {
		margin-bottom: 1.25rem;
	}

	.g2-instructions p {
		font-size: 0.8rem;
		color: var(--v2-text-secondary, #a9b1d6);
		margin: 0.25rem 0;
		line-height: 1.5;
	}

	.g2-input-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.g2-prompt {
		font-size: 0.85rem;
		color: var(--v2-green, #9ece6a);
		white-space: nowrap;
	}

	.g2-code-input {
		font-family: 'JetBrains Mono', monospace;
		font-size: 1.5rem;
		letter-spacing: 0.5em;
		width: 100%;
		padding: 0.5rem;
		background: transparent;
		border: none;
		border-bottom: 2px solid var(--v2-border, #333);
		color: var(--v2-text, #c0caf5);
		outline: none;
		text-align: center;
	}

	.g2-code-input:focus {
		border-bottom-color: var(--v2-orange, #ff9e64);
	}

	.g2-code-input::placeholder {
		color: var(--v2-text-muted, #565f89);
		letter-spacing: 0.5em;
	}

	.g2-code-input:disabled {
		opacity: 0.5;
	}

	.g2-error {
		font-size: 0.75rem;
		color: var(--v2-red, #f7768e);
		margin: 0.5rem 0 1rem 0;
	}

	.g2-btn {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.8rem;
		padding: 0.5rem 1rem;
		border: 1px solid var(--v2-border, #333);
		border-radius: 3px;
		background: transparent;
		color: var(--v2-text-secondary, #a9b1d6);
		cursor: pointer;
		transition: all 0.15s;
	}

	.g2-btn:hover {
		background: var(--v2-border, #333);
		color: var(--v2-text, #c0caf5);
	}

	.g2-btn-primary {
		width: 100%;
		border-color: var(--v2-orange, #ff9e64);
		color: var(--v2-orange, #ff9e64);
	}

	.g2-btn-primary:hover:not(:disabled) {
		background: var(--v2-orange, #ff9e64);
		color: var(--v2-bg, #1a1b26);
	}

	.g2-btn-primary:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.g2-footer-hints {
		margin-top: 1.5rem;
		border-top: 1px solid var(--v2-border, #333);
		padding-top: 1rem;
	}

	.g2-footer-hints p {
		font-size: 0.7rem;
		color: var(--v2-text-muted, #565f89);
		margin: 0.2rem 0;
	}

	.g2-success {
		text-align: center;
		padding: 1rem 0;
	}

	.g2-check {
		font-size: 2.5rem;
		color: var(--v2-green, #9ece6a);
		display: block;
		margin-bottom: 0.75rem;
	}

	.g2-msg {
		font-size: 0.85rem;
		color: var(--v2-green, #9ece6a);
		margin-bottom: 0.25rem;
	}

	.g2-hint {
		font-size: 0.75rem;
		color: var(--v2-text-muted, #565f89);
		margin-bottom: 1.25rem;
	}
</style>
