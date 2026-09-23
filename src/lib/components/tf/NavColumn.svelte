<script lang="ts">
	import { untrack } from 'svelte';
	import type { Database } from '$lib/types/database';
	import Icon from './Icon.svelte';
	import Logo from './Logo.svelte';
	import NewListCard from './NewListCard.svelte';
	import AvatarStack from './AvatarStack.svelte';
	import type { SmartView } from '$lib/stores/tf/navigation.svelte';
	import type { Mitnutzer } from '$lib/utils/mitnutzer';

	type List = Database['public']['Tables']['lists']['Row'];

	/**
	 * Navigationsspalte (Desktop), 248 px — A-klar-spec.md Abschnitt 3.
	 *
	 * Reihenfolge: Marke, Suchzeile, Smart-Views, Sektionslabel „Listen",
	 * Listenzeilen, EIN Einstieg „Neue Liste", Fusszeile.
	 *
	 * Wichtig: Ein Klick auf eine Listenzeile WAEHLT die Liste
	 * (`onSelectList` -> `nav.selectList`). Das alte Verhalten der Sidebar —
	 * Sichtbarkeit umschalten — ist mit T2 ersatzlos entfallen.
	 */
	let {
		lists,
		activeListId,
		smartView,
		offeneJeListe,
		mitnutzer,
		pinAnzahl,
		dringendAnzahl,
		benutzer,
		initiale,
		isDark,
		onSelectList,
		onSelectSmart,
		onSuche,
		onNeueListe,
		onListContext,
		onToggleTheme,
		onLogout,
		onListDragStart,
		onListDragOver,
		onListDrop,
		onListDragEnd,
		ziehIndex,
		ziehListId,
		neueListeOffen = false
	}: {
		lists: List[];
		activeListId: string | null;
		smartView: SmartView;
		offeneJeListe: Map<string, number>;
		/** Beteiligte je Liste, eigener Nutzer eingeschlossen (listId -> Leute). */
		mitnutzer: Record<string, Mitnutzer[]>;
		pinAnzahl: number;
		dringendAnzahl: number;
		benutzer: string;
		initiale: string;
		isDark: boolean;
		onSelectList: (id: string) => void;
		onSelectSmart: (view: Exclude<SmartView, null>) => void;
		onSuche: () => void;
		onNeueListe: (title: string, icon: string) => Promise<boolean>;
		onListContext: (e: MouseEvent, list: List) => void;
		onToggleTheme: () => void;
		onLogout: () => void;
		onListDragStart: (e: DragEvent, list: List) => void;
		onListDragOver: (e: DragEvent, idx: number) => void;
		onListDrop: (e: DragEvent) => void;
		onListDragEnd: () => void;
		/** Einfuegestelle beim Umsortieren (Index zwischen den Zeilen). */
		ziehIndex: number | null;
		ziehListId: string | null;
		/** Startet mit ausgeklappter Karte „Neue Liste" — nur die Vorschau-Route. */
		neueListeOffen?: boolean;
	} = $props();

	let neueListeAuf = $state(untrack(() => neueListeOffen));
	let menueAuf = $state(false);

	/** Die Zeile zeigt nur die ANDEREN — der eigene Avatar steht in der Fusszeile. */
	function fremde(listId: string): Mitnutzer[] {
		return (mitnutzer[listId] ?? []).filter((m) => !m.ich);
	}
</script>

<nav class="tf-nav" aria-label="Listen">
	<div class="tf-brand">
		<Logo size={28} />
		TaskFuchs
	</div>

	<button class="tf-suchzeile" onclick={onSuche}>
		<Icon name="suche" size={16} />
		Suchen
		<kbd>&#8984;K</kbd>
	</button>

	<div class="tf-nav-scroll">
		<button
			class="tf-ni"
			class:on={smartView === 'pins'}
			onclick={() => onSelectSmart('pins')}
		>
			<Icon name="pin" size={16} />
			<span class="name">Angepinnt</span>
			<span class="n">{pinAnzahl}</span>
		</button>
		<button
			class="tf-ni"
			class:on={smartView === 'dringend'}
			onclick={() => onSelectSmart('dringend')}
		>
			<Icon name="blitz" size={16} />
			<span class="name">Dringend</span>
			<span class="n">{dringendAnzahl}</span>
		</button>

		<div class="tf-navh">Listen</div>

		{#each lists as list, i (list.id)}
			<button
				class="tf-ni"
				class:on={!smartView && list.id === activeListId}
				class:ziel-oben={ziehListId && ziehListId !== list.id && ziehIndex === i}
				class:ziel-unten={ziehListId && ziehListId !== list.id && ziehIndex === i + 1}
				onclick={() => onSelectList(list.id)}
				oncontextmenu={(e) => onListContext(e, list)}
				draggable="true"
				ondragstart={(e) => onListDragStart(e, list)}
				ondragover={(e) => onListDragOver(e, i)}
				ondrop={onListDrop}
				ondragend={onListDragEnd}
			>
				<span class="em">{list.icon}</span>
				<span class="name">{list.title}</span>
				<AvatarStack leute={fremde(list.id)} />
				<span class="n">{offeneJeListe.get(list.id) ?? 0}</span>
			</button>
		{/each}

		{#if neueListeAuf}
			<NewListCard
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
			<button class="tf-ni neu" onclick={() => (neueListeAuf = true)}>
				<Icon name="plus" size={16} />
				<span class="name">Neue Liste</span>
			</button>
		{/if}
	</div>

	<div class="tf-navf">
		<div class="me">
			<span class="tf-avatar">{initiale}</span>
			<span>{benutzer}</span>
		</div>
		<button
			class="tf-ib"
			onclick={onToggleTheme}
			aria-label={isDark ? 'Zu hellem Modus wechseln' : 'Zu dunklem Modus wechseln'}
		>
			<Icon name="mond" />
		</button>
		<button
			class="tf-ib"
			class:on={menueAuf}
			onclick={() => (menueAuf = !menueAuf)}
			aria-label="Einstellungen"
			aria-expanded={menueAuf}
		>
			<Icon name="zahnrad" />
		</button>

		{#if menueAuf}
			<div class="tf-popmenu" role="menu">
				<a class="tf-mi" href="/app/g2-koppeln" role="menuitem" onclick={() => (menueAuf = false)}>
					<Icon name="person" size={16} />
					G2 Brille koppeln
				</a>
				<button
					class="tf-mi danger"
					role="menuitem"
					onclick={() => {
						menueAuf = false;
						onLogout();
					}}
				>
					<Icon name="abmelden" size={16} />
					Abmelden
				</button>
			</div>
		{/if}
	</div>
</nav>

{#if menueAuf}
	<!-- Klick daneben schliesst nur dieses kleine Menue. -->
	<div
		style="position:fixed;inset:0;z-index:29"
		onclick={() => (menueAuf = false)}
		role="presentation"
	></div>
{/if}
