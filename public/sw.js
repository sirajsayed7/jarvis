const CACHE = "jarvis-local-v23";
const ASSETS = ["/", "/index.html", "/styles.css", "/auth.css", "/polish.css", "/windows.css", "/productivity.css", "/hud.css", "/supabase.js", "/remote.js", "/app.js", "/local-voice.js", "/operations.js", "/productivity.js", "/hud.js", "/vision.js", "/manifest.json", "/jarvis.svg"];
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("jarvis-local-") && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET" || new URL(event.request.url).pathname.startsWith("/api/")) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok && response.type === "basic") {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy)));
    }
    return response;
  }).catch(() => caches.match(event.request)));
});
self.addEventListener("notificationclick", event => { event.notification.close(); event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => clients[0] ? clients[0].focus() : self.clients.openWindow("/"))); });
