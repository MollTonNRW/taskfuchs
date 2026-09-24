<script lang="ts" module>
	import type { Eintrag, Eintragsart, Entwurf } from '$lib/utils/verlauf';
	import type { Mitnutzer } from '$lib/utils/mitnutzer';

	/**
	 * Was die Shell dem Verlauf einer Aufgabe mitgibt. Ein Objekt statt
	 * acht einzelner Props, weil `DetailSheet` alles an `TaskDetail`
	 * durchreicht — so waechst dort nur eine Zeile.
	 */
	export type VerlaufAnbindung = {
		/** Alle Eintraege der Aufgabe, neueste zuerst. */
		eintraege: Eintrag[];
		/** Ersteller, Listenbesitzer, Rolle owner/editor. Betrachter lesen nur. */
		darfSchreiben: boolean;
		/** Anzeigename, Initiale, Avatarfarbe zu einer Benutzer-ID — nie die ID selbst. */
		person: (id: string | null) => Mitnutzer;
		/**
		 * Angefangene Eingabe je Aufgabe — sie lebt im Store und ueberdauert
		 * damit das Schliessen von Detail und Sheet.
		 */
		leseEntwurf: (taskId: string) => Entwurf | null;
		merkeEntwurf: (taskId: string, e: Entwurf | null) => void;
		/** Neuer Eintrag; `false`, wenn er nicht gespeichert wurde. */
		onNeu: (art: Eintragsart, text: string) => Promise<boolean>;
		onAendern: (id: string, text: string) => void;
		onLoeschen: (id: string) => void;
		onIstDa: (id: string) => void;
		onIstDaZurueck: (id: string) => void;
	};
</script>

<script lang="ts">
	import { tick, untrack } from 'svelte';
	import Icon from './Icon.svelte';
	import { EINTRAG_MAX, kurzfassung } from '$lib/utils/verlauf';
	import { formatVerlaufZeit, formatZeitpunkt } from '$lib/utils/datum';

	/**
	 * Gruppe „Verlauf" im Aufgabendetail — direkt unter der Notiz.
	 * Spezifikation: docs/superpowers/specs/2026-09-24-aufgabenhistorie-design.md
	 *
	 * Oben die Eingabe (Segment „Stand | Wartet auf", mitwachsendes Feld,
	 * „Eintragen"), darunter die Eintraege, neueste zuerst. Die Historie ist
	 * optional: ohne Eintraege steht nur die Eingabe, kein Leer-Text, der zum
	 * Ausfuellen draengt. Wer nur lesen darf, sieht keine Eingabe und keine
	 * Aktionen — und ohne Eintraege gar nichts.
	 *
	 * Rechte „Alle alles": wer schreiben darf, darf JEDEN Eintrag bearbeiten,
	 * loeschen und „Ist da" setzen oder zuruecknehmen, nicht nur die eigenen.
	 */
	let {
		aufgabeId,
		sheet = false,
		eintraege,
		darfSchreiben,
		person,
		leseEntwurf,
		merkeEntwurf,
		onNeu,
		onAendern,
		onLoeschen,
		onIstDa,
		onIstDaZurueck
	}: { aufgabeId: string; sheet?: boolean } & VerlaufAnbindung = $props();

	const uid = $props.id();

	const ARTEN: { wert: Eintragsart; label: string; platzhalter: string }[] = [
		{ wert: 'stand', label: 'Stand', platzhalter: 'Was ist passiert?' },
		{ wert: 'wartet', label: 'Wartet auf', platzhalter: 'Worauf wartet ihr?' }
	];

	// ==================================================================
	// RELATIVE ZEITEN — „gerade eben" soll nicht stehen bleiben
	// ==================================================================
	let jetztMs = $state(Date.now());
	$effect(() => {
		const uhr = setInterval(() => (jetztMs = Date.now()), 30_000);
		return () => clearInterval(uhr);
	});

	// ==================================================================
	// EINGABE
	// ==================================================================
	let art = $state<Eintragsart>('stand');
	let entwurf = $state('');
	let feld = $state<HTMLTextAreaElement | undefined>(undefined);
	let platzhalter = $derived(ARTEN.find((a) => a.wert === art)?.platzhalter ?? '');

	/**
	 * Angefangene Eingaben je Aufgabe liegen im Store (`leseEntwurf` /
	 * `merkeEntwurf`), nicht hier: diese Gruppe verschwindet, sobald Detail
	 * oder Sheet schliessen — am Handy bei jedem Aufgabenwechsel — und ein
	 * Merkzettel in der Komponente ginge mit ihr verloren. Die Detailspalte
	 * am Desktop bleibt beim Wechsel der Auswahl dagegen stehen (kein
	 * {#key}); dann tauscht dieser Effekt den Entwurf aus, damit nichts an
	 * der falschen Aufgabe landet.
	 */
	let entwurfFuer = '';

	$effect(() => {
		const id = aufgabeId;
		untrack(() => {
			if (entwurfFuer === id) return;
			const gemerkt = leseEntwurf(id);
			art = gemerkt?.art ?? 'stand';
			entwurf = gemerkt?.text ?? '';
			bearbeitetId = null;
			entwurfFuer = id;
		});
	});

	// Jede Aenderung gleich merken — so gibt es keinen Abschiedsmoment, den
	// ein schliessendes Sheet verpassen koennte.
	$effect(() => {
		const text = entwurf;
		const gewaehlt = art;
		untrack(() => {
			if (entwurfFuer) merkeEntwurf(entwurfFuer, { art: gewaehlt, text });
		});
	});

	/** Felder wachsen mit dem Inhalt (wie die Notiz); die Mindesthoehe kommt aus dem CSS. */
	function anpassen(el: HTMLTextAreaElement | undefined) {
		if (!el) return;
		el.style.height = 'auto';
		el.style.height = `${el.scrollHeight}px`;
	}
	$effect(() => {
		void entwurf;
		anpassen(feld);
	});

	async function senden() {
		const text = entwurf.trim();
		if (!text || !darfSchreiben) return;
		const fuer = aufgabeId;
		const gewaehlt = art;
		// Sofort leeren, der Fokus bleibt im Feld: der naechste Eintrag kann
		// gleich folgen. Die Art springt auf „Stand" zurueck — ein Warte-
		// Eintrag ist die Ausnahme und soll nicht aus Versehen entstehen.
		entwurf = '';
		art = 'stand';
		const ok = await onNeu(gewaehlt, text);
		// Nicht gespeichert: der Text wartet als Entwurf seiner Aufgabe —
		// auch wenn inzwischen eine andere offen steht oder das Sheet zu ist
		// —, es sei denn, dort wurde schon Neues angefangen. Steht dieselbe
		// Aufgabe noch offen und ist das Feld leer, kommt er gleich zurueck.
		if (ok) return;
		if (!leseEntwurf(fuer)) merkeEntwurf(fuer, { art: gewaehlt, text });
		if (entwurfFuer === fuer && entwurf === '') {
			entwurf = text;
			art = gewaehlt;
		}
	}

	function eingabeTaste(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
			e.preventDefault();
			void senden();
			return;
		}
		if (e.key === 'Escape') {
			// Escape verlaesst nur das Feld; der Entwurf bleibt. Ohne
			// stopPropagation schloesse die Seite gleich das ganze Detail.
			e.stopPropagation();
			feld?.blur();
		}
	}

	/**
	 * Segment als Radiogruppe: Pfeiltasten wechseln die Art. stopPropagation,
	 * sonst wechselte die Seite mit ←/→ zugleich die Liste.
	 */
	function segTaste(e: KeyboardEvent) {
		if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
		e.preventDefault();
		e.stopPropagation();
		const i = ARTEN.findIndex((a) => a.wert === art);
		const schritt = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
		const n = (i + schritt + ARTEN.length) % ARTEN.length;
		art = ARTEN[n].wert;
		const gruppe = (e.currentTarget as HTMLElement).closest('[role="radiogroup"]');
		gruppe?.querySelectorAll<HTMLElement>('[role="radio"]')[n]?.focus();
	}

	/**
	 * Ein Druck auf „Eintragen" soll dem Feld den Fokus nicht nehmen — am
	 * Handy klappte sonst die Tastatur zu und gleich wieder auf.
	 */
	function fokusHalten(e: MouseEvent) {
		e.preventDefault();
	}

	// ==================================================================
	// BEARBEITEN — an Ort und Stelle
	// ==================================================================
	let bearbeitetId = $state<string | null>(null);
	let bearbeitetText = $state('');
	let bearbeitetFeld = $state<HTMLTextAreaElement | undefined>(undefined);

	$effect(() => {
		void bearbeitetText;
		anpassen(bearbeitetFeld);
	});

	async function bearbeiten(e: Eintrag) {
		bearbeitetId = e.id;
		bearbeitetText = e.body;
		await tick();
		bearbeitetFeld?.focus();
		const ende = bearbeitetText.length;
		bearbeitetFeld?.setSelectionRange(ende, ende);
	}

	/**
	 * Leer oder unveraendert: nichts schreiben, nur schliessen.
	 * `zurueck`: per Tastatur ausgeloest — der Fokus geht an „Bearbeiten"
	 * desselben Eintrags zurueck, statt mit dem Feld auf <body> zu fallen.
	 */
	function sichern(zurueck = false) {
		const id = bearbeitetId;
		if (!id) return;
		bearbeitetId = null;
		const text = bearbeitetText.trim();
		const alt = eintraege.find((x) => x.id === id);
		if (text && alt && text !== alt.body) onAendern(id, text);
		if (zurueck) void fokusAufEintrag(id, '.akt.bearb-knopf');
	}

	function abbrechen(zurueck = false) {
		const id = bearbeitetId;
		bearbeitetId = null;
		if (zurueck && id) void fokusAufEintrag(id, '.akt.bearb-knopf');
	}

	function bearbeitetTaste(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
			e.preventDefault();
			sichern(true);
			return;
		}
		if (e.key === 'Escape') {
			e.stopPropagation();
			abbrechen(true);
		}
	}

	/**
	 * Verlaesst der Fokus die Bearbeitung (Feld samt „Sichern"/„Abbrechen"),
	 * wird gesichert — wie bei der Notiz. Ein Tab vom Feld zu den Knoepfen
	 * bleibt darin und sichert NICHT. Vorher hing das Sichern am `blur` des
	 * Feldes: schon dieser Tab speicherte, und beide Knoepfe verschwanden,
	 * bevor sie den Fokus bekamen. Die Maus erreicht sie weiter ueber
	 * `fokusHalten`, ohne dass das Feld den Fokus verliert.
	 */
	function bearbeitungVerlassen(e: FocusEvent) {
		const wohin = e.relatedTarget;
		if (wohin instanceof Node && (e.currentTarget as HTMLElement).contains(wohin)) return;
		sichern();
	}

	// ==================================================================
	// FOKUS NACH AKTIONEN
	// ==================================================================
	// Jede Aktion entfernt genau den Knopf, der sie ausgeloest hat: „Ist da"
	// wird zur Geloest-Zeile, „Zuruecknehmen" wieder zu „Ist da", „Loeschen"
	// nimmt seinen Eintrag mit. Ohne Nachhilfe fiele der Tastaturfokus auf
	// <body>, und ein Screenreader verloere die Stelle.
	let liste = $state<HTMLOListElement | undefined>(undefined);

	/**
	 * Den Fokus nur weiterreichen, wenn der Knopf ihn hatte oder per
	 * Tastatur ausgeloest wurde (ein Klick ueber Enter/Leertaste traegt
	 * `detail === 0`). Ein Tipper am Handy fokussiert in Safari nichts —
	 * dort bleibt es, wie es war.
	 */
	function fokusWeiter(e: MouseEvent): boolean {
		return e.detail === 0 || document.activeElement === e.currentTarget;
	}

	async function fokusAufEintrag(id: string, auswahl: string): Promise<boolean> {
		await tick();
		const ziel = liste?.querySelector<HTMLElement>(`[data-tf-eintrag="${CSS.escape(id)}"] ${auswahl}`);
		ziel?.focus();
		return !!ziel;
	}

	function istDa(e: MouseEvent, id: string) {
		const weiter = fokusWeiter(e);
		onIstDa(id);
		if (weiter) void fokusAufEintrag(id, '.zurueck');
	}

	function istDaZurueck(e: MouseEvent, id: string) {
		const weiter = fokusWeiter(e);
		onIstDaZurueck(id);
		if (weiter) void fokusAufEintrag(id, '.istda');
	}

	/**
	 * Nach dem Loeschen auf den naechsten Eintrag, sonst den vorigen. Ist
	 * keiner mehr da, ins Eingabefeld — das aber nur per Tastatur: am Handy
	 * klappte sonst ungefragt die Bildschirmtastatur auf.
	 */
	async function loeschen(e: MouseEvent, id: string) {
		const weiter = fokusWeiter(e);
		const perTastatur = e.detail === 0;
		const i = eintraege.findIndex((x) => x.id === id);
		const nachbar = eintraege[i + 1] ?? eintraege[i - 1];
		onLoeschen(id);
		if (!weiter) return;
		if (nachbar && (await fokusAufEintrag(nachbar.id, '.akt.bearb-knopf'))) return;
		if (perTastatur) feld?.focus();
	}

	function bearbeitetHinweis(e: Eintrag): string {
		const wer = person(e.edited_by).name;
		const wann = formatZeitpunkt(e.edited_at);
		return wann ? `bearbeitet von ${wer} · ${wann}` : `bearbeitet von ${wer}`;
	}

	let sichtbar = $derived(darfSchreiben || eintraege.length > 0);
</script>

{#if sichtbar}
	<div class="tf-grp tf-verlauf" class:tight={sheet}>
		<div class="tf-lbl" id="{uid}-titel">Verlauf</div>

		{#if darfSchreiben}
			<form
				class="tf-hist-neu"
				onsubmit={(e) => {
					e.preventDefault();
					void senden();
				}}
			>
				<div class="tf-seg klein" role="radiogroup" aria-label="Art des Eintrags">
					{#each ARTEN as a (a.wert)}
						<button
							type="button"
							role="radio"
							aria-checked={art === a.wert}
							tabindex={art === a.wert ? 0 : -1}
							class="tf-segopt"
							class:on={art === a.wert}
							onclick={() => (art = a.wert)}
							onkeydown={segTaste}
						>
							{#if a.wert === 'wartet'}<Icon name="sanduhr" size={14} />{/if}{a.label}
						</button>
					{/each}
				</div>
				<div class="zeile">
					<textarea
						bind:this={feld}
						bind:value={entwurf}
						class="tf-hist-feld"
						rows="1"
						maxlength={EINTRAG_MAX}
						placeholder={platzhalter}
						aria-label={platzhalter}
						enterkeyhint="send"
						onkeydown={eingabeTaste}
					></textarea>
					<button type="submit" class="tf-btn primary" disabled={!entwurf.trim()} onmousedown={fokusHalten}>
						Eintragen
					</button>
				</div>
			</form>
		{/if}

		{#if eintraege.length > 0}
			<ol class="tf-hist-liste" aria-labelledby="{uid}-titel" bind:this={liste}>
				{#each eintraege as e (e.id)}
					{@const autor = person(e.created_by)}
					{@const wartet = e.kind === 'wartet'}
					{@const geloest = wartet && !!e.resolved_at}
					{@const kurz = kurzfassung(e.body)}
					<li class="tf-hist" class:wartet class:geloest data-tf-eintrag={e.id}>
						<span class="tf-avatar" style="background:{autor.farbe}" aria-hidden="true">{autor.initialen}</span>
						<div class="inhalt">
							<div class="kopf">
								<span class="wer">{autor.name}</span>
								<span class="wann" title={formatZeitpunkt(e.created_at)}>
									{formatVerlaufZeit(e.created_at, jetztMs)}
								</span>
								{#if e.edited_at}
									<span class="bearb" title={bearbeitetHinweis(e)}>(bearbeitet)</span>
								{/if}
								{#if darfSchreiben && bearbeitetId !== e.id}
									<span class="akts">
										<button
											class="akt bearb-knopf"
											aria-label="Eintrag bearbeiten: {kurz}"
											onclick={() => bearbeiten(e)}
										>
											<Icon name="umbenennen" size={16} />
										</button>
										<button
											class="akt loe"
											aria-label="Eintrag l&ouml;schen: {kurz}"
											onclick={(ev) => loeschen(ev, e.id)}
										>
											<Icon name="loeschen" size={16} />
										</button>
									</span>
								{/if}
							</div>

							{#if bearbeitetId === e.id}
								<div class="bearbeitung" onfocusout={bearbeitungVerlassen}>
									<textarea
										bind:this={bearbeitetFeld}
										bind:value={bearbeitetText}
										class="tf-hist-feld"
										rows="1"
										maxlength={EINTRAG_MAX}
										aria-label="Eintrag bearbeiten"
										enterkeyhint="done"
										onkeydown={bearbeitetTaste}
									></textarea>
									<div class="bearb-akts">
										<button
											class="tf-btn primary"
											onmousedown={fokusHalten}
											onclick={(ev) => sichern(fokusWeiter(ev))}
										>
											Sichern
										</button>
										<button
											class="tf-btn ghost"
											onmousedown={fokusHalten}
											onclick={(ev) => abbrechen(fokusWeiter(ev))}
										>
											Abbrechen
										</button>
									</div>
								</div>
							{:else}
								<p class="txt">{#if wartet}<Icon name="sanduhr" size={14} class="uhr" /><span class="praefix">Wartet auf&nbsp;</span>{/if}{e.body}</p>
							{/if}

							{#if wartet && !geloest && darfSchreiben}
								<button class="tf-btn istda" aria-label="Ist da: {kurz}" onclick={(ev) => istDa(ev, e.id)}>
									<Icon name="haken" size={16} />Ist da
								</button>
							{:else if geloest}
								{@const loeser = person(e.resolved_by)}
								<div class="geloest-zeile">
									<Icon name="haken" size={14} />
									<span>
										Ist da &middot; {loeser.name} &middot;
										<span title={formatZeitpunkt(e.resolved_at)}>{formatVerlaufZeit(e.resolved_at, jetztMs)}</span>
									</span>
									{#if darfSchreiben}
										<button
											class="zurueck"
											aria-label="&bdquo;Ist da&ldquo; zur&uuml;cknehmen: {kurz}"
											onclick={(ev) => istDaZurueck(ev, e.id)}
										>
											Zur&uuml;cknehmen
										</button>
									{/if}
								</div>
							{/if}
						</div>
					</li>
				{/each}
			</ol>
		{/if}
	</div>
{/if}
