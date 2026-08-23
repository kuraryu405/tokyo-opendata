import assert from "node:assert/strict";
import test from "node:test";
import { CRISIS_NEEDS_THRESHOLD, handleCrisisNeedsRequest } from "../src/index";

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
  assert.equal(body.data.lastUpdatedAt, "2026-08-23");
  assert.deepEqual(body.data.categories, [{ key: "medical", respondentCount: 5 }]);
  assert.match(database.statements[1]?.query ?? "", /json_each\(situation_submissions\.needs_json\)/);
  assert.match(database.statements[1]?.query ?? "", /COUNT\(DISTINCT situation_submissions\.id\)/);
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
