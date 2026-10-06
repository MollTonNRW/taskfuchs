/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';
import { zielOeffnen } from '$lib/push/fenster';
import { leseNachricht, zielUrl } from '$lib/push/nachricht';

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `cache-${version}`;

const ASSETS = [
	...build, // the app itself
	...files  // everything in `static`
];

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(ASSETS))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then(async (keys) => {
			for (const key of keys) {
				if (key !== CACHE) await caches.delete(key);
			}
			sw.clients.claim();
		})
	);
});

sw.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return;

	const url = new URL(event.request.url);

	// Don't cache API calls, auth requests, or page navigations
	if (url.pathname.startsWith('/api') || url.hostname.includes('supabase')) return;

	// Never cache HTML page navigations — always go to network
	if (event.request.mode === 'navigate') return;

	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE);

			try {
				// Network first for everything
				const response = await fetch(event.request);
				if (response.status === 200) {
					cache.put(event.request, response.clone());
				}
				return response;
			} catch {
				// Network failed — try cache for static assets only
				const cachedResponse = await cache.match(event.request);
				if (cachedResponse) return cachedResponse;
				return new Response('Offline', { status: 503 });
			}
		})()
	);
});

// ---------------------------------------------------------------------------
// Push-Benachrichtigungen (Spec: Push-Benachrichtigungen für geteilte Listen)
// ---------------------------------------------------------------------------

// Jede Push-Nachricht MUSS eine sichtbare Meldung zeigen (`userVisibleOnly`),
// sonst blendet der Browser eine eigene Ersatzmeldung ein. Darum wirft dieser
// Handler nie: `leseNachricht` liefert bei kaputter Nutzlast einen Rückfalltext.
sw.addEventListener('push', (event) => {
	const n = leseNachricht(event.data?.text());
	// `renotify` verlangt ein `tag` — ohne wäre es ein TypeError. Als Variable statt
	// Literal, weil `renotify` in den DOM-Typen von TypeScript fehlt.
	const optionen = {
		body: n.text,
		tag: n.tag,
		renotify: Boolean(n.tag),
		icon: '/icons/icon-192x192.png',
		badge: '/icons/badge-96x96.png',
		data: { url: n.url }
	};
	event.waitUntil(sw.registration.showNotification(n.titel, optionen));
});

sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	// Nur die eigene Origin ist ein erlaubtes Ziel (`zielUrl` fällt sonst auf /app).
	const ziel = new URL(zielUrl(event.notification.data?.url, sw.location.origin), sw.location.origin).href;
	event.waitUntil(zielOeffnen(sw.clients, ziel, sw.location.origin));
});
