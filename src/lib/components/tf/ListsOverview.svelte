<script lang="ts">
	import type { Database } from '$lib/types/database';
	import Icon from './Icon.svelte';
	import NewListCard from './NewListCard.svelte';

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
		dringendAnzahl,
		benutzer,
		initiale,
		isDark,
		onSelectList,
		onSelectSmart,
		onNeueListe,
		onListContext,
		onToggleTheme,
		onLogout
	}: {
		lists: List[];
		activeListId: string | null;
		offeneJeListe: Map<string, number>;
		dringendAnzahl: number;
		benutzer: string;
		initiale: string;
		isDark: boolean;
		onSelectList: (id: string) => void;
		onSelectSmart: (view: 'pins' | 'dringend') => void;
		onNeueListe: (title: string, icon: string) => void;
		onListContext: (e: MouseEvent, list: List) => void;
		onToggleTheme: () => void;
		onLogout: () => void;
	} = $props();

	let neueListeAuf = $state(false);
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
		<span class="n">{offeneJeListe.get(list.id) ?? 0}</span>
		<Icon name="chevron-rechts" size={16} class="chev" />
	</button>
{/each}

{#if neueListeAuf}
	<NewListCard
		mobil
		onAnlegen={(t, i) => {
			neueListeAuf = false;
			onNeueListe(t, i);
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
		<Icon name="verschieben" />
	</button>
</div>
