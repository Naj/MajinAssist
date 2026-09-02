// ─────────────────────────────────────────────────────────────────────────────
// TAF — Synchronisation des tâches (Cloudflare Pages Function + D1)
//
// À n'utiliser QUE si vous n'avez pas récupéré vos propres fonctions TAF.
// Si vous les avez, copiez les vôtres à la place : elles connaissent déjà le
// schéma de votre base et vos données existantes s'y trouvent.
//
// Route : POST /api/sync
//   Entrée  { space, tasks[], meta:{columns, settings, updatedAt}, shareToken? }
//   Sortie  { tasks[], meta, serverTime }
//
// `space` est l'empreinte SHA-256 du code d'espace, calculée côté navigateur.
// Le code lui-même ne quitte jamais l'appareil : le serveur ne voit qu'un
// identifiant opaque, qu'il ne peut pas inverser.
//
// Binding attendu : DB_TAF (base D1). Voir schema-taf.sql pour le schéma.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_BODY = 4 * 1024 * 1024;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

// Fusion identique à celle du client : pour chaque tâche, la version dont
// updatedAt est le plus récent l'emporte. Les deux côtés appliquent la même
// règle, donc ils convergent sans avoir à s'accorder sur un arbitre.
function fusionner(locales, distantes) {
  const parId = new Map();
  distantes.forEach(t => { if (t && t.id) parId.set(t.id, t); });
  locales.forEach(t => {
    if (!t || !t.id) return;
    const dej = parId.get(t.id);
    if (!dej) { parId.set(t.id, t); return; }
    const a = String(t.updatedAt || '');
    const b = String(dej.updatedAt || '');
    if (a > b) parId.set(t.id, t);
  });
  return [...parId.values()];
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const db = env.DB_TAF || env.DB;

  if (!db) {
    return json({ error: 'Binding D1 absent. Ajoutez « DB_TAF » dans les réglages du projet Pages.' }, 500);
  }

  let body;
  try {
    const brut = await request.text();
    if (brut.length > MAX_BODY) return json({ error: 'Charge trop volumineuse.' }, 413);
    body = JSON.parse(brut);
  } catch {
    return json({ error: 'Corps de requête illisible.' }, 400);
  }

  const space = String(body?.space || '').trim();
  // L'empreinte fait 64 caractères hexadécimaux : tout le reste est rejeté,
  // ce qui évite qu'un espace fantaisiste crée une ligne à chaque appel.
  if (!/^[0-9a-f]{64}$/.test(space)) {
    return json({ error: "Identifiant d'espace invalide." }, 400);
  }

  const tachesEntrantes = Array.isArray(body?.tasks) ? body.tasks : [];
  const metaEntrante = body?.meta || null;
  const shareToken = body?.shareToken ? String(body.shareToken).slice(0, 64) : null;

  try {
    const ligne = await db
      .prepare('SELECT tasks, meta, share_token FROM spaces WHERE space = ?')
      .bind(space)
      .first();

    let tachesStockees = [];
    let metaStockee = null;
    let tokenStocke = null;

    if (ligne) {
      try { tachesStockees = JSON.parse(ligne.tasks || '[]'); } catch { tachesStockees = []; }
      try { metaStockee = ligne.meta ? JSON.parse(ligne.meta) : null; } catch { metaStockee = null; }
      tokenStocke = ligne.share_token || null;
    }

    const fusionnees = fusionner(tachesEntrantes, tachesStockees);

    // Le méta suit la même règle que les tâches, sur son propre updatedAt.
    let metaFinale = metaStockee;
    if (metaEntrante && metaEntrante.updatedAt) {
      if (!metaStockee || !metaStockee.updatedAt ||
          String(metaEntrante.updatedAt) > String(metaStockee.updatedAt)) {
        metaFinale = metaEntrante;
      }
    }

    // shareToken null explicite = révocation demandée par le client.
    const tokenFinal = Object.prototype.hasOwnProperty.call(body, 'shareToken')
      ? shareToken
      : tokenStocke;

    await db
      .prepare(
        `INSERT INTO spaces (space, tasks, meta, share_token, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(space) DO UPDATE SET
           tasks = excluded.tasks,
           meta = excluded.meta,
           share_token = excluded.share_token,
           updated_at = excluded.updated_at`
      )
      .bind(
        space,
        JSON.stringify(fusionnees),
        metaFinale ? JSON.stringify(metaFinale) : null,
        tokenFinal,
        Date.now()
      )
      .run();

    return json({
      tasks: fusionnees,
      meta: metaFinale,
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    return json({ error: 'Erreur serveur : ' + (err?.message || String(err)) }, 500);
  }
}

// Un GET sur /api/sync sert de test de vie : il permet de vérifier depuis un
// navigateur que la fonction est bien déployée, sans toucher aux données.
export async function onRequestGet(context) {
  const db = context.env.DB_TAF || context.env.DB;
  return json({ ok: true, service: 'taf-sync', d1: !!db });
}
