-- ─────────────────────────────────────────────────────────────────────────────
-- TAF — Schéma D1
--
-- Un espace = une ligne. Les tâches sont stockées en JSON plutôt qu'éclatées
-- en colonnes : le modèle de tâche de TAF évolue (tags, statuts, REX,
-- commentaires), et un schéma rigide imposerait une migration à chaque ajout.
-- Le volume reste très en deçà de ce qui justifierait une table par entité.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS spaces (
  space       TEXT PRIMARY KEY,   -- empreinte SHA-256 du code d'espace
  tasks       TEXT,               -- JSON : tableau de tâches
  meta        TEXT,               -- JSON : colonnes + réglages
  share_token TEXT,               -- jeton de partage en lecture seule
  updated_at  INTEGER NOT NULL
);

-- La vue partagée cherche par jeton, pas par espace : sans cet index, chaque
-- ouverture de lien balaierait toute la table.
CREATE INDEX IF NOT EXISTS idx_spaces_share ON spaces (share_token);
