import assert from "node:assert/strict";
import test from "node:test";
import { CRISIS_NEEDS_COUNT_BUCKET, CRISIS_NEEDS_THRESHOLD, handleCrisisNeedsRequest } from "../src/index";

type Totals = { respondent_count: number; last_updated_at: string | null };
type Category = { category: string; respondent_count: number };

class CrisisStatement {
  values: unknown[] = [];
  constructor(readonly database: CrisisDatabase, readonly query: string) {}
  bind(...values: unknown[]): D1PreparedStatement { this.values = values; return this as unknown as D1PreparedStatement; }
  async first<T>(): Promise<T | null> { return this.database.totals as T; }
  async all<T>(): Promise<D1Result<T>> { return { results: this.database.categories as T[] } as D1Result<T>; }
}

class CrisisDatabase {
  readonly statements: CrisisStatement[] = [];
  constructor(readonly totals: Totals, readonly categories: Category[] = [], readonly failure = false) {}
  prepare(query: string): D1PreparedStatement {
    if (this.failure) throw new Error("D1 unavailable");
    const statement = new CrisisStatement(this, query);
    this.statements.push(statement);
    return statement as unknown as D1PreparedStatement;
  }
}

function request(query = "municipality=13117&period=30d&view=needs", method = "GET") {
  return new Request(`https://municipality.example/api/crisis/needs?${query}`, { method });
}

const now = new Date("2026-08-23T12:00:00.000Z");

test("suppresses the complete aggregate at four respondents", async () => {
  const database = new CrisisDatabase({ respondent_count: 4, last_updated_at: "2026-08-23T10:00:00.000Z" });
  const response = await handleCrisisNeedsRequest(request(), database as unknown as D1Database, { now });
  assert.equal(response?.status, 200);
  const body = await response?.json() as { ok: true; data: Record<string, unknown> };
  assert.equal(body.data.availability, "below_threshold");
  assert.equal(body.data.freshness, "stale");
  assert.equal(body.data.threshold, CRISIS_NEEDS_THRESHOLD);
  assert.equal("respondentCount" in body.data, false);
  assert.equal("lastUpdatedAt" in body.data, false);
  assert.deepEqual(body.data.categories, []);
  assert.equal(database.statements.length, 1);
});

test("returns the aggregate at five respondents and suppresses categories below k", async () => {
  const database = new CrisisDatabase(
    { respondent_count: 5, last_updated_at: "2026-08-23T10:00:00.000Z" },
    [{ category: "medical", respondent_count: 5 }, { category: "education", respondent_count: 4 }, { category: "untrusted", respondent_count: 99 }],
  );
  const response = await handleCrisisNeedsRequest(request(), database as unknown as D1Database, { now });
  const body = await response?.json() as { ok: true; data: Record<string, unknown> };
  assert.equal(body.data.availability, "available");
  assert.equal(body.data.freshness, "fresh");
  assert.equal(body.data.respondentCount, 5);
  assert.equal(body.data.countBucketSize, CRISIS_NEEDS_COUNT_BUCKET);
  assert.equal(body.data.hasSuppressedCategories, true);
  assert.equal(body.data.lastUpdatedAt, "2026-08-23");
  assert.deepEqual(body.data.categories, [{ key: "medical", respondentCount: 5 }]);
  assert.match(database.statements[1]?.query ?? "", /json_each\(situation_submissions\.needs_json\)/);
  assert.match(database.statements[1]?.query ?? "", /COUNT\(DISTINCT situation_submissions\.id\)/);
});

test("keeps the needs total while withholding small multi-select cells", async () => {
  const database = new CrisisDatabase(
    { respondent_count: 12, last_updated_at: "2026-08-23T10:00:00.000Z" },
    [{ category: "medical", respondent_count: 10 }, { category: "consultation", respondent_count: 3 }, { category: "language", respondent_count: 2 }],
  );
  const response = await handleCrisisNeedsRequest(request(), database as unknown as D1Database, { now });
  const body = await response?.json() as { ok: true; data: Record<string, unknown> };
  assert.equal(body.data.respondentCount, 10);
  assert.equal(body.data.hasSuppressedCategories, true);
  assert.deepEqual(body.data.categories, [{ key: "medical", respondentCount: 10 }]);
});

test("does not treat zero-count categories as suppressed on an exclusive axis", async () => {
  const database = new CrisisDatabase(
    { respondent_count: 5, last_updated_at: "2026-08-23T10:00:00.000Z" },
    [{ category: "hotel", respondent_count: 5 }, { category: "unstable", respondent_count: 0 }],
  );
  const response = await handleCrisisNeedsRequest(request("municipality=13117&period=30d&view=accommodation"), database as unknown as D1Database, { now });
  const body = await response?.json() as { ok: true; data: Record<string, unknown> };
  assert.equal(body.data.availability, "available");
  assert.equal(body.data.hasSuppressedCategories, false);
  assert.equal(body.data.respondentCount, 5);
  assert.deepEqual(body.data.categories, [{ key: "hotel", respondentCount: 5 }]);
});

test("withholds total and smallest published cell on an exclusive axis with a suppressed cell", async () => {
  const database = new CrisisDatabase(
    { respondent_count: 6, last_updated_at: "2026-08-23T10:00:00.000Z" },
    [{ category: "hotel", respondent_count: 5 }, { category: "unstable", respondent_count: 1 }],
  );
  const response = await handleCrisisNeedsRequest(request("municipality=13117&period=30d&view=accommodation"), database as unknown as D1Database, { now });
  const body = await response?.json() as { ok: true; data: Record<string, unknown> };
  assert.equal(body.data.availability, "available");
  assert.deepEqual(body.data.categories, []);
  assert.equal("respondentCount" in body.data, false);
  assert.equal(body.data.hasSuppressedCategories, true);
});

test("applies the same complementary suppression to departure windows", async () => {
  const database = new CrisisDatabase(
    { respondent_count: 7, last_updated_at: "2026-08-23T10:00:00.000Z" },
    [{ category: "within_7_days", respondent_count: 6 }, { category: "within_30_days", respondent_count: 1 }],
  );
  const response = await handleCrisisNeedsRequest(request("municipality=13117&period=30d&view=departure_window"), database as unknown as D1Database, { now });
  const body = await response?.json() as { ok: true; data: Record<string, unknown> };
  assert.deepEqual(body.data.categories, []);
  assert.equal("respondentCount" in body.data, false);
  assert.equal(body.data.hasSuppressedCategories, true);
});

test("applies complementary suppression for positive cells below the threshold", async () => {
  const database = new CrisisDatabase(
    { respondent_count: 5, last_updated_at: "2026-08-23T10:00:00.000Z" },
    [{ category: "hotel", respondent_count: 5 }, { category: "unstable", respondent_count: 1 }],
  );
  const response = await handleCrisisNeedsRequest(request("municipality=13117&period=30d&view=accommodation"), database as unknown as D1Database, { now });
  const body = await response?.json() as { ok: true; data: Record<string, unknown> };
  assert.equal(body.data.availability, "available");
  assert.deepEqual(body.data.categories, []);
  assert.equal("respondentCount" in body.data, false);
  assert.equal(body.data.hasSuppressedCategories, true);
});

test("hides every published cell when several cells are suppressed on an exclusive axis", async () => {
  const database = new CrisisDatabase(
    { respondent_count: 12, last_updated_at: "2026-08-23T10:00:00.000Z" },
    [{ category: "difficult", respondent_count: 7 }, { category: "possible", respondent_count: 3 }, { category: "unknown", respondent_count: 2 }],
  );
  const response = await handleCrisisNeedsRequest(request("municipality=13117&period=30d&view=return_status"), database as unknown as D1Database, { now });
  const body = await response?.json() as { ok: true; data: Record<string, unknown> };
  assert.deepEqual(body.data.categories, []);
  assert.equal("respondentCount" in body.data, false);
  assert.equal(body.data.hasSuppressedCategories, true);
});

test("keeps only cells that stay publishable after complementary suppression", async () => {
  const database = new CrisisDatabase(
    { respondent_count: 24, last_updated_at: "2026-08-23T10:00:00.000Z" },
    [{ category: "possible", respondent_count: 12 }, { category: "difficult", respondent_count: 8 }, { category: "unknown", respondent_count: 4 }],
  );
  const response = await handleCrisisNeedsRequest(request("municipality=13117&period=30d&view=return_status"), database as unknown as D1Database, { now });
  const body = await response?.json() as { ok: true; data: Record<string, unknown> };
  assert.deepEqual(body.data.categories, [{ key: "possible", respondentCount: 10 }]);
  assert.equal("respondentCount" in body.data, false);
  assert.equal(body.data.hasSuppressedCategories, true);
});

test("buckets a six-count published cell instead of exposing the exact count", async () => {
  const database = new CrisisDatabase(
    { respondent_count: 6, last_updated_at: "2026-08-23T10:00:00.000Z" },
    [{ category: "hotel", respondent_count: 6 }],
  );
  const response = await handleCrisisNeedsRequest(request("municipality=13117&period=30d&view=accommodation"), database as unknown as D1Database, { now });
  const body = await response?.json() as { ok: true; data: Record<string, unknown> };
  assert.equal(body.data.hasSuppressedCategories, false);
  assert.equal(body.data.respondentCount, 5);
  assert.deepEqual(body.data.categories, [{ key: "hotel", respondentCount: 5 }]);
});

test("publishes every cell and the total when no exclusive-axis cell is suppressed", async () => {
  const database = new CrisisDatabase(
    { respondent_count: 20, last_updated_at: "2026-08-23T10:00:00.000Z" },
    [{ category: "possible", respondent_count: 10 }, { category: "difficult", respondent_count: 5 }, { category: "unknown", respondent_count: 5 }],
  );
  const response = await handleCrisisNeedsRequest(request("municipality=13117&period=30d&view=return_status"), database as unknown as D1Database, { now });
  const body = await response?.json() as { ok: true; data: Record<string, unknown> };
  assert.deepEqual(body.data.categories, [
    { key: "possible", respondentCount: 10 },
    { key: "difficult", respondentCount: 5 },
    { key: "unknown", respondentCount: 5 },
  ]);
  assert.equal(body.data.respondentCount, 20);
  assert.equal(body.data.hasSuppressedCategories, false);
});

test("keeps the 0/1/4/5/6 respondent boundary contract", async () => {
  const cases = [
    { count: 0, availability: "no_data", reportableCount: undefined },
    { count: 1, availability: "below_threshold", reportableCount: undefined },
    { count: 4, availability: "below_threshold", reportableCount: undefined },
    { count: 5, availability: "available", reportableCount: 5 },
    { count: 6, availability: "available", reportableCount: 5 },
  ] as const;

  for (const { count, availability, reportableCount } of cases) {
    const database = new CrisisDatabase(
      { respondent_count: count, last_updated_at: count === 0 ? null : "2026-08-23T10:00:00.000Z" },
      count >= CRISIS_NEEDS_THRESHOLD ? [{ category: "possible", respondent_count: count }] : [],
    );
    const response = await handleCrisisNeedsRequest(request("municipality=13117&period=30d&view=return_status"), database as unknown as D1Database, { now });
    const body = await response?.json() as { ok: true; data: Record<string, unknown> };
    assert.equal(body.data.availability, availability, `count=${count}`);
    assert.equal(body.data.respondentCount, reportableCount, `count=${count}`);
    assert.equal(body.data.countBucketSize, CRISIS_NEEDS_COUNT_BUCKET, `count=${count}`);
  }
});

test("uses the same lower-bound bucket across 7d, 30d, and 90d instead of exposing small deltas", async () => {
  const results = await Promise.all([
    ["7d", 10],
    ["30d", 11],
    ["90d", 14],
  ].map(async ([period, count]) => {
    const database = new CrisisDatabase(
      { respondent_count: count, last_updated_at: "2026-08-23T10:00:00.000Z" },
      [{ category: "possible", respondent_count: count }],
    );
    const response = await handleCrisisNeedsRequest(request(`municipality=13117&period=${period}&view=return_status`), database as unknown as D1Database, { now });
    return response?.json() as Promise<{ ok: true; data: Record<string, unknown> }>;
  }));

  for (const result of results) {
    const body = await result;
    assert.equal(body.data.countBucketSize, CRISIS_NEEDS_COUNT_BUCKET);
    assert.equal(body.data.respondentCount, 10);
    assert.deepEqual(body.data.categories, [{ key: "possible", respondentCount: 10 }]);
    assert.match(String(body.data.coverageNote), /5件幅の下限バケット/);
    assert.match(String(body.data.limitations), /7日・30日・90日/);
  }
});

test("reports no data without an aggregate count and marks old reportable data stale", async () => {
  const empty = await handleCrisisNeedsRequest(request(), new CrisisDatabase({ respondent_count: 0, last_updated_at: null }) as unknown as D1Database, { now });
  assert.ok(empty);
  const emptyBody = await empty.json() as { data: { availability: string } };
  assert.equal(emptyBody.data.availability, "no_data");
  const stale = await handleCrisisNeedsRequest(request("municipality=13117&period=30d&view=return_status"), new CrisisDatabase({ respondent_count: 5, last_updated_at: "2026-08-10T10:00:00.000Z" }, [{ category: "difficult", respondent_count: 5 }]) as unknown as D1Database, { now });
  assert.ok(stale);
  const staleBody = await stale.json() as { data: { freshness: string; lastUpdatedAt: string } };
  assert.equal(staleBody.data.freshness, "stale");
  assert.equal(staleBody.data.lastUpdatedAt, "2026-08-10");
});

test("uses fixed columns, a Tokyo-period bind value, and never queries conversations", async () => {
  const database = new CrisisDatabase({ respondent_count: 5, last_updated_at: "2026-08-23T10:00:00.000Z" }, [{ category: "hotel", respondent_count: 5 }]);
  await handleCrisisNeedsRequest(request("municipality=13117&period=30d&view=accommodation"), database as unknown as D1Database, { now });
  assert.match(database.statements[0]?.query ?? "", /FROM situation_submissions/);
  assert.match(database.statements[1]?.query ?? "", /SELECT accommodation AS category/);
  assert.deepEqual(database.statements[0]?.values, ["13117", "2026-07-24T15:00:00.000Z"]);
  assert.ok(database.statements.every((statement) => !/conversation/i.test(statement.query)));
});

test("rejects unsupported methods and every non-allowlisted, duplicate, or free-form parameter", async () => {
  const database = new CrisisDatabase({ respondent_count: 5, last_updated_at: "2026-08-23T10:00:00.000Z" });
  const badQueries = ["municipality=13117&period=30d&view=needs&view=accommodation", "municipality=13117&period=30d&view=needs&axis=anything", "municipality=99999&period=30d&view=needs", "municipality=13117&period=1y&view=needs", "municipality=13117&period=30d&view=needs%3BDROP%20TABLE"];
  for (const query of badQueries) {
    const response = await handleCrisisNeedsRequest(request(query), database as unknown as D1Database, { now });
    assert.equal(response?.status, 400, query);
  }
  const method = await handleCrisisNeedsRequest(request(undefined, "POST"), database as unknown as D1Database, { now });
  assert.equal(method?.status, 405);
  assert.equal(method?.headers.get("allow"), "GET");
  assert.equal(database.statements.length, 0);
});

test("returns a generic 503 when D1 fails", async () => {
  const response = await handleCrisisNeedsRequest(request(), new CrisisDatabase({ respondent_count: 0, last_updated_at: null }, [], true) as unknown as D1Database, { now });
  assert.equal(response?.status, 503);
  const body = await response?.text() ?? "";
  assert.match(body, /SERVICE_UNAVAILABLE/);
  assert.doesNotMatch(body, /D1 unavailable|situation_submissions/);
});

test("returns a generic 503 when the Crisis View binding is absent", async () => {
  const response = await handleCrisisNeedsRequest(request(), undefined, { now });
  assert.equal(response?.status, 503);
  assert.deepEqual(await response?.json(), {
    ok: false,
    error: { code: "SERVICE_UNAVAILABLE", message: "The service is temporarily unavailable." },
  });
});
