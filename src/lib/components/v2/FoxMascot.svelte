<script lang="ts">
	const FOX_MESSAGES = [
		'Weiter so!',
		'Du schaffst das!',
		'Yip yip!',
		'Auf gehts!',
		'*wedelt*',
		'Noch eine Aufgabe?',
		'Fleissig heute!',
		'Lecker Coins!',
		'Streak halten!',
		'Focus Mode!'
	];

	let {
		mood = 'idle',
		message = ''
	}: {
		mood?: 'idle' | 'celebrating' | 'sleeping' | 'happy' | 'encouraging';
		message?: string;
	} = $props();

	let bubbleText = $state(message);
	let showBubble = $state(!!message);
	let currentMood = $state(mood);
	let bubbleTimer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		currentMood = mood;
	});

	$effect(() => {
		if (message) {
			bubbleText = message;
			showBubble = true;
			clearTimeout(bubbleTimer);
			bubbleTimer = setTimeout(() => (showBubble = false), 3000);
		}
	});

	function handleClick() {
		const randomMsg = FOX_MESSAGES[Math.floor(Math.random() * FOX_MESSAGES.length)];
		const moods: Array<typeof currentMood> = ['happy', 'celebrating', 'encouraging'];
		currentMood = moods[Math.floor(Math.random() * moods.length)];
		bubbleText = randomMsg;
		showBubble = true;
		clearTimeout(bubbleTimer);
		bubbleTimer = setTimeout(() => {
			showBubble = false;
			currentMood = mood;
		}, 3000);
	}
</script>

<div class="fox-container" data-mood={currentMood} role="img" aria-label="TaskFuchs Maskottchen">
	<!-- Speech Bubble -->
	{#if showBubble && bubbleText}
		<div class="fox-bubble">{bubbleText}</div>
	{/if}

	<button class="fox-body" onclick={handleClick} aria-label="Fuchs antippen">
		<!-- Tail -->
		<div class="fox-tail"></div>

		<!-- Head -->
		<div class="fox-head">
			<!-- Ears -->
			<div class="fox-ear fox-ear-left"></div>
			<div class="fox-ear fox-ear-right"></div>

			<!-- Face -->
			<div class="fox-face">
				<!-- Eyes -->
				<div class="fox-eye fox-eye-left">
					{#if currentMood === 'sleeping'}
						<div class="fox-eye-closed"></div>
					{:else}
						<div class="fox-pupil"></div>
					{/if}
				</div>
				<div class="fox-eye fox-eye-right">
					{#if currentMood === 'sleeping'}
						<div class="fox-eye-closed"></div>
					{:else}
						<div class="fox-pupil"></div>
					{/if}
				</div>

				<!-- Nose -->
				<div class="fox-nose"></div>
			</div>
		</div>

		<!-- ZZZ for sleeping -->
		{#if currentMood === 'sleeping'}
			<div class="fox-zzz">
				<span>z</span><span>Z</span><span>Z</span>
			</div>
		{/if}
	</button>
</div>

<style>
	.fox-container {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		user-select: none;
	}

	.fox-bubble {
		position: absolute;
		bottom: 100%;
		left: 50%;
		transform: translateX(-50%);
		background: var(--v2-surface);
		border: 1px dashed var(--v2-accent);
		border-radius: var(--v2-radius);
		padding: 4px 10px;
		font-size: .58rem;
		color: var(--v2-accent);
		white-space: nowrap;
		animation: fox-bubble-in .3s var(--v2-bounce, cubic-bezier(.34,1.56,.64,1));
		z-index: 10;
		margin-bottom: 6px;
	}
	.fox-bubble::after {
		content: '';
		position: absolute;
		top: 100%;
		left: 50%;
		transform: translateX(-50%);
		border: 4px solid transparent;
		border-top-color: var(--v2-accent);
	}

	.fox-body {
		position: relative;
		width: 52px;
		height: 52px;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		outline: none;
	}

	.fox-head {
		position: absolute;
		width: 40px;
		height: 36px;
		background: var(--v2-orange, #ff9e64);
		border-radius: 50% 50% 45% 45%;
		left: 50%;
		top: 6px;
		transform: translateX(-50%);
	}

	/* Idle bounce */
	[data-mood="idle"] .fox-head { animation: fox-idle 3s ease-in-out infinite; }
	[data-mood="celebrating"] .fox-head { animation: fox-celebrate 0.5s ease-in-out 3; }
	[data-mood="happy"] .fox-head { animation: fox-happy 0.8s ease-in-out 2; }
	[data-mood="encouraging"] .fox-tail { animation: fox-wag-fast 0.3s ease-in-out infinite; }

	.fox-ear {
		position: absolute;
		width: 14px;
		height: 18px;
		background: var(--v2-orange, #ff9e64);
		top: -10px;
		clip-path: polygon(50% 0%, 0% 100%, 100% 100%);
	}
	.fox-ear::after {
		content: '';
		position: absolute;
		width: 8px;
		height: 10px;
		background: var(--v2-surface, #24283b);
		top: 6px;
		left: 3px;
		clip-path: polygon(50% 0%, 0% 100%, 100% 100%);
	}
	.fox-ear-left { left: 3px; }
	.fox-ear-right { right: 3px; }

	.fox-face {
		position: absolute;
		bottom: 0;
		left: 50%;
		transform: translateX(-50%);
		width: 28px;
		height: 18px;
		background: var(--v2-bg, #1a1b26);
		border-radius: 50%;
		opacity: 0.3;
	}

	.fox-eye {
		position: absolute;
		width: 7px;
		height: 7px;
		background: var(--v2-bg, #1a1b26);
		border-radius: 50%;
		top: 12px;
	}
	.fox-eye-left { left: 8px; }
	.fox-eye-right { right: 8px; }

	.fox-pupil {
		width: 4px;
		height: 4px;
		background: var(--v2-text, #c0caf5);
		border-radius: 50%;
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
	}

	.fox-eye-closed {
		width: 7px;
		height: 2px;
		background: var(--v2-text, #c0caf5);
		border-radius: 1px;
		position: absolute;
		top: 50%;
		left: 0;
		transform: translateY(-50%);
	}

	.fox-nose {
		position: absolute;
		width: 6px;
		height: 4px;
		background: var(--v2-text, #c0caf5);
		border-radius: 50%;
		bottom: 4px;
		left: 50%;
		transform: translateX(-50%);
	}

	.fox-tail {
		position: absolute;
		width: 18px;
		height: 8px;
		background: var(--v2-orange, #ff9e64);
		border-radius: 0 12px 12px 0;
		right: -6px;
		bottom: 8px;
		transform-origin: left center;
		animation: fox-wag 2s ease-in-out infinite;
	}

	.fox-zzz {
		position: absolute;
		top: -4px;
		right: -4px;
		display: flex;
		gap: 1px;
		font-size: .5rem;
		color: var(--v2-text-muted, #565f89);
		font-family: var(--v2-font, monospace);
		font-weight: 700;
	}
	.fox-zzz span:nth-child(1) { animation: fox-zzz 2s ease-in-out infinite 0s; font-size: .4rem; }
	.fox-zzz span:nth-child(2) { animation: fox-zzz 2s ease-in-out infinite 0.3s; font-size: .5rem; }
	.fox-zzz span:nth-child(3) { animation: fox-zzz 2s ease-in-out infinite 0.6s; font-size: .6rem; }

	@keyframes fox-idle {
		0%, 100% { transform: translateX(-50%) translateY(0); }
		50% { transform: translateX(-50%) translateY(-2px); }
	}
	@keyframes fox-celebrate {
		0%, 100% { transform: translateX(-50%) translateY(0) rotate(0deg); }
		25% { transform: translateX(-50%) translateY(-8px) rotate(-3deg); }
		75% { transform: translateX(-50%) translateY(-8px) rotate(3deg); }
	}
	@keyframes fox-happy {
		0%, 100% { transform: translateX(-50%) scale(1); }
		50% { transform: translateX(-50%) scale(1.08); }
	}
	@keyframes fox-wag {
		0%, 100% { transform: rotate(0deg); }
		25% { transform: rotate(12deg); }
		75% { transform: rotate(-12deg); }
	}
	@keyframes fox-wag-fast {
		0%, 100% { transform: rotate(0deg); }
		25% { transform: rotate(20deg); }
		75% { transform: rotate(-20deg); }
	}
	@keyframes fox-zzz {
		0%, 100% { opacity: 0; transform: translateY(0); }
		50% { opacity: 1; transform: translateY(-6px); }
	}
	@keyframes fox-bubble-in {
		0% { opacity: 0; transform: translateX(-50%) scale(.8) translateY(4px); }
		100% { opacity: 1; transform: translateX(-50%) scale(1) translateY(0); }
	}
</style>
