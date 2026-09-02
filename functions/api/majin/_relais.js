// ─────────────────────────────────────────────────────────────────────────────
// MAJIN — Relais générique vers une API tierce
//
// Ces trois proxys existaient en règles _redirects. Elles ne fonctionnent plus :
// le routeur fourre-tout de TAF occupe /api/*, et les Pages Functions sont
// évaluées AVANT le fichier _redirects. Une redirection ne peut donc pas passer
// devant une fonction. Il fallait des fonctions à leur tour.
//
// Le préfixe /api/majin/ les met hors de portée de ce fourre-tout.
// ─────────────────────────────────────────────────────────────────────────────

export function relais(base) {
  return async function (context) {
    const { request, params } = context;

    const chemin = Array.isArray(params.path) ? params.path.join('/') : (params.path || '');
    const entrante = new URL(request.url);
    const cible = new URL(base.replace(/\/+$/, '') + '/' + chemin);
    cible.search = entrante.search;

    // On recopie les en-têtes utiles et on laisse tomber ceux qui décrivent la
    // connexion au proxy plutôt que la requête elle-même : les transmettre tels
    // quels fait rejeter l'appel par l'API distante.
    const entetes = new Headers();
    for (const [nom, valeur] of request.headers) {
      const n = nom.toLowerCase();
      if (n === 'host' || n === 'origin' || n === 'referer' ||
          n === 'cookie' || n.startsWith('cf-') || n.startsWith('x-forwarded-')) continue;
      entetes.set(nom, valeur);
    }

    try {
      const res = await fetch(cible.toString(), {
        method: request.method,
        headers: entetes,
        body: (request.method === 'GET' || request.method === 'HEAD') ? undefined : request.body,
        redirect: 'follow',
      });

      const sortie = new Headers(res.headers);
      sortie.delete('content-encoding');   // déjà décodé par le runtime
      sortie.delete('content-length');
      sortie.set('Cache-Control', 'no-store');
      return new Response(res.body, { status: res.status, headers: sortie });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: 'Relais indisponible : ' + (err?.message || String(err)) }),
        { status: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
    }
  };
}
