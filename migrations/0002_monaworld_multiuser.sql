-- MonaWorld v8: aislamiento real por streamer sin destruir datos v7.
ALTER TABLE accounts ADD COLUMN user_id INTEGER;
UPDATE accounts SET user_id=(SELECT id FROM users ORDER BY id LIMIT 1) WHERE user_id IS NULL;
DROP INDEX IF EXISTS accounts_platform;
CREATE UNIQUE INDEX IF NOT EXISTS accounts_user_platform ON accounts(user_id, platform);

ALTER TABLE viewers ADD COLUMN owner_user_id INTEGER;
UPDATE viewers SET owner_user_id=(SELECT id FROM users ORDER BY id LIMIT 1) WHERE owner_user_id IS NULL;
DROP INDEX IF EXISTS viewers_identity;
CREATE UNIQUE INDEX IF NOT EXISTS viewers_owner_identity ON viewers(owner_user_id, platform, platform_user_id);

ALTER TABLE rules ADD COLUMN user_id INTEGER;
UPDATE rules SET user_id=(SELECT id FROM users ORDER BY id LIMIT 1) WHERE user_id IS NULL;
CREATE INDEX IF NOT EXISTS rules_user ON rules(user_id);

ALTER TABLE overlays ADD COLUMN user_id INTEGER;
UPDATE overlays SET user_id=(SELECT id FROM users ORDER BY id LIMIT 1) WHERE user_id IS NULL;
CREATE INDEX IF NOT EXISTS overlays_user ON overlays(user_id);

CREATE TABLE IF NOT EXISTS social_identities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  platform TEXT NOT NULL,
  platform_user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(platform, platform_user_id)
);

CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  intent TEXT NOT NULL,
  user_id INTEGER,
  code_verifier TEXT,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_resources (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  data_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS resources_user_kind ON user_resources(user_id,kind,updated_at);

CREATE TABLE IF NOT EXISTS viewer_balances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id INTEGER NOT NULL,
  platform TEXT NOT NULL,
  platform_user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  coins INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(owner_user_id,platform,platform_user_id)
);
CREATE INDEX IF NOT EXISTS balances_owner_points ON viewer_balances(owner_user_id,points DESC);
CREATE INDEX IF NOT EXISTS balances_owner_coins ON viewer_balances(owner_user_id,coins DESC);

CREATE TABLE IF NOT EXISTS redemptions (
  id TEXT PRIMARY KEY,
  owner_user_id INTEGER NOT NULL,
  platform TEXT NOT NULL,
  platform_user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  resource_kind TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  command TEXT NOT NULL,
  currency_kind TEXT NOT NULL,
  cost INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'accepted',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS redemptions_owner_created ON redemptions(owner_user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  mime_type TEXT,
  url TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS media_assets_user_kind ON media_assets(user_id,kind);

CREATE INDEX IF NOT EXISTS events_user_created ON events(user_id,created_at DESC);


-- Configuración inicial para usuarios ya existentes.
INSERT OR IGNORE INTO user_resources(id,user_id,kind,name,enabled,data_json)
SELECT lower(hex(randomblob(16))),id,'loyalty-setting','Loyalty principal',1,'{"pointName":"Points","chatPoints":1,"perTick":{"twitch":10,"youtube":10,"kick":10,"tiktok":10},"gamesEnabled":true,"commandsEnabled":true}' FROM users;
INSERT OR IGNORE INTO user_resources(id,user_id,kind,name,enabled,data_json)
SELECT lower(hex(randomblob(16))),id,'coin-setting','Coin principal',1,'{"coinName":"Coins","rules":{}}' FROM users;
INSERT OR IGNORE INTO user_resources(id,user_id,kind,name,enabled,data_json)
SELECT lower(hex(randomblob(16))),id,'overlay','Overlay Full',1,'{"full":true,"aspect":"16:9","widgets":[]}' FROM users;
INSERT OR IGNORE INTO user_resources(id,user_id,kind,name,enabled,data_json)
SELECT lower(hex(randomblob(16))),id,'command','Points',1,'{"command":"!points","action":"balance_points","response":"{user}, tienes {points} Points.","platforms":["twitch","youtube","kick","tiktok"]}' FROM users;
INSERT OR IGNORE INTO user_resources(id,user_id,kind,name,enabled,data_json)
SELECT lower(hex(randomblob(16))),id,'command','Coins',1,'{"command":"!coins","action":"balance_coins","response":"{user}, tienes {coins} Coins.","platforms":["twitch","youtube","kick","tiktok"]}' FROM users;
INSERT OR IGNORE INTO user_resources(id,user_id,kind,name,enabled,data_json)
SELECT lower(hex(randomblob(16))),id,'command','Rank',1,'{"command":"!rank","action":"rank","response":"{user}, estás en el puesto #{rank}.","platforms":["twitch","youtube","kick","tiktok"]}' FROM users;
