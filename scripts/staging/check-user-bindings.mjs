import { pathToFileURL } from "node:url";

const timeoutMs = 20_000;

export function validateTargets(stagingValue, productionValue) {
  if (!stagingValue) throw new Error("STAYBRIDGE_STAGING_URL is required.");
  if (!productionValue) throw new Error("STAYBRIDGE_PRODUCTION_URL is required for the production guard.");
  let staging;
  let production;
  try {
    staging = new URL(stagingValue);
    production = new URL(productionValue);
  } catch {
    throw new Error("Both target URLs must be valid absolute HTTPS origins.");
  }
  for (const [name, target] of [["staging", staging], ["production", production]]) {
    if (target.protocol !== "https:" || target.port || target.username || target.password || target.pathname !== "/" || target.search || target.hash) {
      throw new Error(`${name} URL must be an HTTPS origin without credentials, path, query, or fragment.`);
    }
  }
  const separator = production.hostname.indexOf(".");
  const firstLabel = separator > 0 ? production.hostname.slice(0, separator) : "";
  const rest = separator > 0 ? production.hostname.slice(separator) : "";
  const expectedHosts = [
    `${firstLabel}-staging${rest}`,
    firstLabel.endsWith("-production") ? `${firstLabel.slice(0, -"-production".length)}-staging${rest}` : "",
  ];
  if (staging.origin === production.origin || !expectedHosts.includes(staging.hostname)) {
    throw new Error("Refusing to send requests: the target is not a distinct staging hostname.");
  }
  return staging.origin;
}

async function request(fetchImpl, origin, path, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${origin}${path}`, {
      ...init,
      headers: { ...init.headers, ...(init.method === "POST" ? { origin } : {}) },
      redirect: "manual",
      signal: controller.signal,
    });
    if (response.status >= 300 && response.status < 400) {
      throw new Error(`${path} redirected; refusing to follow a potentially non-staging target.`);
    }
    let body;
    try {
      body = await response.json();
    } catch {
      throw new Error(`${path} returned invalid JSON (HTTP ${response.status}).`);
    }
    return { status: response.status, headers: response.headers, body };
  } catch {
    throw new Error(`${path} could not be reached within ${timeoutMs / 1000}s. Check the staging deployment and network.`);
  } finally {
    clearTimeout(timer);
  }
}

async function expectResponse(fetchImpl, origin, name, path, init, expectedStatus, validateBody = () => true) {
  const response = await request(fetchImpl, origin, path, init);
  if (response.status !== expectedStatus || !validateBody(response.body, response)) {
    throw new Error(`${name}: expected HTTP ${expectedStatus} contract, received HTTP ${response.status}.`);
  }
  return response;
}

const jsonPost = (value) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(value),
});

const errorCode = (code) => (body) => body?.error === code;

export async function runStagingChecks({ stagingUrl, productionUrl, fetchImpl = fetch, log = console.log }) {
  const origin = validateTargets(stagingUrl, productionUrl);
  const check = async (name, path, init, status, validate) => {
    await expectResponse(fetchImpl, origin, name, path, init, status, validate);
    log(`PASS ${name}`);
  };
  await check("healthz", "/healthz", {}, 200, (body) => body?.status === "ok" && body?.service === "user" && typeof body?.revision === "string" && body.revision !== "local" && body.revision.length > 0);
  await check("D1 readiness", "/readyz", {}, 200, (body) => body?.ok === true && body?.data?.status === "ready");

  await check("Workers AI support response", "/api/support-chat", jsonPost({ locale: "ja", messages: [{ role: "user", content: "相談窓口で何を聞けばよいですか？" }] }), 200, (body) => typeof body?.reply === "string" && body.reply.trim().length > 0);
  await check("Support invalid message", "/api/support-chat", jsonPost({ locale: "ja", messages: [] }), 400, errorCode("INVALID_MESSAGES"));
  await check("Support oversized body", "/api/support-chat", jsonPost({ locale: "ja", messages: [{ role: "user", content: "a".repeat(26_000) }] }), 413, errorCode("REQUEST_TOO_LARGE"));

  await check("Workers AI action response", "/api/recommend-actions", jsonPost({ text: "観光で来ました" }), 200, (body) => Array.isArray(body?.actionIds) && body.actionIds.length <= 3 && body.actionIds.every((id) => typeof id === "string"));
  await check("Action invalid input", "/api/recommend-actions", jsonPost({ text: "" }), 400, errorCode("INVALID_TEXT"));
  await check("Action oversized body", "/api/recommend-actions", jsonPost({ text: "a".repeat(2_100) }), 413, errorCode("REQUEST_TOO_LARGE"));

  // Invalid input is rejected after the binding counter runs, so these probes
  // check the real limiter without invoking the model or sending user data.
  for (const [name, path, payload, limit] of [
    ["Support Rate Limit", "/api/support-chat", { locale: "ja", messages: [] }, 22],
    ["Action Rate Limit", "/api/recommend-actions", { text: "" }, 12],
  ]) {
    let limited = false;
    for (let attempt = 0; attempt < limit; attempt += 1) {
      const response = await request(fetchImpl, origin, path, jsonPost(payload));
      if (response.status === 429) {
        if (!errorCode("RATE_LIMITED")(response.body) || !response.headers.get("retry-after")) {
          throw new Error(`${name}: malformed 429 contract.`);
        }
        limited = true;
        break;
      }
      if (response.status !== 400) throw new Error(`${name}: expected HTTP 400 before the quota, received HTTP ${response.status}.`);
    }
    if (!limited) throw new Error(`${name}: no HTTP 429 within ${limit} requests; check the staging binding and quota.`);
    log(`PASS ${name}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runStagingChecks({
    stagingUrl: process.env.STAYBRIDGE_STAGING_URL,
    productionUrl: process.env.STAYBRIDGE_PRODUCTION_URL,
  }).catch((error) => {
    // Never print response bodies, model output, tokens, or user input.
    console.error(`FAIL ${error instanceof Error ? error.message : "Staging check failed."}`);
    process.exitCode = 1;
  });
}
