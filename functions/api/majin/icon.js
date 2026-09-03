// ─────────────────────────────────────────────────────────────────────────────
// MAJIN — Relais d'icônes d'applications
//
// Route : GET /api/majin/icon?url=<site>
//
// Récupère la vraie icône d'un site et la renvoie telle quelle. Passer par un
// service tiers (celui de Google, par exemple) enverrait la liste complète des
// applications de Najim à chaque chargement de l'onglet : le relais maison
// garde cette liste sur son propre domaine.
//
// Ordre de recherche : apple-touch-icon (souvent 180 px, donc net une fois
// agrandi), puis les <link rel="icon"> par taille décroissante, puis le
// /favicon.ico historique.
// ─────────────────────────────────────────────────────────────────────────────

const TAILLE_MAX = 512 * 1024;
const CACHE = 'public, max-age=2592000, immutable';   // 30 jours

function erreur(message, statut) {
  return new Response(JSON.stringify({ error: message }), {
    status: statut,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

// Même garde que le relais de flux : un proxy ouvert ne doit pas pouvoir
// servir à sonder un réseau interne.
function hoteSuspect(h) {
  h = h.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal')) return true;
  if (h.includes(':')) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const [a, b] = h.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
  }
  return false;
}

// Extraction des <link rel="...icon..."> sans analyseur DOM : le runtime n'en
// a pas, et une expression régulière suffit pour des balises aussi simples.
function candidats(html, base) {
  const out = [];
  const balises = html.match(/<link\b[^>]*>/gi) || [];

  for (const b of balises) {
    const rel = (b.match(/rel\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
    if (!/icon/i.test(rel)) continue;
    const href = (b.match(/href\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (!href) continue;

    const sizes = (b.match(/sizes\s*=\s*["'](\d+)/i) || [])[1];
    let poids = parseInt(sizes || '0', 10);
    // À taille inconnue, l'apple-touch-icon est le meilleur pari : la
    // convention Apple impose une image carrée d'au moins 120 px.
    if (!poids) poids = /apple-touch/i.test(rel) ? 180 : 32;
    if (/apple-touch/i.test(rel)) poids += 10;   // départage à taille égale

    try { out.push({ url: new URL(href, base).toString(), poids }); } catch {}
  }

  out.sort((x, y) => y.poids - x.poids);
  return out.map(o => o.url);
}

async function recuperer(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MAJIN/1.0)', 'Accept': 'image/*' },
    redirect: 'follow',
  });
  if (!res.ok) return null;

  const type = res.headers.get('content-type') || '';
  // Un site absent renvoie souvent sa page 404 en HTTP 200 : sans ce contrôle,
  // MAJIN afficherait du HTML dans une balise <img>.
  if (!/^image\//i.test(type) && !/octet-stream/i.test(type)) return null;

  const buf = await res.arrayBuffer();
  if (!buf.byteLength || buf.byteLength > TAILLE_MAX) return null;

  return new Response(buf, {
    headers: {
      'Content-Type': /^image\//i.test(type) ? type : 'image/x-icon',
      'Cache-Control': CACHE,
    },
  });
}

export async function onRequestGet(context) {
  const cible = new URL(context.request.url).searchParams.get('url');
  if (!cible) return erreur("Paramètre « url » manquant.", 400);

  let site;
  try { site = new URL(cible); } catch { return erreur('URL illisible.', 400); }
  if (site.protocol !== 'https:') return erreur('Seul le protocole https est accepté.', 400);
  if (hoteSuspect(site.hostname)) return erreur('Hôte refusé.', 403);

  const origine = site.origin;

  try {
    // 1. Les déclarations de la page d'accueil.
    let liens = [];
    try {
      const page = await fetch(origine, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MAJIN/1.0)', 'Accept': 'text/html' },
        redirect: 'follow',
      });
      if (page.ok && /text\/html/i.test(page.headers.get('content-type') || '')) {
        // 300 ko suffisent : les <link> vivent dans le <head>.
        liens = candidats((await page.text()).slice(0, 300000), page.url || origine);
      }
    } catch { /* page inaccessible : on tentera les chemins par défaut */ }

    // 2. Les emplacements conventionnels, si la page n'a rien déclaré.
    liens.push(origine + '/apple-touch-icon.png',
               origine + '/apple-touch-icon-precomposed.png',
               origine + '/favicon.ico');

    // On s'arrête au premier candidat qui renvoie vraiment une image, en
    // bornant le nombre d'essais pour ne pas enchaîner dix requêtes.
    for (const lien of liens.slice(0, 6)) {
      try {
        const img = await recuperer(lien);
        if (img) return img;
      } catch { /* candidat suivant */ }
    }

    return erreur('Aucune icône trouvée.', 404);
  } catch (err) {
    return erreur('Site injoignable : ' + (err?.message || String(err)), 502);
  }
}
