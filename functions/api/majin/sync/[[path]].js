// ─────────────────────────────────────────────────────────────────────────────
// MAJIN — API de synchronisation (Cloudflare Pages Function + D1)
//
// Routes (toutes en même origine que l'app, donc aucun CORS à gérer) :
//   GET  /api/majin/sync/status              → état du dépôt + révision
//   GET  /api/majin/sync/pull?ns=…&since=…   → lignes modifiées depuis `since`
//   POST /api/majin/sync/push                → applique un lot de modifications
//   POST /api/majin/sync/wipe                → vide un espace de noms (protégé)
//
// Le préfixe /api/majin/ n'est pas cosmétique : TAF occupe /api/sync depuis
// toujours, et une fonction posée là intercepterait ses appels.
//
// Binding attendu : DB_MAJIN (base D1 propre à MAJIN)
// Secret attendu  : MAJIN_SYNC_KEY  → envoyé par le client dans X-Majin-Key
//
// Le nom DB_MAJIN n'est pas cosmétique : les fonctions de TAF utilisent
// env.DB depuis toujours. Laisser DB à MAJIN les faisait interroger la base
// de MAJIN, d'où le « no such table: tasks ». DB reste donc à TAF.
//
// Résolution des conflits : dernière écriture gagnante sur `updated_at`
// (horloge de l'appareil émetteur). Une modification plus ancienne que la
// valeur en base est refusée et renvoyée au client, qui adopte la version
// serveur. Suffisant ici : un seul utilisateur, plusieurs machines, les
// écritures simultanées sur une même clé sont l'exception.
// ─────────────────────────────────────────────────────────────────────────────

const NAMESPACES = new Set(['prefs', 'taf']);
const MAX_CHANGES = 500;
const MAX_VALUE_BYTES = 512 * 1024;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

// Comparaison à durée constante : évite qu'un attaquant devine la clé
// caractère par caractère en mesurant le temps de réponse.
function safeEqual(a, b) {
  a = String(a || '');
  b = String(b || '');
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Empreinte SHA-256, en hexadécimal minuscule.
//
// Les en-têtes HTTP transportent du Latin-1. Une clé contenant un accent — un
// « é », par exemple — part sur un octet que le runtime relit ensuite en UTF-8,
// où il est invalide : il devient U+FFFD et la comparaison échoue toujours.
// Transmettre l'empreinte plutôt que la clé règle le problème pour de bon, et
// au passage le secret ne circule plus en clair.
async function sha256hex(txt) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('majin:' + txt));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function authorize(request, env) {
  if (!env.MAJIN_SYNC_KEY) {
    return json({ error: 'MAJIN_SYNC_KEY absent des variables du projet Cloudflare.' }, 500);
  }
  const given = request.headers.get('X-Majin-Key');
  if (!given) return json({ error: 'Clé de synchronisation absente.' }, 401);

  const attendu = await sha256hex(env.MAJIN_SYNC_KEY);

  // On accepte encore la clé en clair : une machine restée sur l'ancienne
  // version continue de fonctionner le temps qu'elle soit mise à jour. À
  // retirer une fois tous vos navigateurs passés en v48.
  if (safeEqual(given, attendu)) return null;
  if (safeEqual(given, env.MAJIN_SYNC_KEY)) return null;

  return json({ error: 'Clé de synchronisation invalide.' }, 401);
}

function readNs(url) {
  const ns = url.searchParams.get('ns') || 'prefs';
  return NAMESPACES.has(ns) ? ns : null;
}

async function currentRev(db, ns) {
  const row = await db
    .prepare('SELECT COALESCE(MAX(rev), 0) AS rev FROM kv WHERE ns = ?')
    .bind(ns)
    .first();
  return row ? Number(row.rev) : 0;
}

async function touchDevice(db, device, label, ua) {
  if (!device) return;
  await db
    .prepare(
      `INSERT INTO devices (id, label, last_seen, user_agent) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         label = COALESCE(excluded.label, devices.label),
         last_seen = excluded.last_seen,
         user_agent = excluded.user_agent`
    )
    .bind(device, label || null, Date.now(), (ua || '').slice(0, 300))
    .run();
}

// ── GET /api/sync/status ─────────────────────────────────────────────────────
async function handleStatus(db, url) {
  const ns = readNs(url);
  if (!ns) return json({ error: 'Espace de noms inconnu.' }, 400);

  const rev = await currentRev(db, ns);
  const counts = await db
    .prepare('SELECT COUNT(*) AS total, SUM(deleted) AS tombs FROM kv WHERE ns = ?')
    .bind(ns)
    .first();
  const devices = await db
    .prepare('SELECT id, label, last_seen FROM devices ORDER BY last_seen DESC LIMIT 12')
    .all();

  return json({
    ok: true,
    ns,
    rev,
    keys: Number(counts?.total || 0) - Number(counts?.tombs || 0),
    devices: devices?.results || [],
    server_time: Date.now(),
  });
}

// ── GET /api/sync/pull ───────────────────────────────────────────────────────
async function handlePull(db, url) {
  const ns = readNs(url);
  if (!ns) return json({ error: 'Espace de noms inconnu.' }, 400);

  const since = Math.max(0, Number(url.searchParams.get('since') || 0) || 0);

  const rows = await db
    .prepare(
      `SELECT k, v, deleted, updated_at, device, rev
         FROM kv
        WHERE ns = ? AND rev > ?
        ORDER BY rev ASC
        LIMIT 1000`
    )
    .bind(ns, since)
    .all();

  const changes = (rows?.results || []).map((r) => ({
    k: r.k,
    v: r.deleted ? null : r.v,
    deleted: !!r.deleted,
    updated_at: Number(r.updated_at),
    device: r.device,
  }));

  const rev = changes.length
    ? Number(rows.results[rows.results.length - 1].rev)
    : await currentRev(db, ns);

  return json({ ok: true, ns, rev, changes, server_time: Date.now() });
}

// ── POST /api/sync/push ──────────────────────────────────────────────────────
async function handlePush(db, request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Corps de requête illisible.' }, 400);
  }

  const ns = NAMESPACES.has(body?.ns) ? body.ns : null;
  if (!ns) return json({ error: 'Espace de noms inconnu.' }, 400);

  const device = String(body?.device || '').slice(0, 64);
  const changes = Array.isArray(body?.changes) ? body.changes : [];
  if (!changes.length) {
    return json({ ok: true, ns, rev: await currentRev(db, ns), applied: 0, rejected: [] });
  }
  if (changes.length > MAX_CHANGES) {
    return json({ error: `Lot trop volumineux (max ${MAX_CHANGES} clés).` }, 413);
  }

  // État actuel des clés visées, pour arbitrer la dernière écriture gagnante.
  const keys = changes.map((c) => String(c.k || '')).filter(Boolean);
  const placeholders = keys.map(() => '?').join(',');
  const existing = await db
    .prepare(`SELECT k, v, updated_at, deleted FROM kv WHERE ns = ? AND k IN (${placeholders})`)
    .bind(ns, ...keys)
    .all();

  const currentByKey = new Map();
  for (const r of existing?.results || []) currentByKey.set(r.k, r);

  let rev = await currentRev(db, ns);
  const statements = [];
  const rejected = [];
  let applied = 0;

  for (const c of changes) {
    const k = String(c.k || '');
    if (!k || k.length > 200) continue;

    const deleted = c.deleted ? 1 : 0;
    const v = deleted ? null : (c.v == null ? null : String(c.v));
    if (v && v.length > MAX_VALUE_BYTES) {
      rejected.push({ k, reason: 'too_large' });
      continue;
    }

    const updatedAt = Number(c.updated_at) || Date.now();
    const cur = currentByKey.get(k);

    // Le serveur détient une version plus récente : on refuse et on renvoie
    // la valeur gagnante pour que le client s'aligne sans perdre la donnée.
    if (cur && Number(cur.updated_at) > updatedAt) {
      rejected.push({
        k,
        reason: 'stale',
        v: cur.deleted ? null : cur.v,
        deleted: !!cur.deleted,
        updated_at: Number(cur.updated_at),
      });
      continue;
    }

    rev += 1;
    applied += 1;
    statements.push(
      db
        .prepare(
          `INSERT INTO kv (ns, k, v, rev, updated_at, device, deleted)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(ns, k) DO UPDATE SET
             v = excluded.v,
             rev = excluded.rev,
             updated_at = excluded.updated_at,
             device = excluded.device,
             deleted = excluded.deleted`
        )
        .bind(ns, k, v, rev, updatedAt, device || null, deleted)
    );
  }

  if (statements.length) await db.batch(statements);

  await touchDevice(db, device, body?.label, request.headers.get('User-Agent'));

  return json({ ok: true, ns, rev, applied, rejected, server_time: Date.now() });
}

// ── POST /api/sync/wipe ──────────────────────────────────────────────────────
// Remise à zéro d'un espace de noms. Exige confirm:"EFFACER" pour qu'un appel
// accidentel (ou un client buggé) ne puisse pas vider la base.
async function handleWipe(db, request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Corps de requête illisible.' }, 400);
  }
  const ns = NAMESPACES.has(body?.ns) ? body.ns : null;
  if (!ns) return json({ error: 'Espace de noms inconnu.' }, 400);
  if (body?.confirm !== 'EFFACER') {
    return json({ error: 'Confirmation manquante.' }, 400);
  }
  await db.prepare('DELETE FROM kv WHERE ns = ?').bind(ns).run();
  return json({ ok: true, ns, rev: 0 });
}

// ── Routeur ──────────────────────────────────────────────────────────────────
export async function onRequest(context) {
  const { request, env } = context;

  // Pas de repli sur env.DB : ce binding appartient à TAF, et y écrire les
  // réglages de MAJIN mélangerait deux applications dans la même base.
  const db = env.DB_MAJIN;
  if (!db) {
    return json({ error: 'Binding D1 « DB_MAJIN » absent du projet Cloudflare Pages.' }, 500);
  }

  const denied = await authorize(request, env);
  if (denied) return denied;

  const url = new URL(request.url);
  const action = url.pathname.replace(/^\/api\/majin\/sync\/?/, '').replace(/\/$/, '');

  try {
    if (request.method === 'GET' && (action === 'status' || action === '')) {
      return await handleStatus(db, url);
    }
    if (request.method === 'GET' && action === 'pull') {
      return await handlePull(db, url);
    }
    if (request.method === 'POST' && action === 'push') {
      return await handlePush(db, request);
    }
    if (request.method === 'POST' && action === 'wipe') {
      return await handleWipe(db, request);
    }
    return json({ error: 'Route inconnue.' }, 404);
  } catch (err) {
    return json({ error: 'Erreur serveur : ' + (err?.message || String(err)) }, 500);
  }
}
