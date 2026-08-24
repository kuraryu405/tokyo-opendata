import assert from "node:assert/strict";
import test from "node:test";
import { resolveReleaseConfig } from "./resolve-release-config.mjs";

const workersSubdomain = "tokyo-odh-466";
const workerKeys = [
  "user_staging_worker",
  "user_production_worker",
  "municipality_staging_worker",
  "municipality_production_worker",
];

test("resolves four unique workers and matching verification URLs", () => {
  const configuration = resolveReleaseConfig({ workersSubdomain });
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

test("rejects duplicate Worker names for every pair of release targets", () => {
  for (let leftIndex = 0; leftIndex < workerKeys.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < workerKeys.length; rightIndex += 1) {
      const leftKey = workerKeys[leftIndex];
      const rightKey = workerKeys[rightIndex];
      assert.throws(
        () => resolveReleaseConfig({
          workersSubdomain,
          workers: {
            [leftKey]: "staybridge-shared",
            [rightKey]: "staybridge-shared",
          },
        }),
        new RegExp(`${leftKey} and ${rightKey} both resolve to staybridge-shared`),
      );
    }
  }
});

test("rejects a repository override that collides with another target's default", () => {
  assert.throws(
    () => resolveReleaseConfig({
      workersSubdomain,
      workers: {
        user_staging_worker: "staybridge-municipality-production",
      },
    }),
    /user_staging_worker and municipality_production_worker both resolve to staybridge-municipality-production/,
  );
});
