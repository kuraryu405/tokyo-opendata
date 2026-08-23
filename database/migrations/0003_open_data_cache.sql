CREATE TABLE open_data_sources (
  source_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  publisher TEXT NOT NULL,
  source_url TEXT NOT NULL,
  landing_page_url TEXT NOT NULL,
  landing_page_updated_at TEXT NOT NULL,
  catalog_url TEXT NOT NULL,
  license TEXT NOT NULL,
  license_url TEXT NOT NULL,
  terms_url TEXT NOT NULL,
  attribution TEXT NOT NULL,
  update_frequency TEXT NOT NULL,
  coverage_note TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE TABLE open_data_dataset_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL REFERENCES open_data_sources(source_id),
  version_hash TEXT NOT NULL,
  data_updated_at TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  etag TEXT,
  row_count INTEGER NOT NULL CHECK (row_count >= 50 AND row_count <= 200),
  status TEXT NOT NULL CHECK (status IN ('staged', 'active', 'inactive')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (source_id, version_hash),
  UNIQUE (source_id, id)
) STRICT;

CREATE TABLE open_data_resources (
  dataset_version_id INTEGER NOT NULL REFERENCES open_data_dataset_versions(id) ON DELETE CASCADE,
  resource_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0 AND ordinal < 200),
  category TEXT NOT NULL,
  municipality TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  latitude REAL NOT NULL CHECK (latitude >= 35.70 AND latitude <= 35.85),
  longitude REAL NOT NULL CHECK (longitude >= 139.65 AND longitude <= 139.85),
  description TEXT,
  PRIMARY KEY (dataset_version_id, resource_id)
) STRICT;

CREATE TABLE open_data_active_datasets (
  source_id TEXT PRIMARY KEY REFERENCES open_data_sources(source_id),
  dataset_version_id INTEGER NOT NULL,
  activated_at TEXT NOT NULL,
  FOREIGN KEY (source_id, dataset_version_id)
    REFERENCES open_data_dataset_versions(source_id, id)
) STRICT;

CREATE TABLE open_data_import_runs (
  run_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES open_data_sources(source_id),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'not_modified', 'failed')),
  dry_run INTEGER NOT NULL CHECK (dry_run IN (0, 1)),
  http_status INTEGER,
  version_hash TEXT,
  etag TEXT,
  row_count INTEGER,
  error_code TEXT
) STRICT;

CREATE INDEX open_data_resources_lookup
  ON open_data_resources(dataset_version_id, municipality, category, ordinal);
CREATE INDEX open_data_versions_by_source
  ON open_data_dataset_versions(source_id, created_at DESC);
CREATE INDEX open_data_runs_by_source
  ON open_data_import_runs(source_id, started_at DESC);
