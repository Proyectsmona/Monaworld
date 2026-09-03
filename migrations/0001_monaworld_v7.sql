-- MonaWorld v7 · amplía el esquema del prototipo sin destruir nada.
-- Las tablas users, settings y events ya existen: solo se les añaden columnas.

-- events: columnas del evento común
ALTER TABLE events ADD COLUMN dedupe_key TEXT;
ALTER TABLE events ADD COLUMN event_source TEXT;
ALTER TABLE events ADD COLUMN actor_id TEXT;
ALTER TABLE events ADD COLUMN avatar_url TEXT;
ALTER TABLE events ADD COLUMN raw_unit TEXT;
ALTER TABLE events ADD COLUMN gift_name TEXT;
ALTER TABLE events ADD COLUMN message TEXT;

-- idempotencia: en SQLite un índice UNIQUE admite varios NULL,
-- así que las filas antiguas sin clave no molestan.
CREATE UNIQUE INDEX IF NOT EXISTS events_dedupe ON events (dedupe_key);
CREATE INDEX IF NOT EXISTS events_created ON events (created_at);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,
  channel_name TEXT NOT NULL,
  platform_user_id TEXT,
  access_token TEXT,
  refresh_token TEXT,
  expires_at INTEGER,
  status TEXT NOT NULL DEFAULT 'offline',
  last_error TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_platform ON accounts (platform);

CREATE TABLE IF NOT EXISTS rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  match_json TEXT NOT NULL DEFAULT '{}',
  actions_json TEXT NOT NULL DEFAULT '[]',
  cooldown_ms INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS counters (
  key TEXT PRIMARY KEY,
  value REAL NOT NULL DEFAULT 0,
  label TEXT
);

CREATE TABLE IF NOT EXISTS viewers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,
  platform_user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  first_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS viewers_identity ON viewers (platform, platform_user_id);

CREATE TABLE IF NOT EXISTS overlays (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  layout_json TEXT NOT NULL DEFAULT '{"widgets":[]}',
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- contadores base que el panel espera encontrar
INSERT OR IGNORE INTO counters (key, value, label) VALUES
  ('monacoins', 0, 'MonaCoins'),
  ('monopoints', 0, 'MonaPoints'),
  ('timer', 0, 'MonaTimer');
