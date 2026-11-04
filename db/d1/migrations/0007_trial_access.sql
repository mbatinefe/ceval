CREATE TABLE signup_trial_policy (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1))
);
INSERT INTO signup_trial_policy (id, enabled) VALUES (1, 0);

-- Enrollment survives account deletion: neither a slot nor a clock can be reused.
CREATE TABLE signup_trial_enrollments (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  enrolled_at INTEGER NOT NULL,
  started_at INTEGER
);

CREATE TRIGGER signup_trial_admission BEFORE INSERT ON user
WHEN (SELECT enabled FROM signup_trial_policy WHERE id = 1) = 1
BEGIN
  SELECT CASE
    WHEN NEW.emailVerified != 1 THEN RAISE(ABORT, 'Verified signup required')
    WHEN (SELECT COUNT(*) FROM signup_trial_enrollments) >= 3 THEN RAISE(ABORT, 'Trial signups closed')
    WHEN EXISTS (SELECT 1 FROM signup_trial_enrollments WHERE email = lower(NEW.email)) THEN RAISE(ABORT, 'Trial already enrolled')
  END;
END;

CREATE TRIGGER signup_trial_enroll AFTER INSERT ON user
WHEN (SELECT enabled FROM signup_trial_policy WHERE id = 1) = 1
BEGIN
  INSERT INTO signup_trial_enrollments (user_id, email, enrolled_at)
  VALUES (NEW.id, lower(NEW.email), CAST(unixepoch('subsec') * 1000 AS INTEGER));
END;

-- Reserve and start in the same transaction, without extending an existing window.
CREATE TRIGGER signup_trial_scan_expiry BEFORE INSERT ON scan_spend
WHEN EXISTS (
  SELECT 1 FROM signup_trial_enrollments
  WHERE user_id = NEW.user_id AND started_at IS NOT NULL
    AND started_at + 600000 <= NEW.created_at
)
BEGIN
  SELECT RAISE(ABORT, 'Trial scan window expired');
END;

CREATE TRIGGER signup_trial_scan_start AFTER INSERT ON scan_spend
BEGIN
  UPDATE signup_trial_enrollments SET started_at = NEW.created_at
  WHERE user_id = NEW.user_id AND started_at IS NULL;
END;
