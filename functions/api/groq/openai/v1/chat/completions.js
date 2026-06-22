// functions/api/groq/openai/v1/chat/completions.js
//
// Proxy POST vers api.groq.com/openai/v1/chat/completions.
// Le front-end passe l'Authorization (Bearer gsk_...) directement dans les headers ;
// cette fonction le relaie tel quel tout en contournant les restrictions CORS du navigateur.

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const TIMEOUT_MS = 30000;

export async function onRequestPost(context) {
  const { request } = context;

  // Récupérer le corps et les headers nécessaires
  let body;
  try {
    body = await request.text();
  } catch {
    return jsonError('Corps de requête illisible.', 400);
  }

  const authorization = request.headers.get('Authorization') || '';
  if (!authorization.startsWith('Bearer gsk_')) {
    return jsonError('Clé Groq manquante ou invalide (doit commencer par gsk_).', 401);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const upstream = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': authorization,
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
      ? "L'API Groq met trop de temps à répondre."
      : "Impossible de joindre l'API Groq.";
    return jsonError(msg, 502);
  }
}

// Répondre au preflight CORS
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    },
  });
}

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
