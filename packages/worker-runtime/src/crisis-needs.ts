import {
  createApiErrorResponse,
  createApiSuccessResponse,
  createMethodNotAllowedResponse,
} from "./index";

/** Minimum respondents required before an aggregate can be displayed. */
export const CRISIS_NEEDS_THRESHOLD = 5;
/** Published counts use fixed-width lower-bound buckets to limit period differencing. */
export const CRISIS_NEEDS_COUNT_BUCKET = 5;
/** An aggregate is stale when no safely reportable response was received for 7 Tokyo calendar days. */
export const CRISIS_NEEDS_FRESHNESS_DAYS = 7;

const crisisNeedsPath = "/api/crisis/needs";
const municipalityCode = "13117";
const periods = new Set(["7d", "30d", "90d"] as const);
const views = new Set(["needs", "return_status", "departure_window", "accommodation"] as const);

const categoryValues = {
  needs: ["stay", "consultation", "accommodation", "living_cost", "employment", "education", "childcare", "medical", "language", "daily_life"],
  return_status: ["possible", "difficult", "unknown"],
  departure_window: ["within_7_days", "within_30_days", "within_3_months", "no_departure_plan", "unknown"],
  accommodation: ["hotel", "family_or_friend", "rental", "temporary_facility", "unstable", "prefer_not_to_say"],
} as const;

type CrisisPeriod = "7d" | "30d" | "90d";
type CrisisView = keyof typeof categoryValues;
type Availability = "available" | "no_data" | "below_threshold";
type Freshness = "fresh" | "stale";

type AggregateTotal = {
  respondent_count: number | string;
  last_updated_at: string | null;
};

type AggregateCategory = {
  category: string;
  respondent_count: number | string;
};

export type CrisisNeedsData = {
  municipality: typeof municipalityCode;
  period: CrisisPeriod;
  view: CrisisView;
  availability: Availability;
  freshness: Freshness;
  threshold: typeof CRISIS_NEEDS_THRESHOLD;
  /** Every published count is the lower edge of this bucket, never an exact count. */
  countBucketSize: typeof CRISIS_NEEDS_COUNT_BUCKET;
  coverageNote: string;
  limitations: string[];
  categories: Array<{ key: string; respondentCount: number }>;
  /** True when at least one category cell was withheld from the returned view. Never reveals which or how many. */
  hasSuppressedCategories?: boolean;
  respondentCount?: number;
  /** Tokyo calendar date, deliberately coarsened from the most recent submission timestamp. */
  lastUpdatedAt?: string;
};

export type CrisisNeedsOptions = {
  now?: Date;
};

const coverageNote = "同意済みのSituation Check任意回答だけを自治体単位で匿名集計しています。表示する件数は5件幅の下限バケットで、少数セルや排他的な区分の総数は推測を防ぐため表示を控えています。";
const limitations = [
  "母集団ではなく、人口・不足・優先度・サービス提供能力を示しません。",
  "1〜4件の実在する区分は表示しません。排他的な区分では、推測を防ぐため総数と追加の公開セルも表示しません。回答が0件の区分は抑制セルではありません。",
  "表示する件数は5件幅で切り下げた下限値です。7日・30日・90日を比較しても、実際の小さな増減や差分を表示値から正確に確定できない契約です。",
  "困りごとは複数選択のため区分の合計は回答者数にならず、排他的な区分と同じ差し引きはできません。",
  "会話、個票、住所、位置情報、国籍は集計・表示しません。",
];

export async function handleCrisisNeedsRequest(
  request: Request,
  db: D1Database | undefined,
  options: CrisisNeedsOptions = {},
): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== crisisNeedsPath) {
    return createApiErrorResponse(
      { code: "NOT_FOUND", message: "The requested endpoint was not found." },
      404,
    );
  }
  if (request.method !== "GET") return createMethodNotAllowedResponse("GET");

  const parsed = parseRequest(url.searchParams);
  if (!parsed) {
    return createApiErrorResponse(
      { code: "INVALID_REQUEST", message: "municipality, period, and view must each be provided once with an allowed value." },
      400,
    );
  }
  if (!db) return crisisNeedsUnavailableResponse();

  const now = options.now ?? new Date();
  const periodStart = startOfTokyoPeriod(now, parsed.period);
  try {
    // This read contract intentionally names situation_submissions only. Do not add
    // conversation tables or joins here: conversations are never Crisis View input.
    const total = await db.prepare(
      `SELECT COUNT(DISTINCT id) AS respondent_count, MAX(created_at) AS last_updated_at
       FROM situation_submissions
       WHERE municipality_code = ? AND created_at >= ?`,
    ).bind(municipalityCode, periodStart).first<AggregateTotal>();

    const respondentCount = Number(total?.respondent_count ?? 0);
    const availability = respondentCount === 0
      ? "no_data"
      : respondentCount < CRISIS_NEEDS_THRESHOLD
        ? "below_threshold"
        : "available";
    const lastUpdatedAt = availability === "available"
      ? toTokyoCalendarDate(total?.last_updated_at)
      : undefined;
    const freshness = lastUpdatedAt && isFresh(total?.last_updated_at, now) ? "fresh" : "stale";

    const fullCategories = availability === "available"
      ? await queryFullCategories(db, parsed.view, periodStart)
      : [];
    const shaped = shapeCategories(parsed.view, fullCategories);

    const data: CrisisNeedsData = {
      municipality: municipalityCode,
      period: parsed.period,
      view: parsed.view,
      availability,
      freshness,
      threshold: CRISIS_NEEDS_THRESHOLD,
      countBucketSize: CRISIS_NEEDS_COUNT_BUCKET,
      coverageNote,
      limitations,
      categories: shaped.categories,
    };
    if (availability === "available") {
      data.hasSuppressedCategories = shaped.hasSuppressedCategories;
      if (!shaped.withholdTotal) data.respondentCount = toReportableCount(respondentCount);
      if (lastUpdatedAt) data.lastUpdatedAt = lastUpdatedAt;
    }
    return createApiSuccessResponse(data);
  } catch {
    return crisisNeedsUnavailableResponse();
  }
}

function crisisNeedsUnavailableResponse(): Response {
  return createApiErrorResponse(
    { code: "SERVICE_UNAVAILABLE", message: "The service is temporarily unavailable." },
    503,
  );
}

function parseRequest(searchParams: URLSearchParams): { period: CrisisPeriod; view: CrisisView } | null {
  const expectedKeys = new Set(["municipality", "period", "view"]);
  const seen = new Set<string>();
  for (const [key] of searchParams) {
    if (!expectedKeys.has(key) || seen.has(key)) return null;
    seen.add(key);
  }
  if (seen.size !== expectedKeys.size) return null;

  const municipality = searchParams.get("municipality");
  const period = searchParams.get("period");
  const view = searchParams.get("view");
  if (municipality !== municipalityCode || !period || !views.has(view as CrisisView) || !periods.has(period as CrisisPeriod)) return null;
  return { period: period as CrisisPeriod, view: view as CrisisView };
}

type ShapedCategories = {
  categories: Array<{ key: string; respondentCount: number }>;
  hasSuppressedCategories: boolean;
  withholdTotal: boolean;
};

/**
 * Positive cells under the threshold are always omitted. Zero-count categories
 * are not cells and must not activate complementary suppression. Exclusive
 * single-choice axes partition the respondents, so a published total plus
 * published cells would reveal suppressed sums by subtraction: when any
 * positive cell on such an axis is withheld, the smallest published cell is
 * withheld as well and the total is omitted. The needs view keeps its total
 * because multi-select counts are not additive across respondents.
 */
function shapeCategories(view: CrisisView, full: Array<{ key: string; respondentCount: number }>): ShapedCategories {
  const observed = full
    .filter((category) => Number.isFinite(category.respondentCount) && category.respondentCount > 0)
    .sort(compareCategories);
  const published = observed.filter((category) => category.respondentCount >= CRISIS_NEEDS_THRESHOLD);
  const hasSuppressedCategories = observed.some(
    (category) => category.respondentCount < CRISIS_NEEDS_THRESHOLD,
  );
  if (view === "needs" || !hasSuppressedCategories) {
    return { categories: published.map(toReportableCategory), hasSuppressedCategories, withholdTotal: false };
  }
  return {
    categories: published.slice(0, published.length - 1).map(toReportableCategory),
    hasSuppressedCategories: true,
    withholdTotal: true,
  };
}

async function queryFullCategories(
  db: D1Database,
  view: CrisisView,
  periodStart: string,
): Promise<Array<{ key: string; respondentCount: number }>> {
  const statement = view === "needs"
    ? db.prepare(
      `SELECT json_each.value AS category, COUNT(DISTINCT situation_submissions.id) AS respondent_count
       FROM situation_submissions
       CROSS JOIN json_each(situation_submissions.needs_json)
       WHERE situation_submissions.municipality_code = ? AND situation_submissions.created_at >= ?
       GROUP BY json_each.value
       ORDER BY respondent_count DESC, category ASC`,
    )
    : db.prepare(categoryQueryFor(view));
  const result = await statement.bind(municipalityCode, periodStart).all<AggregateCategory>();
  const allowed = new Set<string>(categoryValues[view]);
  const counts = new Map<string, number>();
  for (const row of result.results ?? []) {
    const respondentCount = Number(row.respondent_count);
    if (allowed.has(row.category) && Number.isInteger(respondentCount) && respondentCount > 0) {
      counts.set(row.category, respondentCount);
    }
  }
  return [...counts.entries()]
    .map(([key, respondentCount]) => ({ key, respondentCount }))
    .sort(compareCategories);
}

function compareCategories(
  a: { key: string; respondentCount: number },
  b: { key: string; respondentCount: number },
): number {
  return b.respondentCount - a.respondentCount || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
}

function toReportableCategory(category: { key: string; respondentCount: number }): { key: string; respondentCount: number } {
  return { key: category.key, respondentCount: toReportableCount(category.respondentCount) };
}

function toReportableCount(count: number): number {
  return Math.floor(count / CRISIS_NEEDS_COUNT_BUCKET) * CRISIS_NEEDS_COUNT_BUCKET;
}

function categoryQueryFor(view: Exclude<CrisisView, "needs">): string {
  // The column is selected from a closed, code-owned set; request text never
  // reaches SQL interpolation.
  const column = {
    return_status: "return_status",
    departure_window: "departure_window",
    accommodation: "accommodation",
  }[view];
  return `SELECT ${column} AS category, COUNT(DISTINCT id) AS respondent_count
    FROM situation_submissions
    WHERE municipality_code = ? AND created_at >= ?
    GROUP BY ${column}
    ORDER BY respondent_count DESC, category ASC`;
}

function startOfTokyoPeriod(now: Date, period: CrisisPeriod): string {
  const days = Number.parseInt(period, 10);
  const today = tokyoDateParts(now);
  const calendar = new Date(Date.UTC(today.year, today.month - 1, today.day));
  calendar.setUTCDate(calendar.getUTCDate() - (days - 1));
  // D1 stores created_at as UTC ISO 8601 text. Bind the Tokyo midnight as the
  // equivalent UTC instant so SQLite's lexical comparison keeps the whole day.
  return new Date(calendar.getTime() - 9 * 60 * 60 * 1_000).toISOString();
}

function isFresh(lastUpdatedAt: string | null | undefined, now: Date): boolean {
  if (!lastUpdatedAt || Number.isNaN(new Date(lastUpdatedAt).getTime())) return false;
  const freshStart = startOfTokyoPeriod(now, `${CRISIS_NEEDS_FRESHNESS_DAYS}d` as CrisisPeriod);
  return lastUpdatedAt >= freshStart;
}

function toTokyoCalendarDate(timestamp: string | null | undefined): string | undefined {
  if (!timestamp || Number.isNaN(new Date(timestamp).getTime())) return undefined;
  const parts = tokyoDateParts(new Date(timestamp));
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function tokyoDateParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
}
