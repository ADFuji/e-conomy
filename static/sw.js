// Service worker minimal : cache d'exécution pour un usage hors-ligne basique.
// Stratégie : network-first pour la navigation (toujours la dernière version si en
// ligne), cache-first pour les assets statiques (JS/CSS/images déjà vus).

const CACHE = 'econ-cache-v1';

self.addEventListener('install', (event) => {
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', (event) => {
	const req = event.request;
	if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;

	if (req.mode === 'navigate') {
		event.respondWith(
			fetch(req)
				.then((res) => {
					caches.open(CACHE).then((c) => c.put(req, res.clone()));
					return res;
				})
				.catch(() => caches.match(req).then((cached) => cached || caches.match('/')))
		);
		return;
	}

	event.respondWith(
		caches.match(req).then(
			(cached) =>
				cached ||
				fetch(req).then((res) => {
					if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
					return res;
				})
		)
	);
});
