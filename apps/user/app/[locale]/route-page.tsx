import { redirect } from "next/navigation";
import { StayBridgeApp } from "../../src/components/StayBridgeApp";
import { getTokyoAssessmentDate } from "../../src/assessment-date";
import {
  parseStayBridgeRoute,
  type StayBridgeSearchParams,
  type StayBridgeScreen,
} from "../../src/routing/staybridge-routes";

export type LocalePageProps = {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export function renderStayBridgePage(
  { params, searchParams }: LocalePageProps,
  screen: StayBridgeScreen,
) {
  return <StayBridgePageContent params={params} searchParams={searchParams} screen={screen} />;
}

async function StayBridgePageContent({
  params,
  searchParams,
  screen,
}: LocalePageProps & { screen: StayBridgeScreen }) {
  const [{ locale }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>),
  ]);
  const requestedPath = buildRequestedPath(locale, screen, resolvedSearchParams);
  const parsed = parseStayBridgeRoute(requestedPath, resolvedSearchParams);

  if (requestedPath !== parsed.canonicalPath) redirect(parsed.canonicalPath);
  return <StayBridgeApp route={parsed.route} assessmentDate={getTokyoAssessmentDate()} />;
}

function buildRequestedPath(
  locale: string,
  screen: StayBridgeScreen,
  searchParams: StayBridgeSearchParams,
): string {
  if (screen === "helpPrepare") {
    const base = `/${locale}/help/prepare`;
    const queryString = searchParamsToString(searchParams);
    return `${base}${queryString ? `?${queryString}` : ""}`;
  }
  if (screen === "roadmapAction") {
    const base = `/${locale}/roadmap`;
    const queryString = searchParamsToString(searchParams);
    return `${base}${queryString ? `?${queryString}` : ""}`;
  }
  let segment: string;
  if (screen === "landing") segment = "";
  else segment = `/${screen}`;
  const queryString = searchParamsToString(searchParams);
  return `/${locale}${segment}${queryString ? `?${queryString}` : ""}`;
}

function searchParamsToString(searchParams: StayBridgeSearchParams): string {
  const query = new URLSearchParams();
  if (typeof searchParams === "string") {
    for (const [key, value] of new URLSearchParams(searchParams)) query.append(key, value);
  } else if (
    typeof searchParams === "object" &&
    searchParams !== null &&
    "forEach" in searchParams &&
    typeof (searchParams as { forEach?: unknown }).forEach === "function"
  ) {
    (searchParams as URLSearchParams).forEach((value, key) => query.append(key, value));
  } else if (typeof searchParams === "object" && searchParams !== null && !("get" in searchParams)) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (Array.isArray(value)) {
        for (const item of value) query.append(key, item);
      } else if (value !== undefined) {
        query.set(key, value);
      }
    }
  }
  return query.toString();
}
