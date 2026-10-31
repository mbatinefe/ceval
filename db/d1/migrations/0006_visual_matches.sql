CREATE TABLE scan_visual_matches (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES scan_products(id) ON DELETE CASCADE,
  market TEXT NOT NULL CHECK(market IN ('US','GB','TR')),
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,product_id,market)
);
