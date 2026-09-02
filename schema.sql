-- PIC — schéma D1
-- Application : npx wrangler d1 execute pic --remote --file=./schema.sql

CREATE TABLE IF NOT EXISTS tasks (
  space      TEXT NOT NULL,
  id         TEXT NOT NULL,
  payload    TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0,
  echeance   TEXT,
  archived   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (space, id)
);

CREATE INDEX IF NOT EXISTS idx_tasks_space_updated ON tasks (space, updated_at);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks (space, deleted, archived, echeance);

CREATE TABLE IF NOT EXISTS meta (
  space      TEXT PRIMARY KEY,
  columns    TEXT,
  settings   TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subs (
  endpoint   TEXT PRIMARY KEY,
  space      TEXT NOT NULL,
  p256dh     TEXT,
  auth       TEXT,
  created_at TEXT NOT NULL,
  last_sent  TEXT
);

CREATE INDEX IF NOT EXISTS idx_subs_space ON subs (space);

-- ── Extension v2 ──────────────────────────────────────────────────────

-- Commentaires horodatés (fil par tâche)
CREATE TABLE IF NOT EXISTS comments (
  id         TEXT NOT NULL,
  space      TEXT NOT NULL,
  task_id    TEXT NOT NULL,
  texte      TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (space, id)
);
CREATE INDEX IF NOT EXISTS idx_comments_task ON comments (space, task_id, created_at);

-- Liens entre tâches
CREATE TABLE IF NOT EXISTS links (
  space      TEXT NOT NULL,
  from_id    TEXT NOT NULL,
  to_id      TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (space, from_id, to_id)
);

-- Partage en lecture seule
CREATE TABLE IF NOT EXISTS shares (
  token      TEXT PRIMARY KEY,
  space      TEXT NOT NULL,
  label      TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_shares_space ON shares (space);
