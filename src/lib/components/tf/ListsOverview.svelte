<script lang="ts">
	import { untrack } from 'svelte';
	import type { Database } from '$lib/types/database';
	import Icon from './Icon.svelte';
	import NewListCard from './NewListCard.svelte';
	import AvatarStack from './AvatarStack.svelte';
	import type { Mitnutzer } from '$lib/utils/mitnutzer';

	type List = Database['public']['Tables']['lists']['Row'];

	/**
	 * Mobiler Tab „Listen", Uebersichtsschirm — A-klar-spec.md Abschnitt 4.
	 * Reihenfolge: Smart-View „Dringend", Sektion „Meine Listen", Listenzeilen
	 * (52 px), Karte „Neue Liste".
	 *
	 * Die Fusszeile mit Nutzer, Dunkelmodus und Einstellungen steht hier am
	 * Ende des Inhalts, nicht im Header: der Uebersichts-Header traegt laut
	 * Spezifikation weder Zurueck-Pfeil noch ⋮.
	 */
	let {
		lists,
		activeListId,
		offeneJeListe,
		mitnutzer,
		dringendAnzahl,
		benutzer,
		initiale,
		isDark,
		onSelectList,
		onSelectSmart,
		onNeueListe,
		onListContext,
		onToggleTheme,
		onLogout,
		neueListeOffen = false
	}: {
		lists: List[];
		activeListId: string | null;
		offeneJeListe: Map<string, number>;
		/** Beteiligte je Liste, eigener Nutzer eingeschlossen (listId -> Leute). */
		mitnutzer: Record<string, Mitnutzer[]>;
		dringendAnzahl: number;
		benutzer: string;
		initiale: string;
		isDark: boolean;
		onSelectList: (id: string) => void;
		onSelectSmart: (view: 'pins' | 'dringend') => void;
		onNeueListe: (title: string, icon: string) => Promise<boolean>;
		onListContext: (e: MouseEvent, list: List) => void;
		onToggleTheme: () => void;
		onLogout: () => void;
		/** Startet mit ausgeklappter Karte „Neue Liste" — nur die Vorschau-Route. */
		neueListeOffen?: boolean;
	} = $props();

	let neueListeAuf = $state(untrack(() => neueListeOffen));

	/** Die Zeile zeigt nur die ANDEREN — der eigene Avatar steht in der Fusszeile. */
	function fremde(listId: string): Mitnutzer[] {
		return (mitnutzer[listId] ?? []).filter((m) => !m.ich);
	}
</script>

<button class="tf-li" onclick={() => onSelectSmart('dringend')}>
	<span class="em"><Icon name="blitz" /></span>
	<span class="name">Dringend</span>
	<span class="n">{dringendAnzahl}</span>
	<Icon name="chevron-rechts" size={16} class="chev" />
</button>

<div class="tf-lsec">Meine Listen</div>

{#each lists as list (list.id)}
	<button
		class="tf-li"
		class:on={list.id === activeListId}
		onclick={() => onSelectList(list.id)}
		oncontextmenu={(e) => onListContext(e, list)}
	>
		<span class="em">{list.icon}</span>
		<span class="name">{list.title}</span>
		<AvatarStack leute={fremde(list.id)} />
		<span class="n">{offeneJeListe.get(list.id) ?? 0}</span>
		<Icon name="chevron-rechts" size={16} class="chev" />
	</button>
{/each}

{#if neueListeAuf}
	<NewListCard
		mobil
		onAnlegen={async (t, i) => {
			const ok = await onNeueListe(t, i);
			if (ok) neueListeAuf = false;
			return ok;
		}}
		onAbbrechen={() => {
			neueListeAuf = false;
		}}
	/>
{:else}
	<button class="tf-li" onclick={() => (neueListeAuf = true)}>
		<span class="em"><Icon name="plus" /></span>
		<span class="name">Neue Liste</span>
	</button>
{/if}

<div class="tf-navf" style="margin-top:20px">
	<div class="me">
		<span class="tf-avatar">{initiale}</span>
		<span>{benutzer}</span>
	</div>
	<button
		class="tf-ib gross"
		onclick={onToggleTheme}
		aria-label={isDark ? 'Zu hellem Modus wechseln' : 'Zu dunklem Modus wechseln'}
	>
		<Icon name="mond" />
	</button>
	<a class="tf-ib gross" href="/app/g2-koppeln" aria-label="G2 Brille koppeln">
		<Icon name="zahnrad" />
	</a>
	<button class="tf-ib gross" onclick={onLogout} aria-label="Abmelden" style="color:var(--high)">
		<Icon name="abmelden" />
	</button>
</div>
