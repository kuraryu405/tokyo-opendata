import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import test from "node:test";
import { classifyChangedPaths } from "./detect-scopes.mjs";
import { smokeHealth } from "./smoke-health.mjs";
import { resolveReleaseConfig } from "./resolve-release-config.mjs";
import {
  currentProductionVersion,
  findUploadedVersion,
} from "./wrangler-state.mjs";

test("classifies isolated and shared changes", () => {
  assert.deepEqual(classifyChangedPaths(["apps/user/app/page.tsx"]), {
    user: true,
    municipality: false,
  });
  assert.deepEqual(
    classifyChangedPaths(["apps/municipality/app/page.tsx"]),
    { user: false, municipality: true },
  );
  assert.deepEqual(classifyChangedPaths(["packages/domain/src/types.ts"]), {
    user: true,
    municipality: true,
  });
  assert.deepEqual(classifyChangedPaths(["pnpm-lock.yaml"]), {
    user: true,
    municipality: true,
  });
  assert.deepEqual(classifyChangedPaths([]), {
    user: false,
    municipality: false,
  });
});

test("requires the repository subdomain and derives workers.dev URLs", () => {
  for (const workersSubdomain of [undefined, "", "   "]) {
    assert.throws(
      () => resolveReleaseConfig({ workersSubdomain }),
      /CLOUDFLARE_WORKERS_SUBDOMAIN repository variable must be configured/,
    );
  }

  const configuration = resolveReleaseConfig({
    workersSubdomain: "tokyo-odh-466",
    workers: { user_staging_worker: "custom-user-staging" },
  });
  assert.equal(configuration.user_staging_worker, "custom-user-staging");
  assert.equal(
    configuration.user_staging_verification_url,
    "https://custom-user-staging.tokyo-odh-466.workers.dev",
  );
  assert.equal(
    configuration.municipality_production_verification_url,
    "https://staybridge-municipality-production.tokyo-odh-466.workers.dev",
  );
  assert.throws(
    () =>
      resolveReleaseConfig({
        workersSubdomain: "tokyo.example.com",
      }),
    /Invalid CLOUDFLARE_WORKERS_SUBDOMAIN/,
  );
});

test("smoke health validates service, revision, and cache policy", async (t) => {
  const server = createServer((request, response) => {
    assert.equal(request.url, "/healthz");
    response.setHeader("Content-Type", "application/json");
    response.setHeader("Cache-Control", "no-store");
    response.end(
      JSON.stringify({ status: "ok", service: "user", revision: "sha-1" }),
    );
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  t.after(() => server.close());
  const address = server.address();

  await smokeHealth(`http://127.0.0.1:${address.port}`, "user", "sha-1", {
    attempts: 1,
  });
});

test("smoke health rejects a stale revision", async (t) => {
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "application/json");
    response.setHeader("Cache-Control", "no-store");
    response.end(
      JSON.stringify({ status: "ok", service: "user", revision: "old-sha" }),
    );
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  t.after(() => server.close());
  const address = server.address();

  await assert.rejects(
    smokeHealth(`http://127.0.0.1:${address.port}`, "user", "new-sha", {
      attempts: 1,
    }),
    /unexpected health payload/,
  );
});

test("selects uploaded and rollback versions deterministically", () => {
  const versions = [
    {
      id: "old",
      metadata: { created_on: "2026-01-01T00:00:00Z" },
      annotations: { "workers/tag": "sha" },
    },
    {
      id: "new",
      metadata: { created_on: "2026-01-02T00:00:00Z" },
      annotations: { "workers/tag": "sha" },
    },
  ];
  assert.equal(findUploadedVersion(versions, "sha"), "new");
  assert.equal(
    currentProductionVersion({
      versions: [
        { version_id: "canary", percentage: 5 },
        { version_id: "stable", percentage: 95 },
      ],
    }),
    "stable",
  );
  assert.equal(currentProductionVersion({ versions: [] }), "");
});

test("workflow contracts gate deployment and preserve the artifact", async () => {
  await assert.rejects(
    stat(".github/workflows/deploy.yml"),
    (error) => error?.code === "ENOENT",
  );
  const ci = await readFile(".github/workflows/ci.yml", "utf8");
  const release = await readFile(".github/workflows/release.yml", "utf8");
  const deploy = await readFile(
    ".github/workflows/deploy-worker.yml",
    "utf8",
  );

  for (const command of [
    "pnpm install --frozen-lockfile",
    "pnpm lint",
    "pnpm typecheck",
    "pnpm test",
    "pnpm build:user",
    "pnpm build:municipality",
  ]) {
    assert.match(ci, new RegExp(command.replaceAll("-", "\\-")));
  }
  assert.match(release, /github\.event\.workflow_run\.event == 'push'/);
  assert.match(ci, /release-range-\$\{\{ github\.sha \}\}/);
  assert.match(release, /github\.event\.workflow_run\.id/);
  assert.match(release, /release-metadata\/release-range\.json/);
  assert.match(
    release,
    /CLOUDFLARE_WORKERS_SUBDOMAIN: \$\{\{ vars\.CLOUDFLARE_WORKERS_SUBDOMAIN \}\}/,
  );
  assert.match(release, /node scripts\/cd\/resolve-release-config\.mjs/);
  assert.match(release, /app_directory: apps\/user/);
  assert.match(release, /app_directory: apps\/municipality/);
  assert.match(release, /staging_environment: staging/);
  assert.match(release, /production_environment: production/);
  assert.match(release, /staging_verification_url:/);
  assert.match(release, /production_verification_url:/);
  assert.match(
    release,
    /kuraryu405\/StayBridgeTokyo-e2e\/\.github\/workflows\/acceptance\.yml@main/,
  );
  assert.doesNotMatch(release, /E2E_REPOSITORY_DISPATCH_TOKEN/);
  assert.doesNotMatch(release, /USER_(?:STAGING|PRODUCTION)_URL/);
  assert.doesNotMatch(release, /MUNICIPALITY_(?:STAGING|PRODUCTION)_URL/);
  assert.match(deploy, /actions\/upload-artifact@v4/);
  assert.match(deploy, /sha256sum --check/);
  assert.match(deploy, /needs: \[configuration, build, staging\]/);
  assert.match(deploy, /ARTIFACT_NAME: staybridge-\$\{\{ inputs\.service \}\}-\$\{\{ inputs\.revision \}\}/);
  assert.match(deploy, /name: \$\{\{ inputs\.staging_environment \}\}/);
  assert.match(deploy, /name: \$\{\{ inputs\.production_environment \}\}/);
  assert.match(deploy, /wrangler@4\.92\.0 versions upload/);
  assert.match(deploy, /wrangler@4\.92\.0 versions deploy/);
  assert.match(deploy, /wrangler@4\.92\.0 rollback/);
  assert.match(deploy, /steps\.production_smoke\.outcome == 'failure'/);
  assert.match(deploy, /steps\.previous\.outputs\.version_id/);
  assert.match(deploy, /cancel-in-progress: false/);

  const declaredSecrets = [
    ...deploy.matchAll(/^      ([A-Z0-9_]+):\n        required: true$/gm),
  ].map((match) => match[1]);
  assert.deepEqual(declaredSecrets, [
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID",
  ]);
});
