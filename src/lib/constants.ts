// Gemeinsame Konstanten von TaskFuchs.
//
// Das hier ist der EINZIGE Labelsatz der App (Spezifikation Abschnitt 6:
// „Genau ein Labelsatz: Low · Normal · High · ASAP"). Kontextmenue und
// Aufgabendetail lesen beide von hier.
//
// Farben stehen NICHT hier, sondern ausschliesslich als Token in src/tf.css.
// Die frueheren `priorityColors` (ASAP #dc2626 statt Token #991B1B),
// `priorityBadgeBg` und `progressColors` waren eine zweite, abweichende
// Farbquelle ohne Leser und sind entfallen — genau wie die `progress*`-Label,
// deren Feld mit dem Rueckbau der Fortschrittsanzeige weggefallen ist.

export type Priority = 'low' | 'normal' | 'high' | 'asap';
export type Timeframe = 'akut' | 'zeitnah' | 'mittelfristig' | 'langfristig';

export const priorityLabels: Record<string, string> = {
	low: 'Low',
	normal: 'Normal',
	high: 'High',
	asap: 'ASAP'
};

export const priorityWeight: Record<string, number> = {
	asap: 0,
	high: 1,
	normal: 2,
	low: 3
};

export const priorityOrder: Priority[] = ['low', 'normal', 'high', 'asap'];

export const timeframeLabels: Record<string, string> = {
	akut: 'Akut',
	zeitnah: 'Zeitnah',
	mittelfristig: 'Mittelfristig',
	langfristig: 'Langfristig'
};

export const timeframeOrder: Timeframe[] = ['akut', 'zeitnah', 'mittelfristig', 'langfristig'];
