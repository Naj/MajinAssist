-- ─────────────────────────────────────────────────────────────────────────────
-- MAJIN — Schéma D1 (Cloudflare)
--
-- Modèle : magasin clé/valeur versionné, partitionné par espace de noms (ns).
--   ns = 'prefs'  → réglages MAJIN (les clés majin_*)
--   ns = 'taf'    → données de l'application TAF (à venir)
--
-- Chaque écriture reçoit une révision globale monotone (rev). Un appareil ne
-- redemande que les lignes dont rev > sa dernière révision connue : la synchro
-- est donc incrémentale, pas un dump complet à chaque tour.
--
-- Les suppressions laissent une pierre tombale (deleted = 1) au lieu d'effacer
-- la ligne : sans elle, un appareil hors ligne au moment de la suppression
-- ressusciterait la donnée à sa reconnexion.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kv (
  ns          TEXT    NOT NULL,
  k           TEXT    NOT NULL,
  v           TEXT,
  rev         INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  device      TEXT,
  deleted     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ns, k)
);

-- Index de lecture delta : c'est la requête chaude (un appel toutes les 25 s
-- par appareil ouvert), elle doit rester sur index.
CREATE INDEX IF NOT EXISTS idx_kv_ns_rev ON kv (ns, rev);

-- Journal léger des appareils connectés, pour l'affichage dans Paramètres.
CREATE TABLE IF NOT EXISTS devices (
  id          TEXT PRIMARY KEY,
  label       TEXT,
  last_seen   INTEGER NOT NULL,
  user_agent  TEXT
);
