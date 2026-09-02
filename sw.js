/* ============================================================
   TAF — service worker · by Majin

   Stratégie : le réseau d'abord pour tout le code, le cache
   seulement en secours. Une version déployée s'applique donc
   immédiatement, sans vider quoi que ce soit à la main, tout
   en gardant l'application utilisable hors ligne.
   ============================================================ */
const CACHE = "taf-majin-v13";

/* Ressources figées : elles ne changent qu'en cas de refonte visuelle. */
const STATIC = [
  "./manifest.webmanifest", "./favicon.svg",
  "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png"
];

/* Code de l'application : toujours redemandé au réseau. */
const CODE = ["./", "./index.html", "./styles.css", "./app.js", "./intro.js"];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll([...STATIC, ...CODE]))
      .then(() => self.skipWaiting())      // la nouvelle version prend la main aussitôt
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())    // et contrôle les onglets déjà ouverts
  );
});

const isCode = path =>
  path === "/" ||
  path.endsWith("/") ||
  path.endsWith(".html") ||
  path.endsWith(".js") ||
  path.endsWith(".css");

self.addEventListener("fetch", e => {
  const req = e.request;
  const u = new URL(req.url);

  if (req.method !== "GET" || u.origin !== location.origin) return;
  if (u.pathname.startsWith("/api/")) return;              // jamais de cache sur l'API

  /* ── Code : réseau d'abord ──
     On récupère la version en ligne, on rafraîchit le cache au passage,
     et on ne retombe sur le cache que si le réseau est indisponible. */
  if (isCode(u.pathname)) {
    e.respondWith(
      fetch(req, { cache: "no-store" })
        .then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy));
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then(hit => hit || caches.match("./index.html"))
        )
    );
    return;
  }

  /* ── Icônes et manifeste : cache d'abord, c'est suffisant ── */
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }))
  );
});

/* ============================================================
   Rappels poussés
   Le message reçu est vide : aucune donnée ne transite par le
   service de push. Le détail est demandé à l'API au moment
   d'afficher la notification.
   ============================================================ */
async function readSpace() {
  try {
    const c = await caches.open("pic-meta");
    const r = await c.match("/__pic/space");
    if (!r) return null;
    const s = (await r.text()).trim();
    return /^[a-f0-9]{64}$/.test(s) ? s : null;
  } catch (e) { return null; }
}

self.addEventListener("push", event => {
  event.waitUntil((async () => {
    let body = "Des échéances approchent dans TAF.";
    const space = await readSpace();

    if (space) {
      try {
        const res = await fetch(`/api/rappels?space=${space}`, { cache: "no-store" });
        const d = await res.json();
        if (!d || !d.count) return;              // plus rien à signaler : on se tait
        body = d.count === 1
          ? `« ${d.first} » arrive à échéance.`
          : `${d.count} tâches arrivent à échéance, dont « ${d.first} ».`;
      } catch (e) { /* on garde le message générique */ }
    }

    await self.registration.showNotification("TAF — rappel d'échéance", {
      body,
      icon: "./icon-192.png",
      badge: "./icon-192.png",
      tag: "taf-rappel",
      renotify: true,
      data: { url: "./" }
    });
  })());
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if (c.url.includes(self.registration.scope)) return c.focus();
    }
    return self.clients.openWindow("./");
  })());
});
