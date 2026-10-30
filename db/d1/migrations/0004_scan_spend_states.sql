ALTER TABLE scan_spend ADD COLUMN reserved_amount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scan_spend ADD COLUMN status TEXT NOT NULL DEFAULT 'unresolved' CHECK(status IN ('pending','estimated','unresolved'));
ALTER TABLE scan_spend ADD COLUMN settled_at INTEGER;
ALTER TABLE scan_spend ADD COLUMN job_id TEXT;

UPDATE scan_spend SET reserved_amount = CASE kind
  WHEN 'recognize' THEN 50000
  WHEN 'compare' THEN 2000000
  ELSE 0
END;

-- Legacy rows equal to a reservation do not establish complete usage.
-- Preserve every historical amount, including costs with an unknown kind.
UPDATE scan_spend SET status = CASE
  WHEN kind IN ('recognize','compare') AND amount != reserved_amount THEN 'estimated'
  ELSE 'unresolved'
END;
