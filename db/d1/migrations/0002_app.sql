CREATE TABLE app_limits (
  key TEXT PRIMARY KEY NOT NULL,
  count INTEGER NOT NULL,
  resets_at INTEGER NOT NULL
);
CREATE INDEX app_limits_expiry_idx ON app_limits (resets_at);

CREATE TABLE saved_finds (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('buy', 'resale')),
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, product_id, mode)
);
CREATE INDEX saved_finds_owner_created_idx ON saved_finds (user_id, created_at DESC);
