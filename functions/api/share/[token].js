// ─────────────────────────────────────────────────────────────────────────────
// TAF — Vue partagée en lecture seule
//
// Route : GET /api/share/:token  →  { tasks[], columns[] }
//
// Le lien ne donne accès qu'aux tâches en cours : ni les archives, ni les REX,
// ni les réglages. Un collègue suit l'avancement sans rien voir d'autre.
// ─────────────────────────────────────────────────────────────────────────────

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export async function onRequestGet(context) {
  const db = context.env.DB_TAF || context.env.DB;
  if (!db) return json({ error: 'Binding D1 absent.' }, 500);

  const token = String(context.params.token || '').trim();
  if (!token || token.length > 64) return json({ error: 'Lien invalide.' }, 404);

  try {
    const ligne = await db
      .prepare('SELECT tasks, meta FROM spaces WHERE share_token = ?')
      .bind(token)
      .first();
    if (!ligne) return json({ error: 'Lien invalide ou expiré.' }, 404);

    let taches = [];
    let meta = null;
    try { taches = JSON.parse(ligne.tasks || '[]'); } catch {}
    try { meta = ligne.meta ? JSON.parse(ligne.meta) : null; } catch {}

    // Filtrage côté serveur, pas côté client : une vue en lecture seule ne
    // doit jamais recevoir les données qu'elle est censée ne pas montrer.
    const visibles = taches.filter(t =>
      t && !t.deleted && !t.archived && t.kind !== 'note');

    return json({ tasks: visibles, columns: (meta && meta.columns) || [] });
  } catch (err) {
    return json({ error: 'Erreur serveur.' }, 500);
  }
}
