"use client";

import { sourceRegistry, type LocalResource, type LocalResourceId } from "@staybridge/data";
import { getLocalResourceDisplay } from "@staybridge/i18n/client";
import type { LocalFilter } from "../../routing/staybridge-routes";
import type { Locale } from "../staybridge-session";
import type { Screen, UserCopy } from "./screen-types";

export function LocalAction({ locale, t, resources, filter, setFilter, go }: { locale: Locale; t: UserCopy; resources: Array<LocalResource & { id: LocalResourceId }>; filter: LocalFilter; setFilter: (s: LocalFilter) => void; go: (screen: Screen) => void }) {
  const filters: LocalFilter[] = ["all", "school", "medical", "child_support", "public_facility"];
  return <section className="content-page"><div className="page-heading local-heading"><span className="section-label">{t.sectionLocalAction}</span><h1>{t.localTitle}</h1><p>{t.localIntro}</p><div className="location-pill">{t.localFallback}</div></div><div className="page-actions" aria-label={t.localNavigationLabel}><button className="secondary-button" onClick={() => go("roadmap")}>← {t.backToRoadmap}</button><button className="primary-button" onClick={() => go("help")}>{t.continueToHelp}<span aria-hidden>→</span></button></div><div className="filter-tabs">{filters.map((item) => <button aria-pressed={filter === item} className={filter === item ? "active" : ""} key={item} onClick={() => setFilter(item)}>{t[item as keyof UserCopy] as string}</button>)}</div>{resources.length ? <div className="resource-grid">{resources.map((resource) => <ResourceCard key={resource.id} resource={resource} locale={locale} t={t} />)}</div> : <div className="empty-state"><h2>{t.noResources}</h2><button className="secondary-button" onClick={() => setFilter("all")}>{t.all}</button></div>}</section>;
}

function ResourceCard({ resource, locale, t }: { resource: LocalResource & { id: LocalResourceId }; locale: Locale; t: UserCopy }) {
  const source = sourceRegistry[resource.sourceId];
  const updatedAt = resource.dataUpdatedAt ?? source?.dataUpdatedAt;
  const display = getLocalResourceDisplay(locale, resource.id);
  const icon = t.resourceIcons[resource.category as keyof UserCopy["resourceIcons"]];
  return <article className="resource-card"><div className={`resource-icon ${resource.category}`}>{icon}</div><div className="resource-main"><div className="resource-meta"><span>{t[resource.category as keyof UserCopy] as string}</span><span>{resource.municipality}</span></div><h2>{resource.name}</h2><p>{display.description}</p><dl><div><dt>{t.addressLabel}</dt><dd>{resource.address ?? t.unavailable}</dd></div>{resource.phone && <div><dt>{t.phoneLabel}</dt><dd><a href={`tel:${resource.phone}`}>{resource.phone}</a></dd></div>}</dl>{resource.category === "school" && <p className="resource-disclaimer">i {t.schoolNote}</p>}<details className="resource-source"><summary>{t.sourceLabel}</summary><a href={source?.url || resource.website || "#"} target="_blank" rel="noreferrer">{source?.title || t.publicDataLabel}</a><small>{source?.publisher ?? t.publicDataLabel}</small>{source?.license && <small>{source.licenseUrl ? <a href={source.licenseUrl} target="_blank" rel="noreferrer">LICENSE: {source.license}</a> : `LICENSE: ${source.license}`}</small>}{source?.adaptation === "selected_and_normalized" && <small>{t.changesMade}</small>}<small>{t.updated}: {updatedAt ?? t.unavailable}</small><small>{t.fetched}: {source?.fetchedAt ?? t.unavailable}</small></details>{resource.website && <a className="card-link" href={resource.website} target="_blank" rel="noreferrer">{t.details} ↗</a>}</div></article>;
}
