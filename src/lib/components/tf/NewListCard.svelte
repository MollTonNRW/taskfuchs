<script lang="ts">
	import { tick } from 'svelte';
	import EmojiPicker from '$lib/components/v2/EmojiPicker.svelte';

	/**
	 * Karte „Neue Liste" — der EINZIGE Einstieg zum Anlegen einer Liste.
	 *
	 * Sie sammelt Symbol und Namen und meldet sie erst bei „Anlegen" nach oben.
	 * Vorher legte `createList()` sofort eine Liste namens „Neue Liste" an und
	 * fragte danach nach dem Namen — bricht man dort ab, bleibt eine Leiche
	 * stehen (8 von 24 Listen in der Produktivdatenbank sind genau das).
	 *
	 * `onAnlegen` meldet zurueck, ob geschrieben wurde. Die Karte bleibt bei
	 * `false` offen und behaelt Name und Symbol — vorher schloss der Aufrufer
	 * sofort, und bei einem Fehler war die Eingabe verloren.
	 */
	let {
		mobil = false,
		onAnlegen,
		onAbbrechen
	}: {
		mobil?: boolean;
		onAnlegen: (title: string, icon: string) => Promise<boolean>;
		onAbbrechen: () => void;
	} = $props();

	let name = $state('');
	let icon = $state('📋');
	let feld: HTMLInputElement | undefined = $state();
	let pickerAuf = $state(false);
	let pickerPos = $state({ x: 0, y: 0 });
	let laeuft = $state(false);

	$effect(() => {
		tick().then(() => feld?.focus());
	});

	async function anlegen() {
		if (laeuft) return;
		const titel = name.trim();
		if (!titel) {
			feld?.focus();
			return;
		}
		laeuft = true;
		const ok = await onAnlegen(titel, icon);
		laeuft = false;
		// Bei Misserfolg bleibt die Karte stehen; der Fehler selbst kommt als
		// Toast aus dem Store. Der Fokus geht zurueck ins Namensfeld — erst nach
		// `tick`, sonst traegt das Feld noch `disabled` und nimmt ihn nicht an.
		if (!ok) {
			await tick();
			feld?.focus();
		}
	}

	function tasten(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			void anlegen();
		}
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			onAbbrechen();
		}
	}

	function pickerOeffnen(e: MouseEvent) {
		const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
		pickerPos = { x: r.left, y: r.bottom + 6 };
		pickerAuf = true;
	}
</script>

<div class="tf-newlist" class:mobil>
	<div class="lbl">Neue Liste</div>
	<div class="in">
		<button class="em" onclick={pickerOeffnen} aria-label="Symbol der Liste w&auml;hlen" disabled={laeuft}
			>{icon}</button
		>
		<input
			class="txt"
			bind:this={feld}
			bind:value={name}
			onkeydown={tasten}
			placeholder="Listenname"
			maxlength="100"
			aria-label="Listenname"
			disabled={laeuft}
		/>
	</div>
	<div class="acts">
		<button class="tf-btn ghost" onclick={onAbbrechen} disabled={laeuft}>Abbrechen</button>
		<button class="tf-btn primary" onclick={anlegen} disabled={laeuft}>
			{laeuft ? 'Legt an …' : 'Anlegen'}
		</button>
	</div>
</div>

{#if pickerAuf}
	<EmojiPicker
		x={pickerPos.x}
		y={pickerPos.y}
		onSelect={(e) => {
			icon = e || '📋';
		}}
		onClose={() => {
			pickerAuf = false;
		}}
	/>
{/if}
