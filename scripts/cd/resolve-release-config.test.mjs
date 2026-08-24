import assert from "node:assert/strict";
import test from "node:test";
import { resolveReleaseConfig } from "./resolve-release-config.mjs";

const workersSubdomain = "tokyo-odh-466";

test("resolves four unique workers and matching verification URLs", () => {
  const configuration = resolveReleaseConfig({ workersSubdomain });
  const workerKeys = [
    "user_staging_worker",
    "user_production_worker",
    "municipality_staging_worker",
    "municipality_production_worker",
  ];
  const workers = workerKeys.map((key) => configuration[key]);

  assert.equal(new Set(workers).size, workerKeys.length);
  for (const key of workerKeys) {
    const verificationKey = key.replace(/_worker$/, "_verification_url");
    assert.equal(
      configuration[verificationKey],
      `https://${configuration[key]}.${workersSubdomain}.workers.dev`,
    );
  }
});

test("rejects duplicate staging and production names within one service", () => {
  assert.throws(
    () => resolveReleaseConfig({
      workersSubdomain,
      workers: {
        user_staging_worker: "staybridge-user-shared",
        user_production_worker: "staybridge-user-shared",
      },
    }),
    /user_staging_worker and user_production_worker both resolve to staybridge-user-shared/,
  );
});

test("rejects duplicate Worker names across services", () => {
  assert.throws(
    () => resolveReleaseConfig({
      workersSubdomain,
      workers: {
        user_staging_worker: "staybridge-shared",
        municipality_production_worker: "staybridge-shared",
      },
    }),
    /user_staging_worker and municipality_production_worker both resolve to staybridge-shared/,
  );
});
