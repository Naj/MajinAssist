// MAJIN — Service Worker minimal (installabilité uniquement)
//
// Aucun cache, volontairement. MAJIN dépend d'API live (Groq, météo, RSS,
// recherche, synchro D1) et le mode hors-ligne a été abandonné au profit de la
// vitesse de déploiement : une nouvelle version mise en ligne doit apparaître
// au rechargement suivant, pas trois jours plus tard.
//
// Ce worker se contente de laisser passer le réseau, ce qui suffit aux
// navigateurs (Chrome / Edge / Android) pour proposer l'installation en PWA.

const VERSION = 'majin-sw-v2';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// La page demande l'activation immédiate dès qu'une nouvelle version est
// installée, plutôt que d'attendre la fermeture de tous les onglets.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Passthrough pur — aucune mise en cache, aucune réponse hors-ligne.
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
