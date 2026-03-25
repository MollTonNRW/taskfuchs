<script lang="ts">
	import { page } from '$app/state';
</script>

<div style="padding: 40px; font-family: 'JetBrains Mono', monospace; max-width: 800px; margin: 0 auto;">
	<h1 style="color: #f7768e; font-size: 1.5rem;">
		{page.status} Error
	</h1>
	<pre style="white-space: pre-wrap; word-break: break-word; font-size: 13px; margin-top: 16px; padding: 16px; background: #1a1b26; color: #c0caf5; border-radius: 8px; border: 1px solid #3b4261;">
{page.error?.message ?? 'Unknown error'}
	</pre>
	{#if page.error?.stack}
		<pre style="white-space: pre-wrap; word-break: break-word; font-size: 11px; margin-top: 8px; padding: 16px; background: #1a1b26; color: #565f89; border-radius: 8px; border: 1px solid #3b4261;">
{page.error.stack}
		</pre>
	{/if}
	<a href="/v2" style="display: inline-block; margin-top: 16px; color: #7aa2f7; font-size: 13px;">Zurueck zur App</a>
</div>
