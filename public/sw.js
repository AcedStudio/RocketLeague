// RL Championship service worker: push notifications + an offline page for navigations.
const OFFLINE = "/offline.html";
const CACHE = "rlc-v1";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, "/icons.svg"])).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

// Network first for pages; the offline page only when the network is gone. Nothing else is cached.
self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return;
  e.respondWith(fetch(e.request).catch(() => caches.match(OFFLINE)));
});

self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { title: e.data ? e.data.text() : "RL Championship" }; }
  e.waitUntil(
    self.registration.showNotification(data.title || "RL Championship", {
      body: data.body || "",
      icon: "/api/app-icon/192",
      badge: "/api/app-icon/96",
      data: { url: data.url || "/me" },
      tag: data.url || undefined,
      renotify: !!data.url,
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if (c.url === url && "focus" in c) return c.focus();
      return self.clients.openWindow(url);
    }),
  );
});
