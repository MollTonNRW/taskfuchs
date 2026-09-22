<script lang="ts">
	import { page } from '$app/state';
</script>

<div class="tf-root" style="padding: 40px; max-width: 800px; margin: 0 auto;">
	<h1 style="color: var(--high); font-size: 1.5rem;">
		{page.status} Error
	</h1>
	<pre
		style="white-space: pre-wrap; word-break: break-word; font-size: 13px; margin-top: 16px; padding: 16px; background: var(--surface-2); color: var(--ink); border-radius: 8px; border: 1px solid var(--line);">
{page.error?.message ?? 'Unknown error'}
	</pre>
	{#if page.error?.stack}
		<pre
			style="white-space: pre-wrap; word-break: break-word; font-size: 11px; margin-top: 8px; padding: 16px; background: var(--surface-2); color: var(--ink-3); border-radius: 8px; border: 1px solid var(--line);">
{page.error.stack}
		</pre>
	{/if}
	<a href="/app" style="display: inline-block; margin-top: 16px; color: var(--accent-ink); font-size: 13px;"
		>Zurück zur App</a
	>
</div>
