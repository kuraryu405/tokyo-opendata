CREATE TABLE open_data_sources (
  source_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  publisher TEXT NOT NULL,
  source_url TEXT NOT NULL,
  catalog_url TEXT NOT NULL,
  license TEXT NOT NULL,
  license_url TEXT NOT NULL,
  terms_url TEXT NOT NULL,
  attribution TEXT NOT NULL,
  update_frequency TEXT NOT NULL,
  coverage_note TEXT NOT NULL,
  data_updated_at TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE TABLE open_data_dataset_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_key TEXT NOT NULL,
  version_hash TEXT NOT NULL,
  source_updated_at TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  row_count INTEGER NOT NULL CHECK (row_count = 12),
  status TEXT NOT NULL CHECK (status IN ('staged', 'active', 'inactive')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (dataset_key, version_hash),
  UNIQUE (dataset_key, id)
) STRICT;

CREATE TABLE open_data_resources (
  dataset_version_id INTEGER NOT NULL REFERENCES open_data_dataset_versions(id) ON DELETE CASCADE,
  resource_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0 AND ordinal < 12),
  category TEXT NOT NULL CHECK (category IN ('school', 'medical', 'child_support', 'public_facility')),
  municipality TEXT NOT NULL CHECK (municipality = 'Kita'),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  latitude REAL NOT NULL CHECK (latitude >= 35.70 AND latitude <= 35.85),
  longitude REAL NOT NULL CHECK (longitude >= 139.65 AND longitude <= 139.85),
  phone TEXT,
  website TEXT,
  source_id TEXT NOT NULL REFERENCES open_data_sources(source_id),
  data_updated_at TEXT NOT NULL,
  PRIMARY KEY (dataset_version_id, resource_id),
  UNIQUE (dataset_version_id, ordinal)
) STRICT;

CREATE TABLE open_data_active_datasets (
  dataset_key TEXT PRIMARY KEY,
  dataset_version_id INTEGER NOT NULL,
  activated_at TEXT NOT NULL,
  FOREIGN KEY (dataset_key, dataset_version_id)
    REFERENCES open_data_dataset_versions(dataset_key, id)
) STRICT;

CREATE TABLE open_data_import_runs (
  run_id TEXT PRIMARY KEY,
  dataset_key TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'not_modified', 'failed')),
  dry_run INTEGER NOT NULL CHECK (dry_run IN (0, 1)),
  version_hash TEXT,
  row_count INTEGER,
  error_code TEXT
) STRICT;

CREATE INDEX open_data_resources_lookup
  ON open_data_resources(dataset_version_id, municipality, category, ordinal);
CREATE INDEX open_data_versions_by_dataset
  ON open_data_dataset_versions(dataset_key, created_at DESC);
CREATE INDEX open_data_runs_by_dataset
  ON open_data_import_runs(dataset_key, started_at DESC);
