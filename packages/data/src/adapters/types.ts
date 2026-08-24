/** Normalized, UI-facing models. They do not expose a publisher's raw schema. */
export type LocalResourceCategory = "school" | "medical" | "child_support" | "public_facility" | "housing" | "language" | "foreign_support";

export type LocalResource = {
  id: string;
  name: string;
  category: LocalResourceCategory;
  municipality: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  website?: string;
  description?: string;
  targetDescription?: string;
  sourceId: string;
  dataUpdatedAt?: string;
};

export type MunicipalityCrisisProfile = {
  municipalityCode: string;
  municipalityName: string;
  targetNationality: string;
  residentPopulation?: number;
  /** Provenance for the population figure; derived from the bundled JSON cache. */
  populationSourceId?: string;
  populationDataUpdatedAt?: string;
  populationFetchedAt?: string;
  ageDistribution?: Record<string, number>;
  resourceCounts: Partial<Record<LocalResourceCategory, number>>;
  coverageNotes: string[];
  dataGapIds: string[];
};

export type PopulationCacheRecord = {
  municipalityCode: string;
  municipalityName: string;
  targetNationality: string;
  residentPopulation: number;
  raw: Record<string, string>;
};

export type PopulationCache = {
  sourceId: string;
  fetchedAt: string;
  dataUpdatedAt: string;
  records: PopulationCacheRecord[];
  coverageNotes: string[];
};

/** A reproducible, bundled subset selected from source-backed Open Data rows. */
export type LocalResourcesCache = {
  fetchedAt: string;
  resources: LocalResource[];
  coverageNotes: string[];
};

export type DataGap = { id: string; category: string; title: string; description: string; whyItMatters: string };
