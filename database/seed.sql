INSERT INTO backend_metadata (key, value)
VALUES ('seed_version', '1')
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = CURRENT_TIMESTAMP
WHERE backend_metadata.value <> excluded.value;
