import {
  selectableUserLocales,
  type LocalFilterKey,
  type SelectableUserLocale,
} from "@staybridge/i18n";

export const stayBridgeScreens = [
  "landing",
  "check",
  "status",
  "roadmap",
  "local",
  "help",
  "summary",
  "chat",
  "settings",
  "helpPrepare",
] as const;

export type StayBridgeScreen = (typeof stayBridgeScreens)[number] | "roadmapAction";
export type LocalFilter = LocalFilterKey;

export type StayBridgeQuery = {
  step?: number;
  filter?: LocalFilter;
  actionId?: string;
};

export type StayBridgeRoute = {
  locale: SelectableUserLocale;
  screen: StayBridgeScreen;
  query: StayBridgeQuery;
};

export type StayBridgeSearchParams =
  | string
  | URLSearchParams
  | Readonly<Record<string, string | string[] | undefined>>
  | { get(name: string): string | null };

export type ParsedStayBridgeRoute = {
  route: StayBridgeRoute;
  canonicalPath: string;
};

const localFilters = [
  "all",
  "school",
  "medical",
  "child_support",
  "public_facility",
] as const satisfies readonly LocalFilter[];

const screenBySegment: Record<string, StayBridgeScreen> = {
  check: "check",
  status: "status",
  roadmap: "roadmap",
  local: "local",
  help: "help",
  summary: "summary",
  chat: "chat",
  settings: "settings",
};

function actionIdToSlug(actionId: string): string {
  return actionId.toLowerCase().replaceAll("_", "-");
}

function slugToActionId(slug: string): string | null {
  const normalized = slug.toUpperCase().replaceAll("-", "_");
  return /^[A-Z0-9_]+$/.test(normalized) ? normalized : null;
}

export function isSelectableLocale(value: string | undefined): value is SelectableUserLocale {
  return selectableUserLocales.includes(value as SelectableUserLocale);
}

export function isValidStep(value: number | undefined): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 9;
}

export function isLocalFilter(value: string | undefined): value is LocalFilter {
  return localFilters.includes(value as LocalFilter);
}

export function buildStayBridgePath({
  locale,
  screen,
  query = {},
}: {
  locale: string;
  screen: StayBridgeScreen;
  query?: StayBridgeQuery;
}): string {
  const safeLocale = isSelectableLocale(locale) ? locale : "ja";
  let segment: string;
  if (screen === "landing") segment = "";
  else if (screen === "helpPrepare") segment = "/help/prepare";
  else if (screen === "roadmapAction") segment = query.actionId ? `/roadmap/action/${actionIdToSlug(query.actionId)}` : "/roadmap";
  else segment = `/${screen}`;
  const params = new URLSearchParams();

  if (screen === "check") {
    params.set("step", String(isValidStep(query.step) ? query.step : 0));
  }
  if (screen === "local") {
    params.set("filter", isLocalFilter(query.filter) ? query.filter : "all");
  }
  if (screen === "roadmapAction" && query.filter && isLocalFilter(query.filter)) {
    params.set("filter", query.filter);
  }

  const search = params.toString();
  const basePath = `/${safeLocale}${segment}`;
  return `${basePath}${search ? `?${search}` : ""}`;
}

export function parseStayBridgeRoute(
  pathname: string,
  searchParams?: StayBridgeSearchParams,
): ParsedStayBridgeRoute {
  const queryFromPath = pathname.includes("?") ? pathname.slice(pathname.indexOf("?") + 1) : undefined;
  const pathOnly = pathname.split("?", 1)[0] || "/";
  const segments = pathOnly.split("/").filter(Boolean);
  const requestedLocale = segments[0];
  const locale = isSelectableLocale(requestedLocale) ? requestedLocale : "ja";
  let screen: StayBridgeScreen = "landing";
  const query: StayBridgeQuery = {};
  const routeSearchParams = searchParams ?? queryFromPath;

  if (segments.length > 1) {
    const seg1 = segments[1];
    const seg2 = segments[2];
    const seg3 = segments[3];
    if (seg1 === "roadmap" && seg2 === "action" && seg3) {
      const actionId = slugToActionId(seg3);
      if (actionId) {
        screen = "roadmapAction";
        query.actionId = actionId;
      } else {
        screen = "roadmap";
      }
    } else if (seg1 === "help" && seg2 === "prepare") {
      screen = "helpPrepare";
    } else {
      screen = screenBySegment[seg1] ?? "landing";
    }
  }

  if (screen === "check") {
    const rawStep = readSearchParam(routeSearchParams, "step");
    const step = rawStep !== null && /^(?:0|[1-9])$/.test(rawStep) ? Number(rawStep) : 0;
    query.step = step;
  }
  if (screen === "local") {
    const rawFilter = readSearchParam(routeSearchParams, "filter");
    query.filter = rawFilter !== null && isLocalFilter(rawFilter) ? rawFilter : "all";
  }

  const route = { locale, screen, query } satisfies StayBridgeRoute;
  return { route, canonicalPath: buildStayBridgePath(route) };
}

export function canonicalizeStayBridgePath(
  pathname: string,
  searchParams?: StayBridgeSearchParams,
): string {
  return parseStayBridgeRoute(pathname, searchParams).canonicalPath;
}

export function equivalentStayBridgePath(left: string, right: string): boolean {
  const normalize = (value: string) => {
    const url = new URL(value, "https://staybridge.local");
    const pathname = url.pathname.length > 1
      ? url.pathname.replace(/\/+$/, "")
      : url.pathname;
    return `${pathname}${url.search}`;
  };
  return normalize(left) === normalize(right);
}

export function selectableLocalePath(
  locale: string,
  screen: StayBridgeScreen = "landing",
  query: StayBridgeQuery = {},
): string {
  return buildStayBridgePath({ locale, screen, query });
}

function readSearchParam(
  searchParams: StayBridgeSearchParams | undefined,
  name: string,
): string | null {
  if (!searchParams) return null;
  if (typeof searchParams === "string") return new URLSearchParams(searchParams).get(name);
  if (searchParams instanceof URLSearchParams) return searchParams.get(name);
  if (
    typeof searchParams === "object" &&
    "get" in searchParams &&
    typeof (searchParams as { get?: unknown }).get === "function"
  ) {
    return (searchParams as { get(name: string): string | null }).get(name);
  }
  const value = (searchParams as Readonly<Record<string, string | string[] | undefined>>)[name];
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}
