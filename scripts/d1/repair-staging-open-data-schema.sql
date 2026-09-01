CREATE TABLE legacy_open_data_sources_20260823 AS
  SELECT * FROM open_data_sources;
CREATE TABLE legacy_open_data_dataset_versions_20260823 AS
  SELECT * FROM open_data_dataset_versions;
CREATE TABLE legacy_open_data_resources_20260823 AS
  SELECT * FROM open_data_resources;
CREATE TABLE legacy_open_data_active_datasets_20260823 AS
  SELECT * FROM open_data_active_datasets;
CREATE TABLE legacy_open_data_import_runs_20260823 AS
  SELECT * FROM open_data_import_runs;

DROP TABLE open_data_import_runs;
DROP TABLE open_data_active_datasets;
DROP TABLE open_data_resources;
DROP TABLE open_data_dataset_versions;
DROP TABLE open_data_sources;
