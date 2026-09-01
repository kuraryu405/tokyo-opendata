import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const DEFAULT_SMOKE_ATTEMPTS = 5;
export const DEFAULT_SMOKE_DELAY_MS = 6000;
export const DEFAULT_SMOKE_REQUEST_TIMEOUT_MS = 15000;
export const MAX_CONFIGURED_SMOKE_DURATION_MS = 3 * 60 * 1000;

function requirePositiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
}

function requireNonNegativeFinite(value, name) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative finite number`);
  }
}

function requirePositiveFinite(value, name) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive finite number`);
  }
}

function calculateMaximumSmokeDurationMs({ attempts, delayMs, requestTimeoutMs }) {
  return attempts * requestTimeoutMs * 2 + (attempts - 1) * delayMs;
}

function validateSmokeTiming({ attempts, delayMs, requestTimeoutMs }) {
  requirePositiveInteger(attempts, "attempts");
  requireNonNegativeFinite(delayMs, "delayMs");
  requirePositiveFinite(requestTimeoutMs, "requestTimeoutMs");

  const maximumDurationMs = calculateMaximumSmokeDurationMs({
    attempts,
    delayMs,
    requestTimeoutMs,
  });
  if (
    !Number.isFinite(maximumDurationMs) ||
    maximumDurationMs > MAX_CONFIGURED_SMOKE_DURATION_MS
  ) {
    throw new Error(
      `smoke timing budget must not exceed ${MAX_CONFIGURED_SMOKE_DURATION_MS}ms`,
    );
  }
}

export function maximumSmokeDurationMs({
  attempts = DEFAULT_SMOKE_ATTEMPTS,
  delayMs = DEFAULT_SMOKE_DELAY_MS,
  requestTimeoutMs = DEFAULT_SMOKE_REQUEST_TIMEOUT_MS,
} = {}) {
  validateSmokeTiming({ attempts, delayMs, requestTimeoutMs });
  return calculateMaximumSmokeDurationMs({ attempts, delayMs, requestTimeoutMs });
}

export async function assertHealth(response, expectedService, expectedRevision) {
  if (!response.ok) {
    throw new Error(`health endpoint returned HTTP ${response.status}`);
  }

  const cacheControl = response.headers.get("cache-control") ?? "";
  if (!cacheControl.toLowerCase().includes("no-store")) {
    throw new Error("health endpoint must return Cache-Control: no-store");
  }

  const payload = await response.json();
  if (
    payload.status !== "ok" ||
    payload.service !== expectedService ||
    (expectedRevision !== null && payload.revision !== expectedRevision)
  ) {
    throw new Error(
      `unexpected health payload: ${JSON.stringify(payload)}`,
    );
  }
}

export async function assertReadiness(response) {
  if (!response.ok) {
    throw new Error(`readiness endpoint returned HTTP ${response.status}`);
  }

  const cacheControl = response.headers.get("cache-control") ?? "";
  if (!cacheControl.toLowerCase().includes("no-store")) {
    throw new Error("readiness endpoint must return Cache-Control: no-store");
  }

  const payload = await response.json();
  if (payload.ok !== true || payload.data?.status !== "ready") {
    throw new Error("unexpected readiness payload");
  }
}

async function withRequestTimeout(label, requestTimeoutMs, task) {
  requirePositiveFinite(requestTimeoutMs, "requestTimeoutMs");

  const controller = new AbortController();
  let timeoutId;
  const timeout = new Promise((_, rejectTimeout) => {
    timeoutId = setTimeout(() => {
      const error = new Error(
        `${label} request timed out after ${requestTimeoutMs}ms`,
      );
      controller.abort(error);
      rejectTimeout(error);
    }, requestTimeoutMs);
  });

  try {
    return await Promise.race([
      Promise.resolve().then(() => task(controller.signal)),
      timeout,
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function smokeHealth(
  baseUrl,
  expectedService,
  expectedRevision,
  {
    attempts = DEFAULT_SMOKE_ATTEMPTS,
    delayMs = DEFAULT_SMOKE_DELAY_MS,
    requestTimeoutMs = DEFAULT_SMOKE_REQUEST_TIMEOUT_MS,
    fetchImpl = fetch,
  } = {},
) {
  validateSmokeTiming({ attempts, delayMs, requestTimeoutMs });
  if (typeof fetchImpl !== "function") {
    throw new Error("fetchImpl must be a function");
  }

  const healthUrl = new URL("/healthz", `${baseUrl.replace(/\/+$/, "")}/`);
  const readinessUrl = new URL("/readyz", `${baseUrl.replace(/\/+$/, "")}/`);
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await withRequestTimeout("health", requestTimeoutMs, async (signal) => {
        const response = await fetchImpl(healthUrl, {
          headers: { Accept: "application/json" },
          redirect: "error",
          signal,
        });
        await assertHealth(response, expectedService, expectedRevision);
      });
      await withRequestTimeout("readiness", requestTimeoutMs, async (signal) => {
        const readinessResponse = await fetchImpl(readinessUrl, {
          headers: { Accept: "application/json" },
          redirect: "error",
          signal,
        });
        await assertReadiness(readinessResponse);
      });
      process.stdout.write(
        `Healthy and ready ${expectedService} revision ${expectedRevision ?? "any"} at ${healthUrl.origin}\n`,
      );
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
      }
    }
  }

  throw new Error(
    `health check failed after ${attempts} attempts: ${lastError?.message ?? lastError}`,
  );
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  const [, , baseUrl, service, revisionArgument] = process.argv;
  const revision = revisionArgument === "--any-revision" ? null : revisionArgument;
  if (!baseUrl || !service || !revisionArgument) {
    throw new Error("usage: smoke-health.mjs <base-url> <service> <revision|--any-revision>");
  }

  await smokeHealth(baseUrl, service, revision, {
    attempts: Number(process.env.SMOKE_ATTEMPTS ?? DEFAULT_SMOKE_ATTEMPTS),
    delayMs: Number(process.env.SMOKE_DELAY_MS ?? DEFAULT_SMOKE_DELAY_MS),
    requestTimeoutMs: Number(
      process.env.SMOKE_REQUEST_TIMEOUT_MS ?? DEFAULT_SMOKE_REQUEST_TIMEOUT_MS,
    ),
  });
}
