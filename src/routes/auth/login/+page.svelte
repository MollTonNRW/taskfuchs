<script lang="ts">
	import { goto } from '$app/navigation';

	let { data } = $props();
	let email = $state('');
	let password = $state('');
	let loading = $state(false);
	let error = $state('');

	async function loginWithEmail() {
		loading = true;
		error = '';
		const { error: err } = await data.supabase.auth.signInWithPassword({ email, password });
		if (err) {
			error = err.message;
			loading = false;
		} else {
			goto('/app');
		}
	}

	async function loginWithGoogle() {
		loading = true;
		const { error: err } = await data.supabase.auth.signInWithOAuth({
			provider: 'google',
			options: { redirectTo: `${window.location.origin}/auth/callback` }
		});
		if (err) {
			error = err.message;
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Login — TaskFuchs</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-base-200 px-4">
	<div class="card w-full max-w-sm bg-base-100 shadow-xl">
		<div class="card-body">
			<div class="text-center mb-4">
				<img src="/icons/icon-96x96.png" alt="TaskFuchs" class="w-16 h-16 mx-auto rounded-xl" />
				<h1 class="text-2xl font-bold mt-2 bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent">
					TaskFuchs
				</h1>
				<p class="text-sm text-base-content/60 mt-1">Anmelden</p>
			</div>

			{#if error}
				<div class="alert alert-error text-sm">
					<span>{error}</span>
				</div>
			{/if}

			<form onsubmit={(e) => { e.preventDefault(); loginWithEmail(); }}>
				<div class="form-control mb-3">
					<label class="label" for="email">
						<span class="label-text">E-Mail</span>
					</label>
					<input
						id="email"
						type="email"
						bind:value={email}
						placeholder="name@beispiel.de"
						class="input input-bordered w-full"
						required
					/>
				</div>
				<div class="form-control mb-4">
					<label class="label" for="password">
						<span class="label-text">Passwort</span>
					</label>
					<input
						id="password"
						type="password"
						bind:value={password}
						placeholder="••••••••"
						class="input input-bordered w-full"
						required
					/>
				</div>
				<button type="submit" class="btn btn-primary w-full" disabled={loading}>
					{#if loading}
						<span class="loading loading-spinner loading-sm"></span>
					{/if}
					Anmelden
				</button>
			</form>

			<div class="divider text-xs">ODER</div>

			<button onclick={loginWithGoogle} class="btn btn-outline w-full gap-2" disabled={loading}>
				<svg class="w-5 h-5" viewBox="0 0 24 24">
					<path
						fill="#4285F4"
						d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
					/>
					<path
						fill="#34A853"
						d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
					/>
					<path
						fill="#FBBC05"
						d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
					/>
					<path
						fill="#EA4335"
						d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
					/>
				</svg>
				Mit Google anmelden
			</button>

			<p class="text-center text-sm mt-4 text-base-content/60">
				Noch kein Konto?
				<a href="/auth/register" class="link link-primary">Registrieren</a>
			</p>
		</div>
	</div>
</div>
