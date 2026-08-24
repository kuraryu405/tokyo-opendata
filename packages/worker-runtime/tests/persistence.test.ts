import assert from "node:assert/strict";
import test from "node:test";
import {
  CONVERSATION_CONSENT_VERSION,
  SITUATION_CONSENT_VERSION,
  createCapabilityNonce,
  handleConsentedPersistenceRequest,
  issueSignedCapability,
  maskDetectableContactData,
  persistVerifiedConversation,
  prepareLlmBoundMessages,
  type PersistenceEnv,
} from "../src/index";

const deletionToken = "A".repeat(43);
const persistencePolicy = {
  conversationModelId: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  trustedConversationSourceIds: new Set(["OFFICIAL_1"]),
};

type Existing = {
  id: string;
  payload_hash: string;
  deletion_token_hash: string;
  contribution_state?: "accepted" | "quarantined";
  capability_nonce_hash?: string;
};

type IssuedCapability = {
  version: number;
  scope: string;
  expiresAt: string;
  consumedAt: string | null;
  consumedIdempotencyHash: string | null;
};

const capabilitySecret = "test-only-situation-capability-secret-2026";
const now = new Date("2026-08-24T10:00:00.000Z");

class FakeStatement {
  values: unknown[] = [];

  constructor(
    readonly database: FakeDatabase,
    readonly query: string,
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    this.values = values;
    return this as unknown as D1PreparedStatement;
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    if (this.query.includes("FROM situation_submission_capabilities")) {
      const capability = this.database.capabilities.get(String(this.values[0]));
      if (!capability) return null;
      return {
        capability_version: capability.version,
        scope: capability.scope,
        expires_at: capability.expiresAt,
        consumed_at: capability.consumedAt,
        consumed_idempotency_key_hash: capability.consumedIdempotencyHash,
      } as T;
    }
    const rows = this.query.includes("FROM situation_submissions")
      ? this.database.situations
      : this.database.conversations;
    return (rows.get(String(this.values[0])) ?? null) as T | null;
  }

  async run(): Promise<D1Result> {
    let changes = 0;
    if (this.query.includes("DELETE FROM situation_submission_capabilities")) {
      const expired = [...this.database.capabilities.entries()]
        .filter(([, capability]) => capability.expiresAt <= String(this.values[0]))
        .slice(0, 100);
      for (const [nonceHash] of expired) this.database.capabilities.delete(nonceHash);
      changes = expired.length;
    } else if (this.query.includes("INSERT INTO situation_submission_capabilities")) {
      this.database.capabilities.set(String(this.values[0]), {
        version: Number(this.values[1]),
        scope: String(this.values[2]),
        expiresAt: String(this.values[3]),
        consumedAt: null,
        consumedIdempotencyHash: null,
      });
      changes = 1;
    } else if (this.query.includes("INSERT INTO situation_submissions")) {
      const capability = this.database.capabilities.get(String(this.values[15]));
      const eligible = capability
        && capability.version === Number(this.values[16])
        && capability.scope === String(this.values[17])
        && capability.expiresAt === String(this.values[18])
        && capability.consumedAt === null
        && capability.expiresAt > String(this.values[19]);
      if (!eligible) return { success: true, meta: { changes: 0 } } as unknown as D1Result;
      if (this.database.situations.has(String(this.values[12]))) throw new Error("UNIQUE idempotency");
      this.database.situations.set(String(this.values[12]), {
        id: String(this.values[0]),
        deletion_token_hash: String(this.values[11]),
        payload_hash: String(this.values[13]),
        contribution_state: "accepted",
        capability_nonce_hash: String(this.values[15]),
      });
      changes = 1;
    } else if (this.query.includes("INSERT INTO conversations")) {
      this.database.conversations.set(String(this.values[5]), {
        id: String(this.values[0]),
        deletion_token_hash: String(this.values[4]),
        payload_hash: String(this.values[6]),
      });
      changes = 1;
    } else if (this.query.startsWith("DELETE FROM situation_submissions")) {
      changes = deleteByCredentials(this.database.situations, String(this.values[0]), String(this.values[1]));
    } else if (this.query.startsWith("DELETE FROM conversations")) {
      changes = deleteByCredentials(this.database.conversations, String(this.values[0]), String(this.values[1]));
    } else if (this.query.includes("INSERT INTO conversation_messages")) {
      this.database.messageStatements.push(this);
      changes = 1;
    } else if (this.query.includes("DELETE FROM conversation_messages")) {
      changes = 1;
    } else if (this.query.includes("UPDATE situation_submission_capabilities")) {
      const capability = this.database.capabilities.get(String(this.values[2]));
      if (
        capability
        && capability.version === Number(this.values[3])
        && capability.scope === String(this.values[4])
        && capability.expiresAt === String(this.values[5])
        && capability.consumedAt === null
        && capability.consumedIdempotencyHash === null
        && capability.expiresAt > String(this.values[6])
      ) {
        capability.consumedAt = String(this.values[0]);
        capability.consumedIdempotencyHash = String(this.values[1]);
        changes = 1;
      }
    }
    return { success: true, meta: { changes } } as unknown as D1Result;
  }
}

class FakeDatabase {
  readonly situations = new Map<string, Existing>();
  readonly capabilities = new Map<string, IssuedCapability>();
  readonly conversations = new Map<string, Existing>();
  readonly statements: FakeStatement[] = [];
  readonly messageStatements: FakeStatement[] = [];

  prepare(query: string): D1PreparedStatement {
    const statement = new FakeStatement(this, query);
    this.statements.push(statement);
    return statement as unknown as D1PreparedStatement;
  }

  async batch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
    return Promise.all(statements.map((statement) => (statement as unknown as FakeStatement).run()));
  }
}

function deleteByCredentials(rows: Map<string, Existing>, id: string, tokenHash: string): number {
  const entry = [...rows.entries()].find(([, value]) => value.id === id && value.deletion_token_hash === tokenHash);
  if (!entry) return 0;
  rows.delete(entry[0]);
  return 1;
}

function env(
  database = new FakeDatabase(),
  rateLimitSuccess: boolean | ((key: string) => boolean) = true,
): PersistenceEnv {
  return {
    STAYBRIDGE_DB: database as unknown as D1Database,
    PERSISTENCE_RATE_LIMITER: {
      limit: async ({ key }) => ({
        success: typeof rateLimitSuccess === "function" ? rateLimitSuccess(key) : rateLimitSuccess,
      }),
    },
    SITUATION_CAPABILITY_SECRET: capabilitySecret,
  };
}

function jsonRequest(path: string, body: unknown, headers: HeadersInit = {}): Request {
  return new Request(`https://staybridge.example${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://staybridge.example", ...headers },
    body: JSON.stringify(body),
  });
}

function situationBody() {
  return {
    consent: { accepted: true, version: SITUATION_CONSENT_VERSION },
    idempotencyKey: "situation_request_12345",
    deletionToken,
    answers: {
      municipalityCode: "13117",
      visitPurpose: "tourism",
      departureWindow: "within_7_days",
      returnStatus: "difficult",
      familyAgeGroups: ["6-11"],
      accommodation: "hotel",
      needs: ["education", "medical"],
      japaneseLevel: "beginner",
    },
  };
}

function capabilityRequest(headers: HeadersInit = {}): Request {
  return new Request("https://staybridge.example/api/situation-submission-capabilities", {
    method: "POST",
    headers: { origin: "https://staybridge.example", ...headers },
  });
}

async function issueCapability(environment: PersistenceEnv, issuedAt = now): Promise<string> {
  const response = await handleConsentedPersistenceRequest(
    capabilityRequest(),
    environment,
    { now: issuedAt },
  );
  assert.equal(response?.status, 201);
  const body = await response?.json() as { data: { capability: string } };
  return body.data.capability;
}

async function submitWithNewCapability(
  database: FakeDatabase,
  body = situationBody(),
  options: { now?: Date; environment?: PersistenceEnv } = {},
): Promise<Response | null> {
  const environment = options.environment ?? env(database);
  const requestTime = options.now ?? now;
  const capability = await issueCapability(environment, requestTime);
  return handleConsentedPersistenceRequest(
    jsonRequest("/api/situation-submissions", { ...body, capability }),
    environment,
    { now: requestTime },
  );
}

test("redacts detectable contact details and rejects document-like identifiers before LLM use", () => {
  const masked = maskDetectableContactData(
    "Email me at person@example.com, 090-1234-5678, or +44 20 7946 0958. I live at 東京都新宿区西新宿2-8-1, near 1600 Amphitheatre Parkway, Mountain View.",
  );
  assert.doesNotMatch(masked, /person@example|090-1234|赤羽1丁目/);
  assert.doesNotMatch(masked, /\+44 20 7946|西新宿2-8-1|1600 Amphitheatre/);
  assert.match(masked, /REDACTED_EMAIL/);
  assert.match(masked, /REDACTED_PHONE/);
  assert.match(masked, /REDACTED_ADDRESS/);

  assert.deepEqual(
    prepareLlmBoundMessages([{ role: "user", content: "Passport number AB1234567" }], new Set()),
    { ok: false, highRisk: true },
  );
  assert.deepEqual(
    prepareLlmBoundMessages([{ role: "user", content: "AB12345678CD" }], new Set()),
    { ok: false, highRisk: true },
  );
  assert.deepEqual(
    prepareLlmBoundMessages([{ role: "user", content: "旅券番号 ＡＢ１２３４５６７" }], new Set()),
    { ok: false, highRisk: true },
  );
  assert.deepEqual(
    prepareLlmBoundMessages([{ role: "user", content: "Residence card AB 12345678 CD" }], new Set()),
    { ok: false, highRisk: true },
  );

  const normalized = prepareLlmBoundMessages([{
    role: "user",
    content: "連絡先は ｐｅｒｓｏｎ＠ｅｘａｍｐｌｅ．ｃｏｍ、０９０－１２３４－５６７８ です",
  }], new Set());
  assert.equal(normalized.ok, true);
  if (normalized.ok) {
    assert.equal(normalized.value[0].content, "連絡先は [REDACTED_EMAIL]、[REDACTED_PHONE] です");
  }
});

test("requires explicit versioned consent and strict situation fields", async () => {
  const database = new FakeDatabase();
  const body = situationBody();
  body.consent.accepted = false as true;
  const denied = await submitWithNewCapability(database, body);
  assert.equal(denied?.status, 400);
  assert.equal(database.statements.some((statement) => statement.query.includes("INSERT INTO situation_submissions (")), false);

  const extraField = situationBody() as ReturnType<typeof situationBody> & { exactAddress?: string };
  extraField.exactAddress = "must not be accepted";
  const invalid = await submitWithNewCapability(database, extraField);
  assert.equal(invalid?.status, 400);
  assert.equal(database.statements.some((statement) => statement.query.includes("INSERT INTO situation_submissions (")), false);
});

test("persists only allowlisted situation values with hashed tokens and idempotent duplicates", async () => {
  const database = new FakeDatabase();
  const environment = env(database);
  const capability = await issueCapability(environment);
  const requestBody = { ...situationBody(), capability };
  const first = await handleConsentedPersistenceRequest(
    jsonRequest("/api/situation-submissions", requestBody),
    environment,
    { now },
  );
  assert.equal(first?.status, 201);
  const firstBody = await first?.json() as { data: { id: string; created: boolean } };
  assert.match(firstBody.data.id, /^sit_/);
  assert.equal(firstBody.data.created, true);

  const insert = database.statements.find((statement) => statement.query.includes("INSERT INTO situation_submissions"));
  assert.ok(insert);
  assert.equal(insert.values[11], await digest(deletionToken));
  assert.notEqual(insert.values[11], deletionToken);
  assert.equal(database.situations.values().next().value?.contribution_state, "accepted");
  assert.equal(database.capabilities.values().next().value?.consumedAt, now.toISOString());
  assert.doesNotMatch(JSON.stringify(insert.values), /MMR|knownStayDeadline|passport/i);
  assert.equal(JSON.stringify(database.statements.map((statement) => statement.values)).includes(capability), false);

  const duplicate = await handleConsentedPersistenceRequest(
    jsonRequest("/api/situation-submissions", requestBody),
    environment,
    { now: new Date(now.getTime() + 10 * 60_000) },
  );
  assert.equal(duplicate?.status, 200);
  assert.deepEqual(await duplicate?.json(), {
    ok: true,
    data: { id: firstBody.data.id, created: false },
  });
});

test("rejects direct, missing-origin, malformed, expired, and unknown-version capabilities without raw persistence", async () => {
  const database = new FakeDatabase();
  const environment = env(database);
  const missingCapability = await handleConsentedPersistenceRequest(
    jsonRequest("/api/situation-submissions", situationBody()),
    environment,
    { now },
  );
  assert.equal(missingCapability?.status, 400);
  assert.ok(missingCapability);
  assert.equal((await missingCapability.json() as { error: { code: string } }).error.code, "CAPABILITY_REQUIRED");

  const noOrigin = await handleConsentedPersistenceRequest(
    new Request("https://staybridge.example/api/situation-submissions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(situationBody()),
    }),
    environment,
    { now },
  );
  assert.equal(noOrigin?.status, 400);
  assert.ok(noOrigin);
  assert.equal((await noOrigin.json() as { error: { code: string } }).error.code, "INVALID_REQUEST");

  const noOriginIssuance = await handleConsentedPersistenceRequest(
    new Request("https://staybridge.example/api/situation-submission-capabilities", { method: "POST" }),
    environment,
    { now },
  );
  assert.equal(noOriginIssuance?.status, 400);

  const crossOrigin = await handleConsentedPersistenceRequest(
    jsonRequest("/api/situation-submissions", situationBody(), { origin: "https://script.example" }),
    environment,
    { now },
  );
  assert.equal(crossOrigin?.status, 400);

  const malformed = await handleConsentedPersistenceRequest(
    jsonRequest("/api/situation-submissions", { ...situationBody(), capability: "not-a-capability" }),
    environment,
    { now },
  );
  assert.equal(malformed?.status, 400);
  assert.ok(malformed);
  assert.equal((await malformed.json() as { error: { code: string } }).error.code, "INVALID_CAPABILITY");

  const issuedCapability = await issueCapability(environment, now);
  const signatureIndex = issuedCapability.lastIndexOf(".") + 1;
  const tamperedCapability = `${issuedCapability.slice(0, signatureIndex)}${issuedCapability[signatureIndex] === "A" ? "B" : "A"}${issuedCapability.slice(signatureIndex + 1)}`;
  const tampered = await handleConsentedPersistenceRequest(
    jsonRequest("/api/situation-submissions", { ...situationBody(), capability: tamperedCapability }),
    environment,
    { now },
  );
  assert.equal(tampered?.status, 400);

  const expiredCapability = await issueCapability(environment, now);
  const expired = await handleConsentedPersistenceRequest(
    jsonRequest("/api/situation-submissions", { ...situationBody(), capability: expiredCapability }),
    environment,
    { now: new Date(now.getTime() + 301_000) },
  );
  assert.equal(expired?.status, 400);

  const unknownVersion = await issueSignedCapability(capabilitySecret, {
    version: 2,
    expiresAt: Math.floor(now.getTime() / 1_000) + 300,
    nonce: createCapabilityNonce(),
    scope: "situation:submit",
  });
  const unknown = await handleConsentedPersistenceRequest(
    jsonRequest("/api/situation-submissions", { ...situationBody(), capability: unknownVersion }),
    environment,
    { now },
  );
  assert.equal(unknown?.status, 400);

  const wrongScope = await issueSignedCapability(capabilitySecret, {
    version: 1,
    expiresAt: Math.floor(now.getTime() / 1_000) + 300,
    nonce: createCapabilityNonce(),
    scope: "chat:submit",
  });
  const scoped = await handleConsentedPersistenceRequest(
    jsonRequest("/api/situation-submissions", { ...situationBody(), capability: wrongScope }),
    environment,
    { now },
  );
  assert.equal(scoped?.status, 400);
  assert.equal(database.situations.size, 0);
});

test("consumes a capability once while preserving the exact idempotent retry", async () => {
  const database = new FakeDatabase();
  const environment = env(database);
  const capability = await issueCapability(environment);
  const firstBody = { ...situationBody(), capability };
  const first = await handleConsentedPersistenceRequest(
    jsonRequest("/api/situation-submissions", firstBody),
    environment,
    { now },
  );
  assert.equal(first?.status, 201);

  const retry = await handleConsentedPersistenceRequest(
    jsonRequest("/api/situation-submissions", firstBody),
    environment,
    { now: new Date(now.getTime() + 600_000) },
  );
  assert.equal(retry?.status, 200);

  const replay = await handleConsentedPersistenceRequest(
    jsonRequest("/api/situation-submissions", {
      ...firstBody,
      idempotencyKey: "situation_request_67890",
    }),
    environment,
    { now: new Date(now.getTime() + 1_000) },
  );
  assert.equal(replay?.status, 400);
  assert.ok(replay);
  assert.equal((await replay.json() as { error: { code: string } }).error.code, "INVALID_CAPABILITY");
  assert.equal(database.situations.size, 1);
});

test("consumes a fresh response-loss retry capability before returning the existing result", async () => {
  const database = new FakeDatabase();
  const environment = env(database);
  const originalCapability = await issueCapability(environment);
  const originalBody = { ...situationBody(), capability: originalCapability };
  const first = await handleConsentedPersistenceRequest(
    jsonRequest("/api/situation-submissions", originalBody),
    environment,
    { now },
  );
  assert.equal(first?.status, 201);

  const retryCapability = await issueCapability(environment, new Date(now.getTime() + 1_000));
  const retry = await handleConsentedPersistenceRequest(
    jsonRequest("/api/situation-submissions", { ...situationBody(), capability: retryCapability }),
    environment,
    { now: new Date(now.getTime() + 1_000) },
  );
  assert.equal(retry?.status, 200);
  assert.equal(database.capabilities.size, 2);
  assert.equal([...database.capabilities.values()].every((capability) => (
    capability.consumedIdempotencyHash === [...database.situations.keys()][0]
  )), true);

  const replay = await handleConsentedPersistenceRequest(
    jsonRequest("/api/situation-submissions", {
      ...situationBody(),
      idempotencyKey: "situation_request_after_recovery",
      capability: retryCapability,
    }),
    environment,
    { now: new Date(now.getTime() + 2_000) },
  );
  assert.equal(replay?.status, 400);
  assert.equal(database.situations.size, 1);
});

test("rejects expired and unknown fresh capabilities on an exact duplicate", async () => {
  const database = new FakeDatabase();
  const environment = env(database);
  const first = await submitWithNewCapability(database, situationBody(), { environment });
  assert.equal(first?.status, 201);

  const expiredCapability = await issueCapability(environment, now);
  const expired = await handleConsentedPersistenceRequest(
    jsonRequest("/api/situation-submissions", { ...situationBody(), capability: expiredCapability }),
    environment,
    { now: new Date(now.getTime() + 301_000) },
  );
  assert.equal(expired?.status, 400);

  const unknownCapability = await issueSignedCapability(capabilitySecret, {
    version: 1,
    expiresAt: Math.floor(now.getTime() / 1_000) + 300,
    nonce: createCapabilityNonce(),
    scope: "situation:submit",
  });
  const unknown = await handleConsentedPersistenceRequest(
    jsonRequest("/api/situation-submissions", { ...situationBody(), capability: unknownCapability }),
    environment,
    { now },
  );
  assert.equal(unknown?.status, 400);
  assert.equal(database.situations.size, 1);
});

test("keeps the submission acceptance ceiling independent from repeated capability issuance", async () => {
  const database = new FakeDatabase();
  let acceptedSubmissionAttempts = 0;
  const rateLimitKeys: string[] = [];
  const environment = env(database, (key) => {
    rateLimitKeys.push(key);
    if (!key.includes("create:situation:")) return true;
    acceptedSubmissionAttempts += 1;
    return acceptedSubmissionAttempts <= 1;
  });
  const first = await submitWithNewCapability(database, situationBody(), { environment });
  const secondBody = { ...situationBody(), idempotencyKey: "situation_request_99999" };
  const second = await submitWithNewCapability(database, secondBody, { environment });

  assert.equal(first?.status, 201);
  assert.equal(second?.status, 429);
  assert.equal(database.capabilities.size, 2);
  assert.equal(database.situations.size, 1);
  assert.ok(rateLimitKeys.some((key) => key.includes("issue:situation-capability:")));
  assert.ok(rateLimitKeys.some((key) => key.includes("create:situation:")));
});

test("fails closed without exposing internals when capability issuance state is unavailable", async () => {
  const environment = env();
  environment.STAYBRIDGE_DB = {
    prepare() {
      throw new Error("D1 internal capability nonce detail");
    },
  } as unknown as D1Database;
  const response = await handleConsentedPersistenceRequest(capabilityRequest(), environment, { now });
  const body = await response?.text() ?? "";

  assert.equal(response?.status, 503);
  assert.doesNotMatch(body, /D1 internal|nonce detail/);
});

test("fails closed without a signing secret or an atomic submission backend", async () => {
  const missingSecretEnvironment = env();
  delete missingSecretEnvironment.SITUATION_CAPABILITY_SECRET;
  const missingSecret = await handleConsentedPersistenceRequest(
    capabilityRequest(),
    missingSecretEnvironment,
    { now },
  );
  assert.equal(missingSecret?.status, 503);

  const database = new FakeDatabase();
  const environment = env(database);
  const capability = await issueCapability(environment);
  environment.STAYBRIDGE_DB = {
    prepare: (query: string) => database.prepare(query),
    batch: async () => { throw new Error("D1 atomic batch unavailable"); },
  } as unknown as D1Database;
  const failedSubmission = await handleConsentedPersistenceRequest(
    jsonRequest("/api/situation-submissions", { ...situationBody(), capability }),
    environment,
    { now },
  );
  assert.equal(failedSubmission?.status, 503);
  assert.equal(database.situations.size, 0);
  assert.equal([...database.capabilities.values()][0]?.consumedAt, null);
});

test("fails closed when the capability or submission rate-limit backend throws", async () => {
  const database = new FakeDatabase();
  const environment = env(database, () => { throw new Error("rate limit backend unavailable"); });
  const response = await handleConsentedPersistenceRequest(capabilityRequest(), environment, { now });
  assert.equal(response?.status, 503);
  assert.equal(database.capabilities.size, 0);
  assert.equal(database.situations.size, 0);
});

test("masks a bounded server-verified conversation before storing it in separate records", async () => {
  const database = new FakeDatabase();
  const response = await persistVerifiedConversation(
    database as unknown as D1Database,
    {
      consent: { accepted: true, version: CONVERSATION_CONSENT_VERSION },
      idempotencyKey: "conversation_request_123",
      deletionToken,
      messages: [
        { role: "user", content: "Reply to me at ｐｅｒｓｏｎ＠ｅｘａｍｐｌｅ．ｃｏｍ" },
        { role: "assistant", content: "Call ０３－１２３４－５６７８", sourceIds: ["OFFICIAL_1"] },
      ],
    },
    persistencePolicy,
  );
  assert.equal(response?.status, 201);
  const responseBody = await response?.json() as { data: { id: string } };
  assert.match(responseBody.data.id, /^con_/);
  assert.equal(database.messageStatements.length, 2);
  const storedMessages = database.messageStatements.map((statement) => String(statement.values[4]));
  assert.deepEqual(storedMessages, [
    "Reply to me at [REDACTED_EMAIL]",
    "Call [REDACTED_PHONE]",
  ]);
  assert.doesNotMatch(JSON.stringify(database.statements.map((statement) => statement.values)), /person@example|03-1234-5678|ｐｅｒｓｏｎ|０３－/);
});

test("validates content type, body size, rate limits, and public list methods", async () => {
  const wrongType = await handleConsentedPersistenceRequest(
    new Request("https://staybridge.example/api/situation-submissions", {
      method: "POST",
      headers: { origin: "https://staybridge.example" },
      body: "{}",
    }),
    env(),
  );
  assert.equal(wrongType?.status, 415);

  const oversized = await handleConsentedPersistenceRequest(
    jsonRequest("/api/situation-submissions", situationBody(), { "content-length": "48001" }),
    env(),
  );
  assert.equal(oversized?.status, 413);

  const rateLimited = await handleConsentedPersistenceRequest(
    jsonRequest("/api/situation-submissions", situationBody()),
    env(new FakeDatabase(), false),
  );
  assert.equal(rateLimited?.status, 429);
  assert.equal(rateLimited?.headers.get("retry-after"), "60");

  const capabilityRateLimited = await handleConsentedPersistenceRequest(
    capabilityRequest(),
    env(new FakeDatabase(), false),
  );
  assert.equal(capabilityRateLimited?.status, 429);
  assert.equal(capabilityRateLimited?.headers.get("retry-after"), "60");

  const list = await handleConsentedPersistenceRequest(
    new Request("https://staybridge.example/api/conversations", { method: "GET" }),
    env(),
  );
  assert.equal(list?.status, 405);
  assert.equal(list?.headers.get("allow"), "DELETE");
});

test("closes public conversation creation and validates server-fixed provenance internally", async () => {
  const database = new FakeDatabase();
  const publicPost = await handleConsentedPersistenceRequest(
    jsonRequest("/api/conversations", {
      consent: { accepted: true, version: CONVERSATION_CONSENT_VERSION },
      idempotencyKey: "conversation_request_public",
      deletionToken,
      messages: [
        { role: "user", content: "Browser text" },
        { role: "assistant", content: "Fake model output", sourceIds: ["OFFICIAL_1"] },
      ],
    }),
    env(database),
  );
  assert.equal(publicPost?.status, 405);
  assert.equal(publicPost?.headers.get("allow"), "DELETE");
  assert.equal(database.statements.length, 0);

  const rejected = await persistVerifiedConversation(
    database as unknown as D1Database,
    {
      consent: { accepted: true, version: CONVERSATION_CONSENT_VERSION },
      idempotencyKey: "conversation_request_789",
      deletionToken,
      messages: [
        { role: "user", content: "What should I ask?" },
        { role: "assistant", content: "Ask an official.", sourceIds: ["AB1234567"] },
      ],
    },
    persistencePolicy,
  );
  assert.equal(rejected.status, 400);
  assert.equal(database.statements.length, 0);

  const accepted = await persistVerifiedConversation(
    database as unknown as D1Database,
    {
      consent: { accepted: true, version: CONVERSATION_CONSENT_VERSION },
      idempotencyKey: "conversation_request_790",
      deletionToken,
      messages: [{ role: "user", content: "What should I ask?" }],
    },
    persistencePolicy,
  );
  assert.equal(accepted.status, 201);
  const insert = database.statements.find((statement) => statement.query.includes("INSERT INTO conversations"));
  assert.equal(insert?.values[3], persistencePolicy.conversationModelId);
});

test("bounds server-internal conversation message counts", async () => {
  const messages = Array.from({ length: 21 }, (_, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    content: `message ${index}`,
  }));
  const response = await persistVerifiedConversation(
    env().STAYBRIDGE_DB,
    {
      consent: { accepted: true, version: CONVERSATION_CONSENT_VERSION },
      idempotencyKey: "conversation_request_456",
      deletionToken,
      messages,
    },
    persistencePolicy,
  );
  assert.equal(response.status, 400);
});

test("allows only the deletion-token holder to delete either record type", async () => {
  const database = new FakeDatabase();
  const created = await submitWithNewCapability(database);
  const createdBody = await created?.json() as { data: { id: string } };

  const rejected = await handleConsentedPersistenceRequest(
    new Request(`https://staybridge.example/api/situation-submissions/${createdBody.data.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${"B".repeat(43)}` },
    }),
    env(database),
  );
  assert.equal(rejected?.status, 404);

  const deleted = await handleConsentedPersistenceRequest(
    new Request(`https://staybridge.example/api/situation-submissions/${createdBody.data.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${deletionToken}` },
    }),
    env(database),
  );
  assert.equal(deleted?.status, 200);
  assert.deepEqual(await deleted?.json(), { ok: true, data: { deleted: true } });
});

test("turns an initial D1 read failure into a safe 503 response", async () => {
  const brokenDatabase = {
    prepare() {
      return {
        bind() { return this; },
        async first() { throw new Error("SQLITE internal detail with raw record"); },
      };
    },
  } as unknown as D1Database;
  const capability = await issueSignedCapability(capabilitySecret, {
    version: 1,
    expiresAt: Math.floor(now.getTime() / 1_000) + 300,
    nonce: createCapabilityNonce(),
    scope: "situation:submit",
  });
  const response = await handleConsentedPersistenceRequest(
    jsonRequest("/api/situation-submissions", { ...situationBody(), capability }),
    env(brokenDatabase as unknown as FakeDatabase),
    { now },
  );
  const body = await response?.text() ?? "";
  assert.equal(response?.status, 503);
  assert.doesNotMatch(body, /SQLITE|raw record/);
});

async function digest(value: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Buffer.from(hash).toString("hex");
}
