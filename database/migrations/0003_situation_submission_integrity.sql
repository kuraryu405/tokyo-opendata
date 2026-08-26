ALTER TABLE situation_submissions
  ADD COLUMN contribution_state TEXT NOT NULL DEFAULT 'quarantined'
  CHECK (contribution_state IN ('accepted', 'quarantined'));

ALTER TABLE situation_submissions
  ADD COLUMN capability_nonce_hash TEXT
  CHECK (capability_nonce_hash IS NULL OR length(capability_nonce_hash) = 64);

CREATE UNIQUE INDEX situation_submissions_capability_nonce_unique
  ON situation_submissions(capability_nonce_hash)
  WHERE capability_nonce_hash IS NOT NULL;

CREATE INDEX situation_submissions_contribution_created_idx
  ON situation_submissions(contribution_state, created_at);

CREATE TABLE situation_submission_capabilities (
  nonce_hash TEXT PRIMARY KEY NOT NULL CHECK (length(nonce_hash) = 64),
  capability_version INTEGER NOT NULL CHECK (capability_version > 0),
  scope TEXT NOT NULL CHECK (scope = 'situation:submit'),
  expires_at TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  consumed_at TEXT,
  consumed_idempotency_key_hash TEXT CHECK (
    consumed_idempotency_key_hash IS NULL OR length(consumed_idempotency_key_hash) = 64
  ),
  CHECK (
    (consumed_at IS NULL AND consumed_idempotency_key_hash IS NULL)
    OR (consumed_at IS NOT NULL AND consumed_idempotency_key_hash IS NOT NULL)
  )
);

CREATE INDEX situation_submission_capabilities_expires_at_idx
  ON situation_submission_capabilities(expires_at);
