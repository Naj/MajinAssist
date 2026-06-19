// functions/api/ics-proxy.js
//
// Proxy générique pour récupérer un flux .ics (Google/Outlook/iCloud/...) côté
// serveur, car ces fournisseurs ne renvoient pas d'en-têtes CORS — un fetch()
// direct depuis le navigateur échouerait. Le front-end appelle :
//   /api/ics-proxy?url=<URL_ICS_ENCODEE>
// Cette fonction va chercher le flux et le renvoie tel quel (même origine
// pour le navigateur, donc aucun souci de CORS côté retour).

const MAX_BYTES = 5 * 1024 * 1024; // 5 Mo — garde-fou contre un flux énorme/abusif
const TIMEOUT_MS = 10000;

export async function onRequestGet(context) {
  const { request } = context;
  const reqUrl = new URL(request.url);
  const raw = reqUrl.searchParams.get('url');

  if (!raw) {
    return new Response('Paramètre "url" manquant.', { status: 400 });
  }

  // webcal:// est l'équivalent de https:// pour les liens d'abonnement calendrier
  const normalized = raw.replace(/^webcal:\/\//i, 'https://');

  let target;
  try {
    target = new URL(normalized);
  } catch {
    return new Response('URL invalide.', { status: 400 });
  }

  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    return new Response('Seules les URLs http(s) ou webcal sont acceptées.', { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const upstream = await fetch(target.toString(), {
      headers: { 'User-Agent': 'MAJIN-ICS-Proxy/1.0 (+personal dashboard)' },
      redirect: 'follow',
      signal: controller.signal,
      cf: { cacheTtl: 300, cacheEverything: true } // léger cache edge (5 min)
    });

    clearTimeout(timeout);

    if (!upstream.ok) {
      return new Response(`Le calendrier distant a répondu ${upstream.status}.`, { status: 502 });
    }

    const buf = await upstream.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) {
      return new Response('Flux ICS trop volumineux.', { status: 413 });
    }

    return new Response(buf, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    });
  } catch (err) {
    clearTimeout(timeout);
    const msg = err && err.name === 'AbortError'
      ? 'Le calendrier distant met trop de temps à répondre.'
      : 'Impossible de joindre le calendrier distant.';
    return new Response(msg, { status: 502 });
  }
}
