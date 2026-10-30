ALTER TABLE scan_products ADD COLUMN market TEXT CHECK(market IS NULL OR market IN ('US','GB','TR'));

CREATE TABLE scan_history (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_data TEXT NOT NULL,
  comparison_data TEXT,
  thumbnail TEXT CHECK(thumbnail IS NULL OR length(thumbnail) <= 40000),
  source TEXT NOT NULL CHECK(source IN ('camera','video','sample')),
  market TEXT CHECK(market IS NULL OR market IN ('US','GB','TR')),
  mode TEXT NOT NULL CHECK(mode IN ('buy','resale')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,id),
  UNIQUE(user_id,product_id,source)
);
CREATE INDEX scan_history_owner_updated ON scan_history(user_id,updated_at DESC,id);
