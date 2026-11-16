<script lang="ts">
	import { untrack } from 'svelte';
	import type { Database } from '$lib/types/database';
	import Icon from './Icon.svelte';
	import NewListCard from './NewListCard.svelte';
	import AvatarStack from './AvatarStack.svelte';
	import type { Mitnutzer } from '$lib/utils/mitnutzer';
	import { QUESTS_URL } from '$lib/utils/quests';

	type List = Database['public']['Tables']['lists']['Row'];

	/**
	 * Mobiler Tab „Listen", Uebersichtsschirm — A-klar-spec.md Abschnitt 4,
	 * seit 16.11.2026 im Ingo Design 2.0 (Mockup TfListen): Suchfeld, zwei
	 * Karten „Angepinnt" (Senfgelb) und „Dringend" (Nacht/Lime), Kopf „Listen"
	 * mit „+ Neue Liste", Listen als Karten.
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
		pinAnzahl = 0,
		onSuche,
		benutzer,
		initiale,
		isDark,
		onSelectList,
		onSelectSmart,
		onNeueListe,
		onListContext,
		onToggleTheme,
		onLogout,
		questsZielFuer = () => null,
		einkaufInQuests = false,
		onToggleEinkaufQuests,
		neueListeOffen = false
	}: {
		lists: List[];
		activeListId: string | null;
		offeneJeListe: Map<string, number>;
		/** Beteiligte je Liste, eigener Nutzer eingeschlossen (listId -> Leute). */
		mitnutzer: Record<string, Mitnutzer[]>;
		dringendAnzahl: number;
		/** Zahl der angepinnten Aufgaben (Karte „Angepinnt"). */
		pinAnzahl?: number;
		/** Suchfeld oben fuehrt in den Tab „Suche". */
		onSuche?: () => void;
		benutzer: string;
		initiale: string;
		isDark: boolean;
		onSelectList: (id: string) => void;
		onSelectSmart: (view: 'pins' | 'dringend') => void;
		onNeueListe: (title: string, icon: string) => Promise<boolean>;
		onListContext: (e: MouseEvent, list: List) => void;
		onToggleTheme: () => void;
		onLogout: () => void;
		/** Familien-Quests-URL, wenn die Liste dorthin umgeleitet wird, sonst null. */
		questsZielFuer?: (list: List) => string | null;
		/** Schalter: Liste „Einkaufen" oeffnet Familien-Quests (Default an). */
		einkaufInQuests?: boolean;
		onToggleEinkaufQuests?: () => void;
		/** Startet mit ausgeklappter Karte „Neue Liste" — nur die Vorschau-Route. */
		neueListeOffen?: boolean;
	} = $props();

	let neueListeAuf = $state(untrack(() => neueListeOffen));

	/** Die Zeile zeigt nur die ANDEREN — der eigene Avatar steht in der Fusszeile. */
	function fremde(listId: string): Mitnutzer[] {
		return (mitnutzer[listId] ?? []).filter((m) => !m.ich);
	}
</script>

{#if onSuche}
	<button class="tf-ov-suche" onclick={onSuche}>
		<Icon name="suche" size={16} />
		<span>Suchen …</span>
	</button>
{/if}

<div class="tf-ov-karten">
	<button class="tf-ov-karte pins" onclick={() => onSelectSmart('pins')}>
		<Icon name="pin" />
		<span class="unten"><span class="name">Angepinnt</span><span class="zahl">{pinAnzahl}</span></span>
	</button>
	<button class="tf-ov-karte dringend" onclick={() => onSelectSmart('dringend')}>
		<Icon name="blitz" />
		<span class="unten"><span class="name">Dringend</span><span class="zahl">{dringendAnzahl}</span></span>
	</button>
</div>

<div class="tf-ov-kopf">
	<h2>Listen</h2>
	{#if !neueListeAuf}
		<button class="tf-ov-neu" onclick={() => (neueListeAuf = true)}>
			<Icon name="plus" size={16} />Neue Liste
		</button>
	{/if}
</div>

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
{/if}

{#each lists as list (list.id)}
	{@const ziel = questsZielFuer(list)}
	{#if ziel}
		<a class="tf-li quest" href={ziel} target="_blank" rel="noopener noreferrer" oncontextmenu={(e) => onListContext(e, list)}>
			<span class="em">{list.icon}</span>
			<span class="name">
				{list.title}
				<span class="sub">öffnet Familien-Quests</span>
			</span>
			<Icon name="extern" size={16} class="chev" />
		</a>
		{#if (offeneJeListe.get(list.id) ?? 0) > 0}
			<button class="tf-li alt" class:on={list.id === activeListId} onclick={() => onSelectList(list.id)}>
				<span class="name">Alte Aufgaben ansehen ({offeneJeListe.get(list.id)})</span>
			</button>
		{/if}
	{:else}
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
	{/if}
{/each}

<a class="tf-li" href={QUESTS_URL} target="_blank" rel="noopener noreferrer">
	<span class="em"><Icon name="extern" /></span>
	<span class="name">Familien-Quests <span class="tf-nur-sr">(öffnet in neuem Tab)</span></span>
</a>
{#if onToggleEinkaufQuests}
	<button class="tf-li" role="switch" aria-checked={einkaufInQuests} onclick={onToggleEinkaufQuests}>
		<span class="em"><Icon name={einkaufInQuests ? 'haken' : 'listen'} /></span>
		<span class="name">Einkaufen in Familien-Quests</span>
		<span class="n">{einkaufInQuests ? 'an' : 'aus'}</span>
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
	<a class="tf-ib gross" href="/app/benachrichtigungen" aria-label="Benachrichtigungen">
		<Icon name="glocke" />
	</a>
	<a class="tf-ib gross" href="/app/g2-koppeln" aria-label="G2 Brille koppeln">
		<Icon name="zahnrad" />
	</a>
	<button class="tf-ib gross" onclick={onLogout} aria-label="Abmelden" style="color:var(--danger)">
		<Icon name="abmelden" />
	</button>
</div>
