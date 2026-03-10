/**
 * Demo-Daten aus dem Prototype — werden eingefügt wenn der User noch keine Listen hat.
 * Struktur: Listen mit Tasks, Subtasks, Dividers — identisch zum Prototype.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';

type ListInsert = Database['public']['Tables']['lists']['Insert'];
type TaskInsert = Database['public']['Tables']['tasks']['Insert'];

interface SeedSubtask {
	text: string;
	done: boolean;
	subtasks?: SeedSubtask[];
}

interface SeedTask {
	text: string;
	type?: 'task' | 'divider';
	divider_label?: string;
	priority?: 'low' | 'normal' | 'high' | 'asap';
	timeframe?: 'akut' | 'zeitnah' | 'mittelfristig' | 'langfristig' | null;
	highlighted?: boolean;
	done?: boolean;
	pinned?: boolean;
	note?: string | null;
	emoji?: string | null;
	due_date?: string | null;
	progress?: number;
	subtasks?: SeedSubtask[];
}

interface SeedList {
	title: string;
	icon: string;
	position: number;
	tasks: SeedTask[];
}

const SEED_LISTS: SeedList[] = [
	{
		title: 'Homelab',
		icon: '🖥️',
		position: 0,
		tasks: [
			{
				text: 'Pi-hole Update durchführen',
				priority: 'high',
				timeframe: 'akut',
				note: 'Vorher unbedingt Backup machen! Letzte Version hatte Probleme mit Custom DNS.',
				due_date: '2026-03-15',
				subtasks: [
					{
						text: 'Backup der Config erstellen',
						done: false,
						subtasks: [
							{ text: 'pihole -a -t erstellen', done: false },
							{ text: 'Config auf NAS kopieren', done: false }
						]
					},
					{ text: 'pihole -up ausführen', done: false },
					{ text: 'DNS Resolution testen', done: false }
				]
			},
			{
				type: 'divider',
				text: 'Infrastruktur',
				divider_label: 'Infrastruktur'
			},
			{
				text: 'n8n Workflows aufräumen',
				priority: 'normal',
				timeframe: 'mittelfristig',
				note: 'Mindestens 5 inaktive Workflows gefunden beim letzten Check.',
				progress: 1,
				subtasks: [
					{ text: 'Inaktive Workflows identifizieren', done: false },
					{ text: 'Error-Workflows prüfen', done: false }
				]
			},
			{
				text: 'NAS Backup-Strategie überprüfen',
				priority: 'normal',
				timeframe: 'langfristig'
			},
			{
				text: 'SSL-Zertifikate erneuern',
				priority: 'asap',
				timeframe: 'akut',
				highlighted: true,
				pinned: true,
				note: 'Läuft am 20.03. ab! Cloudflare Tunnel checken.',
				emoji: '🔒',
				due_date: '2026-03-20',
				progress: 2,
				subtasks: [
					{ text: 'Ablaufdatum prüfen', done: false },
					{ text: 'Cloudflare Tunnel config checken', done: false }
				]
			},
			{
				text: 'Home Assistant Automations dokumentieren und alle Szenarien beschreiben die im täglichen Betrieb wichtig sind',
				priority: 'low',
				timeframe: 'langfristig'
			}
		]
	},
	{
		title: 'Privat',
		icon: '🏠',
		position: 1,
		tasks: [
			{
				text: 'Steuererklärung vorbereiten',
				priority: 'high',
				timeframe: 'akut',
				pinned: true,
				note: 'Frist: 31.07.2026. Steuerberater Müller hat neue Nummer.',
				emoji: '📋',
				due_date: '2026-07-31',
				progress: 1,
				subtasks: [
					{ text: 'Belege sortieren', done: false },
					{ text: 'ELSTER Login testen', done: false },
					{ text: 'Steuerberater kontaktieren', done: false }
				]
			},
			{
				text: 'Wohnung aufräumen',
				priority: 'normal',
				timeframe: 'mittelfristig',
				subtasks: [
					{ text: 'Kleiderschrank ausmisten', done: false },
					{ text: 'Keller sortieren', done: false }
				]
			},
			{
				type: 'divider',
				text: 'Gesundheit',
				divider_label: 'Gesundheit'
			},
			{
				text: 'Zahnarzt-Termin vereinbaren',
				priority: 'normal',
				timeframe: 'mittelfristig',
				note: 'Dr. Schmidt, Tel: 0221/123456',
				emoji: '🦷'
			},
			{
				text: 'Sport-Abo kündigen',
				priority: 'asap',
				timeframe: 'akut',
				note: 'Kündigungsfrist: 1 Monat zum Quartalsende!',
				due_date: '2026-03-31'
			},
			{
				text: 'Bücher zurückgeben (Bibliothek)',
				priority: 'low',
				timeframe: 'mittelfristig'
			}
		]
	},
	{
		title: 'Arbeit',
		icon: '💼',
		position: 2,
		tasks: [
			{
				text: 'Kundenpräsentation erstellen',
				priority: 'asap',
				timeframe: 'akut',
				highlighted: true,
				pinned: true,
				note: 'Kunde: Warmwelt GmbH. Meeting am Freitag 14 Uhr.',
				emoji: '🎯',
				due_date: '2026-03-14',
				progress: 2,
				subtasks: [
					{
						text: 'Daten aufbereiten',
						done: false,
						subtasks: [
							{ text: 'Q4-Zahlen exportieren', done: false },
							{ text: 'Grafiken erstellen', done: false }
						]
					},
					{ text: 'Slides designen', done: false },
					{ text: 'Review mit Team', done: false }
				]
			},
			{
				text: 'Meeting-Notizen zusammenfassen',
				priority: 'normal',
				timeframe: 'akut'
			},
			{
				type: 'divider',
				text: 'Projekte',
				divider_label: 'Projekte'
			},
			{
				text: 'TaskFuchs MVP planen',
				priority: 'high',
				timeframe: 'mittelfristig',
				note: 'Tech-Stack: Supabase + SvelteKit + Tailwind. Prototyp fertig!',
				emoji: '🦊',
				progress: 1,
				subtasks: [
					{ text: 'Tech-Stack festlegen', done: true },
					{ text: 'UI-Prototyp erstellen', done: false },
					{ text: 'Supabase Projekt aufsetzen', done: false }
				]
			},
			{
				text: 'Code Review für PR #42',
				priority: 'normal',
				timeframe: 'mittelfristig'
			},
			{
				text: 'Dokumentation aktualisieren',
				priority: 'low',
				timeframe: 'langfristig'
			}
		]
	}
];

/**
 * Fügt Demo-Daten ein.
 * force=false: Nur wenn keine Listen existieren.
 * force=true: Immer einfügen (zu bestehenden Listen hinzufügen).
 */
export async function seedDemoData(
	supabase: SupabaseClient<Database>,
	userId: string,
	force = false
): Promise<boolean> {
	if (!force) {
		const { data: existingLists } = await supabase
			.from('lists')
			.select('id')
			.eq('user_id', userId)
			.limit(1);

		if (existingLists && existingLists.length > 0) return false;
	}

	// Bestehende Positionen ermitteln für force-Modus
	let positionOffset = 0;
	if (force) {
		const { data: existing } = await supabase
			.from('lists')
			.select('position')
			.eq('user_id', userId)
			.order('position', { ascending: false })
			.limit(1);
		if (existing && existing.length > 0) positionOffset = existing[0].position + 1;
	}

	for (const seedList of SEED_LISTS) {
		// Liste erstellen
		const { data: newList, error: listErr } = await supabase
			.from('lists')
			.insert({
				user_id: userId,
				title: seedList.title,
				icon: seedList.icon,
				position: seedList.position + positionOffset
			} as ListInsert)
			.select()
			.single();

		if (listErr || !newList) continue;

		// Tasks erstellen
		for (let i = 0; i < seedList.tasks.length; i++) {
			const seedTask = seedList.tasks[i];
			const taskInsert: TaskInsert = {
				list_id: newList.id,
				user_id: userId,
				text: seedTask.text,
				type: seedTask.type || 'task',
				divider_label: seedTask.divider_label || null,
				done: seedTask.done || false,
				priority: seedTask.priority || 'normal',
				timeframe: seedTask.timeframe || null,
				highlighted: seedTask.highlighted || false,
				pinned: seedTask.pinned || false,
				emoji: seedTask.emoji || null,
				note: seedTask.note || null,
				due_date: seedTask.due_date || null,
				progress: seedTask.progress || 0,
				position: i
			};

			const { data: newTask, error: taskErr } = await supabase
				.from('tasks')
				.insert(taskInsert)
				.select()
				.single();

			if (taskErr || !newTask || !seedTask.subtasks) continue;

			// Subtasks erstellen (Level 1)
			for (let j = 0; j < seedTask.subtasks.length; j++) {
				const sub = seedTask.subtasks[j];
				const { data: newSub } = await supabase
					.from('tasks')
					.insert({
						list_id: newList.id,
						user_id: userId,
						parent_id: newTask.id,
						text: sub.text,
						done: sub.done,
						position: j
					} as TaskInsert)
					.select()
					.single();

				// Sub-Subtasks (Level 2)
				if (newSub && sub.subtasks) {
					for (let k = 0; k < sub.subtasks.length; k++) {
						const subsub = sub.subtasks[k];
						await supabase.from('tasks').insert({
							list_id: newList.id,
							user_id: userId,
							parent_id: newSub.id,
							text: subsub.text,
							done: subsub.done,
							position: k
						} as TaskInsert);
					}
				}
			}
		}
	}

	return true;
}
