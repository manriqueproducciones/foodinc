// Service worker mínimo: guarda el "cascarón" de la app (HTML/CSS/JS propios)
// para que abra rápido y funcione con conexión inestable. Las llamadas a
// Firebase y a Gemini siempre van a la red — nunca se cachean, porque son
// datos en vivo.
const CACHE_NAME = "nutri-tracker-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./data/opciones.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const isOwnOrigin = url.origin === self.location.origin;
  if (!isOwnOrigin) return; // dejar pasar Firebase/Gemini/CDN directo a la red

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
