import assert from "node:assert/strict";
import test from "node:test";
import {
  CONVERSATION_CONSENT_VERSION,
  SITUATION_CONSENT_VERSION,
  handleConsentedPersistenceRequest,
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
};

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
    const rows = this.query.includes("FROM situation_submissions")
      ? this.database.situations
      : this.database.conversations;
    return (rows.get(String(this.values[0])) ?? null) as T | null;
  }

  async run(): Promise<D1Result> {
    let changes = 0;
    if (this.query.includes("INSERT INTO situation_submissions")) {
      this.database.situations.set(String(this.values[12]), {
        id: String(this.values[0]),
        deletion_token_hash: String(this.values[11]),
        payload_hash: String(this.values[13]),
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
    }
    return { success: true, meta: { changes } } as unknown as D1Result;
  }
}

class FakeDatabase {
  readonly situations = new Map<string, Existing>();
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

function env(database = new FakeDatabase(), rateLimitSuccess = true): PersistenceEnv {
  return {
    STAYBRIDGE_DB: database as unknown as D1Database,
    PERSISTENCE_RATE_LIMITER: { limit: async () => ({ success: rateLimitSuccess }) },
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
  const denied = await handleConsentedPersistenceRequest(
    jsonRequest("/api/situation-submissions", body),
    env(database),
  );
  assert.equal(denied?.status, 400);
  assert.equal(database.statements.length, 0);

  const extraField = situationBody() as ReturnType<typeof situationBody> & { exactAddress?: string };
  extraField.exactAddress = "must not be accepted";
  const invalid = await handleConsentedPersistenceRequest(
    jsonRequest("/api/situation-submissions", extraField),
    env(database),
  );
  assert.equal(invalid?.status, 400);
  assert.equal(database.statements.length, 0);
});

test("persists only allowlisted situation values with hashed tokens and idempotent duplicates", async () => {
  const database = new FakeDatabase();
  const first = await handleConsentedPersistenceRequest(
    jsonRequest("/api/situation-submissions", situationBody()),
    env(database),
  );
  assert.equal(first?.status, 201);
  const firstBody = await first?.json() as { data: { id: string; created: boolean } };
  assert.match(firstBody.data.id, /^sit_/);
  assert.equal(firstBody.data.created, true);

  const insert = database.statements.find((statement) => statement.query.includes("INSERT INTO situation_submissions"));
  assert.ok(insert);
  assert.equal(insert.values[11], await digest(deletionToken));
  assert.notEqual(insert.values[11], deletionToken);
  assert.doesNotMatch(JSON.stringify(insert.values), /MMR|knownStayDeadline|passport/i);

  const duplicate = await handleConsentedPersistenceRequest(
    jsonRequest("/api/situation-submissions", situationBody()),
    env(database),
  );
  assert.equal(duplicate?.status, 200);
  assert.deepEqual(await duplicate?.json(), {
    ok: true,
    data: { id: firstBody.data.id, created: false },
  });

  const conflictingBody = situationBody();
  conflictingBody.answers.visitPurpose = "work";
  const conflict = await handleConsentedPersistenceRequest(
    jsonRequest("/api/situation-submissions", conflictingBody),
    env(database),
  );
  assert.equal(conflict?.status, 409);
  assert.deepEqual(await conflict?.json(), {
    ok: false,
    error: {
      code: "DUPLICATE_CONFLICT",
      message: "The idempotency key was already used for a different request.",
    },
  });
  assert.equal(database.situations.size, 1);
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
    new Request("https://staybridge.example/api/situation-submissions", { method: "POST", body: "{}" }),
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
  const created = await handleConsentedPersistenceRequest(
    jsonRequest("/api/situation-submissions", situationBody()),
    env(database),
  );
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
  const response = await handleConsentedPersistenceRequest(
    jsonRequest("/api/situation-submissions", situationBody()),
    env(brokenDatabase as unknown as FakeDatabase),
  );
  const body = await response?.text() ?? "";
  assert.equal(response?.status, 503);
  assert.doesNotMatch(body, /SQLITE|raw record/);
});

async function digest(value: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Buffer.from(hash).toString("hex");
}
