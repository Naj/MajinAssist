// functions/api/serper/search.js
//
// Proxy POST vers google.serper.dev/search.
// Le front-end passe le header X-API-KEY avec la clé Serper ;
// cette fonction le relaie en contournant les restrictions CORS.

const SERPER_ENDPOINT = 'https://google.serper.dev/search';
const TIMEOUT_MS = 15000;

export async function onRequestPost(context) {
  const { request } = context;

  let body;
  try {
    body = await request.text();
  } catch {
    return jsonError('Corps de requête illisible.', 400);
  }

  const apiKey = request.headers.get('X-API-KEY') || '';
  if (!apiKey) {
    return jsonError('Clé Serper manquante (header X-API-KEY requis).', 401);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const upstream = await fetch(SERPER_ENDPOINT, {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await upstream.text();
    return new Response(data, {
      status: upstream.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    clearTimeout(timeout);
    const msg = err && err.name === 'AbortError'
      ? "L'API Serper met trop de temps à répondre."
      : "Impossible de joindre l'API Serper.";
    return jsonError(msg, 502);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'X-API-KEY, Content-Type',
    },
  });
}

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
