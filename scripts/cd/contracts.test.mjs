import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import test from "node:test";
import { classifyChangedPaths } from "./detect-scopes.mjs";
import { smokeHealth } from "./smoke-health.mjs";
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
    /kuraryu405\/StayBridgeTokyo-e2e\/\.github\/workflows\/acceptance\.yml@main/,
  );
  assert.doesNotMatch(release, /E2E_REPOSITORY_DISPATCH_TOKEN/);
  assert.match(deploy, /actions\/upload-artifact@v4/);
  assert.match(deploy, /sha256sum --check/);
  assert.match(deploy, /wrangler@4\.92\.0 versions upload/);
  assert.match(deploy, /wrangler@4\.92\.0 versions deploy/);
  assert.match(deploy, /wrangler@4\.92\.0 rollback/);
  assert.match(deploy, /cancel-in-progress: false/);
});
