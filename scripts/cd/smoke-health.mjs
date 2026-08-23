import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

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
    payload.revision !== expectedRevision
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

export async function smokeHealth(
  baseUrl,
  expectedService,
  expectedRevision,
  { attempts = 10, delayMs = 6000, fetchImpl = fetch } = {},
) {
  const healthUrl = new URL("/healthz", `${baseUrl.replace(/\/+$/, "")}/`);
  const readinessUrl = new URL("/readyz", `${baseUrl.replace(/\/+$/, "")}/`);
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(healthUrl, {
        headers: { Accept: "application/json" },
        redirect: "error",
      });
      await assertHealth(response, expectedService, expectedRevision);
      const readinessResponse = await fetchImpl(readinessUrl, {
        headers: { Accept: "application/json" },
        redirect: "error",
      });
      await assertReadiness(readinessResponse);
      process.stdout.write(
        `Healthy and ready ${expectedService} revision ${expectedRevision} at ${healthUrl.origin}\n`,
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
  const [, , baseUrl, service, revision] = process.argv;
  if (!baseUrl || !service || !revision) {
    throw new Error("usage: smoke-health.mjs <base-url> <service> <revision>");
  }

  await smokeHealth(baseUrl, service, revision, {
    attempts: Number(process.env.SMOKE_ATTEMPTS ?? 10),
    delayMs: Number(process.env.SMOKE_DELAY_MS ?? 6000),
  });
}
