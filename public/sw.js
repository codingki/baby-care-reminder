const CACHE = "baby-care-shell-v3";
const PRECACHE = ["/offline.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/auth")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match("/offline.html");
        return cached || Response.error();
      }),
    );
    return;
  }

  event.respondWith(fetch(request).catch(() => caches.match(request)));
});

self.addEventListener("push", (event) => {
  const payload = readPush(event);
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data?.url || "/";
  const target = new URL(path, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windowClients) => {
      const existing = windowClients.find((client) => client.url.startsWith(self.location.origin));
      if (existing) {
        await existing.focus();
        if ("navigate" in existing && typeof existing.navigate === "function") {
          return existing.navigate(target);
        }
        return existing;
      }
      return self.clients.openWindow(target);
    }),
  );
});

function readPush(event) {
  const fallback = { title: "Baby Care", body: "", url: "/" };
  if (!event.data) return fallback;
  try {
    const parsed = event.data.json();
    return {
      title: typeof parsed.title === "string" ? parsed.title : fallback.title,
      body: typeof parsed.body === "string" ? parsed.body : "",
      url: typeof parsed.url === "string" ? parsed.url : "/",
    };
  } catch {
    return { ...fallback, body: event.data.text() };
  }
}
