import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import type { SupabaseClient } from '@supabase/supabase-js';

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

const PRIORITY_COLORS: Record<string, string> = {
	low: '2', // Sage/Green
	normal: '5', // Banana/Yellow
	high: '11', // Tomato/Red
	asap: '4' // Flamingo/Pink
};

interface SyncTask {
	id: string;
	text: string;
	due_date?: string | null;
	note?: string | null;
	priority?: string | null;
	calendar_event_id?: string | null;
}

interface SyncRequest {
	action: 'create' | 'update' | 'delete';
	task: SyncTask;
}

interface GoogleTokens {
	access_token: string;
	refresh_token: string;
	expires_at: string;
	reminder_minutes: number;
}

// Supabase Client ohne strenge Typisierung fuer noch nicht migrierte Tabellen/Spalten
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedSupabase = SupabaseClient<any, 'public', any>;

async function getGoogleTokens(
	supabase: UntypedSupabase,
	userId: string
): Promise<GoogleTokens | null> {
	const { data, error } = await supabase
		.from('user_google_tokens')
		.select('access_token, refresh_token, expires_at, reminder_minutes')
		.eq('user_id', userId)
		.single();

	if (error || !data) return null;
	return data as GoogleTokens;
}

async function refreshAccessToken(
	supabase: UntypedSupabase,
	userId: string,
	refreshToken: string
): Promise<string | null> {
	const clientId = env.GOOGLE_CLIENT_ID;
	const clientSecret = env.GOOGLE_CLIENT_SECRET;

	if (!clientId || !clientSecret) return null;

	const params = new URLSearchParams({
		grant_type: 'refresh_token',
		refresh_token: refreshToken,
		client_id: clientId,
		client_secret: clientSecret
	});

	const res = await fetch(TOKEN_ENDPOINT, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: params.toString()
	});

	if (!res.ok) return null;

	const data = await res.json();
	const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

	await supabase
		.from('user_google_tokens')
		.update({
			access_token: data.access_token,
			expires_at: expiresAt
		})
		.eq('user_id', userId);

	return data.access_token as string;
}

async function getValidTokens(
	supabase: UntypedSupabase,
	userId: string
): Promise<{ accessToken: string; reminderMinutes: number } | null> {
	const tokens = await getGoogleTokens(supabase, userId);
	if (!tokens) return null;

	const isExpired = new Date(tokens.expires_at) <= new Date();
	const accessToken = isExpired
		? await refreshAccessToken(supabase, userId, tokens.refresh_token)
		: tokens.access_token;

	if (!accessToken) return null;
	return { accessToken, reminderMinutes: tokens.reminder_minutes ?? 30 };
}

function buildEventBody(task: SyncTask, reminderMinutes: number) {
	const body: Record<string, unknown> = {
		summary: task.text,
		description: task.note || ''
	};

	if (task.priority && PRIORITY_COLORS[task.priority]) {
		body.colorId = PRIORITY_COLORS[task.priority];
	}

	if (task.due_date) {
		const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(task.due_date);

		if (isDateOnly) {
			// Ganztaegiges Event: end = naechster Tag
			const endDate = new Date(task.due_date + 'T00:00:00');
			endDate.setDate(endDate.getDate() + 1);
			const endStr = endDate.toISOString().split('T')[0];

			body.start = { date: task.due_date };
			body.end = { date: endStr };
		} else {
			// Event mit Uhrzeit: 1 Stunde Dauer
			const startDate = new Date(task.due_date);
			const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);

			body.start = { dateTime: startDate.toISOString(), timeZone: 'Europe/Berlin' };
			body.end = { dateTime: endDate.toISOString(), timeZone: 'Europe/Berlin' };
		}
	} else {
		// Kein Datum: heute als ganztaegiges Event
		const today = new Date().toISOString().split('T')[0];
		const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
		body.start = { date: today };
		body.end = { date: tomorrow };
	}

	if (reminderMinutes > 0) {
		body.reminders = {
			useDefault: false,
			overrides: [{ method: 'popup', minutes: reminderMinutes }]
		};
	} else {
		body.reminders = {
			useDefault: false,
			overrides: []
		};
	}

	return body;
}

async function createEvent(
	accessToken: string,
	task: SyncTask,
	supabase: UntypedSupabase,
	reminderMinutes: number
): Promise<Response> {
	const eventBody = buildEventBody(task, reminderMinutes);

	const res = await fetch(CALENDAR_API, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(eventBody)
	});

	if (!res.ok) {
		const err = await res.json();
		return json({ error: 'Google Calendar Fehler', details: err }, { status: res.status });
	}

	const event = await res.json();

	// calendar_event_id in tasks-Tabelle speichern
	await supabase
		.from('tasks')
		.update({ calendar_event_id: event.id })
		.eq('id', task.id);

	return json({ success: true, calendar_event_id: event.id });
}

async function updateEvent(accessToken: string, task: SyncTask, reminderMinutes: number): Promise<Response> {
	if (!task.calendar_event_id) {
		return json({ error: 'Kein calendar_event_id vorhanden' }, { status: 400 });
	}

	const eventBody = buildEventBody(task, reminderMinutes);

	const res = await fetch(`${CALENDAR_API}/${task.calendar_event_id}`, {
		method: 'PATCH',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(eventBody)
	});

	if (!res.ok) {
		const err = await res.json();
		return json({ error: 'Google Calendar Fehler', details: err }, { status: res.status });
	}

	return json({ success: true });
}

async function deleteEvent(
	accessToken: string,
	task: SyncTask,
	supabase: UntypedSupabase
): Promise<Response> {
	if (!task.calendar_event_id) {
		return json({ error: 'Kein calendar_event_id vorhanden' }, { status: 400 });
	}

	const res = await fetch(`${CALENDAR_API}/${task.calendar_event_id}`, {
		method: 'DELETE',
		headers: {
			Authorization: `Bearer ${accessToken}`
		}
	});

	// Google gibt 204 bei Erfolg zurueck
	if (!res.ok && res.status !== 204) {
		const err = await res.json();
		return json({ error: 'Google Calendar Fehler', details: err }, { status: res.status });
	}

	// calendar_event_id auf null setzen
	await supabase
		.from('tasks')
		.update({ calendar_event_id: null })
		.eq('id', task.id);

	return json({ success: true });
}

export const POST: RequestHandler = async ({ request, locals }) => {
	// Auth Guard
	const { session, user } = await locals.safeGetSession();
	if (!session || !user) {
		return json({ error: 'Nicht eingeloggt' }, { status: 401 });
	}

	// Request Body parsen
	let body: SyncRequest;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Ungültiger Request Body' }, { status: 400 });
	}

	const { action, task } = body;

	if (!action || !task?.id || !task?.text) {
		return json({ error: 'action und task (id, text) sind erforderlich' }, { status: 400 });
	}

	if (!['create', 'update', 'delete'].includes(action)) {
		return json({ error: 'Ungültige action. Erlaubt: create, update, delete' }, { status: 400 });
	}

	// Google Access Token holen
	const supabase = locals.supabase as unknown as UntypedSupabase;
	const validTokens = await getValidTokens(supabase, user.id);
	if (!validTokens) {
		return json({ error: 'Calendar nicht verbunden' }, { status: 401 });
	}

	const { accessToken, reminderMinutes } = validTokens;

	// Action ausfuehren
	switch (action) {
		case 'create':
			return createEvent(accessToken, task, supabase, reminderMinutes);
		case 'update':
			return updateEvent(accessToken, task, reminderMinutes);
		case 'delete':
			return deleteEvent(accessToken, task, supabase);
	}
};
