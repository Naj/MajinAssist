// MAJIN — Service Worker minimal (installabilité uniquement)
//
// Volontairement SANS cache : MAJIN dépend d'API live (Groq, météo, RSS,
// recherche). Un cache offline avait été testé puis retiré car il servait
// des données obsolètes / cassait les appels API. Ce SW se contente de
// laisser passer le réseau, ce qui suffit aux navigateurs (Chrome/Edge/
// Android) pour proposer l'installation en PWA.

const VERSION = 'majin-sw-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Passthrough pur — aucune mise en cache, aucune réponse hors-ligne.
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
