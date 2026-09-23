<script lang="ts">
	import type { Database } from '$lib/types/database';
	import { priorityLabels, priorityOrder, type Priority } from '$lib/constants';
	import Icon from './Icon.svelte';

	type List = Database['public']['Tables']['lists']['Row'];

	/**
	 * Leiste der Mehrfachauswahl.
	 *
	 * Zwei Dinge sind gegenueber der v2-Fassung korrigiert: die Beschriftungen
	 * kommen jetzt aus `constants.ts` — es gibt genau einen Labelsatz
	 * (Low · Normal · High · ASAP), die zweite Reihe „Niedrig/Normal/Hoch/ASAP!"
	 * ist ersatzlos entfallen (Spezifikation Abschnitt 6 und 9, Punkt 7). Und
	 * die Leiste faehrt nicht mehr ein: keine Animation, kein Blur.
	 */
	let {
		selectedCount,
		lists = [],
		onToggleDone,
		onChangePriority,
		onDelete,
		onMoveToList,
		onCancel
	}: {
		selectedCount: number;
		lists?: List[];
		onToggleDone: (done: boolean) => void;
		onChangePriority: (p: Priority) => void;
		onDelete: () => void;
		onMoveToList: (listId: string) => void;
		onCancel: () => void;
	} = $props();

	let prioOffen = $state(false);
	let verschiebenOffen = $state(false);

	const punktFarbe: Record<Priority, string> = {
		low: 'var(--low)',
		normal: 'var(--normal)',
		high: 'var(--high)',
		asap: 'var(--asap)'
	};
</script>

{#if selectedCount > 0}
	<div class="tf-bulk">
		<span class="anz">{selectedCount} ausgew&auml;hlt</span>

		<button class="tf-ib" onclick={() => onToggleDone(true)} aria-label="Erledigt setzen">
			<Icon name="haken" size={20} />
		</button>

		<div class="grp">
			<button
				class="tf-ib"
				class:on={prioOffen}
				onclick={() => {
					prioOffen = !prioOffen;
					verschiebenOffen = false;
				}}
				aria-label="Priorit&auml;t setzen"
			>
				<Icon name="blitz" size={20} />
			</button>
			{#if prioOffen}
				<div class="tf-popmenu tf-wahl aktion">
					{#each priorityOrder as p (p)}
						<button
							class="tf-mi"
							onclick={() => {
								onChangePriority(p);
								prioOffen = false;
							}}
						>
							<span class="punkt" style="background:{punktFarbe[p]}"></span>
							<span class="nm">{priorityLabels[p]}</span>
						</button>
					{/each}
				</div>
			{/if}
		</div>

		{#if lists.length > 1}
			<div class="grp">
				<button
					class="tf-ib"
					class:on={verschiebenOffen}
					onclick={() => {
						verschiebenOffen = !verschiebenOffen;
						prioOffen = false;
					}}
					aria-label="In Liste verschieben"
				>
					<Icon name="verschieben" size={20} />
				</button>
				{#if verschiebenOffen}
					<div class="tf-popmenu tf-wahl aktion">
						{#each lists as l (l.id)}
							<button
								class="tf-mi"
								onclick={() => {
									onMoveToList(l.id);
									verschiebenOffen = false;
								}}
							>
								<span class="em">{l.icon}</span>
								<span class="nm">{l.title}</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		<button class="tf-ib gefahr" onclick={onDelete} aria-label="Auswahl l&ouml;schen">
			<Icon name="loeschen" size={20} />
		</button>
		<button class="tf-btn ghost" onclick={onCancel}>Abbrechen</button>
	</div>
{/if}
