// ─────────────────────────────────────────────────────────────────────────────
// MAJIN — Proxy ICS (Cloudflare Pages Function)
//
// Route : GET /api/majin/ics-proxy?url=<flux .ics>
//
// Google Calendar ne renvoie pas d'en-tête CORS sur ses flux ICS : le
// navigateur refuse donc de les lire directement. Ce proxy relaie la requête
// côté serveur, où la politique d'origine ne s'applique pas.
//
// Il vit sous /api/majin/ et non /api/ : le routeur fourre-tout de TAF occupe
// /api/* et intercepterait la route avant qu'elle n'arrive ici.
// ─────────────────────────────────────────────────────────────────────────────

// Liste blanche d'hôtes. Sans elle, l'URL publique du proxy permettrait à
// n'importe qui de faire émettre des requêtes arbitraires par votre domaine.
const HOTES_AUTORISES = [
  'calendar.google.com',
  'www.google.com',
  'outlook.office365.com',
  'outlook.live.com',
  'p01-calendars.icloud.com',
  'caldav.icloud.com',
];

function texte(corps, statut = 200, type = 'text/calendar; charset=utf-8') {
  return new Response(corps, {
    status: statut,
    headers: { 'Content-Type': type, 'Cache-Control': 'no-store' },
  });
}

function erreur(message, statut) {
  return new Response(JSON.stringify({ error: message }), {
    status: statut,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const cible = url.searchParams.get('url');

  if (!cible) return erreur("Paramètre « url » manquant.", 400);

  let dest;
  try {
    dest = new URL(cible);
  } catch {
    return erreur('URL illisible.', 400);
  }

  if (dest.protocol !== 'https:') {
    return erreur('Seul le protocole https est accepté.', 400);
  }

  const hote = dest.hostname.toLowerCase();
  const autorise = HOTES_AUTORISES.some(h => hote === h || hote.endsWith('.' + h));
  if (!autorise) {
    return erreur(
      "Hôte non autorisé : " + hote + ". Ajoutez-le à HOTES_AUTORISES dans " +
      "functions/api/majin/ics-proxy.js si le flux est légitime.", 403);
  }

  try {
    const res = await fetch(dest.toString(), {
      headers: { 'User-Agent': 'MAJIN/1.0 (calendrier)', 'Accept': 'text/calendar, text/plain, */*' },
      redirect: 'follow',
    });

    if (!res.ok) {
      return erreur('Le fournisseur a répondu ' + res.status + '.', res.status === 404 ? 404 : 502);
    }

    const corps = await res.text();

    // Un flux privé expiré renvoie souvent une page de connexion en HTTP 200.
    // Sans ce contrôle, MAJIN afficherait « 0 événement » au lieu de la cause.
    if (!/BEGIN:VCALENDAR/i.test(corps)) {
      return erreur(
        "La réponse n'est pas un flux ICS. L'adresse privée a peut-être été " +
        "régénérée côté Google : reprenez-la dans les paramètres de l'agenda.", 502);
    }

    return texte(corps);
  } catch (err) {
    return erreur('Flux injoignable : ' + (err?.message || String(err)), 502);
  }
}
