// ─────────────────────────────────────────────────────────────────────────────
// MAJIN — Relais de flux RSS / Atom
//
// Route : GET /api/majin/feed?url=<flux>
//
// Le bandeau dépendait de trois services gratuits — rss2json, allorigins,
// corsproxy — tous soumis à quota et régulièrement saturés. Quand les trois
// tombent, le bandeau affiche « vérifiez votre connexion » alors que la
// connexion va très bien. Ce relais retire cette dépendance : c'est votre
// propre domaine qui va chercher le flux.
// ─────────────────────────────────────────────────────────────────────────────

const TAILLE_MAX = 3 * 1024 * 1024;

function erreur(message, statut) {
  return new Response(JSON.stringify({ error: message }), {
    status: statut,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

// Un proxy ouvert sur internet peut servir à sonder un réseau interne. On
// refuse donc tout ce qui n'est pas un nom d'hôte public en clair.
function hoteSuspect(h) {
  h = h.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal')) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const [a, b] = h.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;   // métadonnées cloud
  }
  if (h.includes(':')) return true;            // IPv6 littérale
  return false;
}

export async function onRequestGet(context) {
  const cible = new URL(context.request.url).searchParams.get('url');
  if (!cible) return erreur("Paramètre « url » manquant.", 400);

  let dest;
  try { dest = new URL(cible); } catch { return erreur('URL illisible.', 400); }

  if (dest.protocol !== 'https:') return erreur('Seul le protocole https est accepté.', 400);
  if (hoteSuspect(dest.hostname)) return erreur('Hôte refusé.', 403);

  try {
    const res = await fetch(dest.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MAJIN/1.0; +bandeau actualités)',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      },
      redirect: 'follow',
    });

    if (!res.ok) return erreur('Le flux a répondu ' + res.status + '.', 502);

    const corps = await res.text();
    if (corps.length > TAILLE_MAX) return erreur('Flux trop volumineux.', 413);

    // Un flux déplacé renvoie souvent une page HTML en HTTP 200. Le dire est
    // plus utile que de laisser le navigateur analyser du HTML et trouver zéro
    // article, ce qui se confondrait avec une panne réseau.
    if (!/<(rss|feed|rdf:RDF)[\s>]/i.test(corps)) {
      return erreur("La réponse n'est pas un flux RSS ou Atom. L'adresse a peut-être changé.", 502);
    }

    return new Response(corps, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        // Cinq minutes : c'est la cadence d'actualisation du bandeau, inutile
        // de rappeler le serveur du journal à chaque ouverture d'onglet.
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (err) {
    return erreur('Flux injoignable : ' + (err?.message || String(err)), 502);
  }
}
