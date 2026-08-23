CREATE TABLE situation_submissions (
  id TEXT PRIMARY KEY NOT NULL CHECK (id GLOB 'sit_*'),
  consent_version TEXT NOT NULL,
  consented_at TEXT NOT NULL,
  municipality_code TEXT CHECK (municipality_code IS NULL OR municipality_code GLOB '13[0-9][0-9][0-9]'),
  visit_purpose TEXT NOT NULL,
  departure_window TEXT NOT NULL,
  return_status TEXT NOT NULL,
  family_age_groups_json TEXT NOT NULL,
  accommodation TEXT NOT NULL,
  needs_json TEXT NOT NULL,
  japanese_level TEXT NOT NULL,
  deletion_token_hash TEXT NOT NULL CHECK (length(deletion_token_hash) = 64),
  idempotency_key_hash TEXT NOT NULL UNIQUE CHECK (length(idempotency_key_hash) = 64),
  payload_hash TEXT NOT NULL CHECK (length(payload_hash) = 64),
  created_at TEXT NOT NULL
);

CREATE TABLE conversations (
  id TEXT PRIMARY KEY NOT NULL CHECK (id GLOB 'con_*'),
  consent_version TEXT NOT NULL,
  consented_at TEXT NOT NULL,
  model_id TEXT NOT NULL,
  deletion_token_hash TEXT NOT NULL CHECK (length(deletion_token_hash) = 64),
  idempotency_key_hash TEXT NOT NULL UNIQUE CHECK (length(idempotency_key_hash) = 64),
  payload_hash TEXT NOT NULL CHECK (length(payload_hash) = 64),
  created_at TEXT NOT NULL
);

CREATE TABLE conversation_messages (
  id TEXT PRIMARY KEY NOT NULL CHECK (id GLOB 'msg_*'),
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  message_index INTEGER NOT NULL CHECK (message_index >= 0 AND message_index < 20),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  masked_content TEXT NOT NULL CHECK (length(masked_content) BETWEEN 1 AND 2000),
  source_ids_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (conversation_id, message_index)
);

CREATE INDEX situation_submissions_created_at_idx
  ON situation_submissions(created_at);
CREATE INDEX conversations_created_at_idx
  ON conversations(created_at);
CREATE INDEX conversation_messages_conversation_idx
  ON conversation_messages(conversation_id, message_index);
