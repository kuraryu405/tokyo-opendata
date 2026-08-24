import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL("../../.github/workflows/deploy-worker.yml", import.meta.url);

async function readWorkflow() {
  return readFile(workflowUrl, "utf8");
}

test("staging and production both use the bounded smoke-health script", async () => {
  const workflow = await readWorkflow();
  const smokeCommands = workflow.match(/run: node scripts\/cd\/smoke-health\.mjs/g) ?? [];

  assert.equal(smokeCommands.length, 2);
  assert.match(
    workflow,
    /- name: Smoke test staging\n\s+run: node scripts\/cd\/smoke-health\.mjs "\$SITE_URL" "\$SERVICE" "\$REVISION"/,
  );
  assert.match(
    workflow,
    /- name: Smoke test production\n\s+id: production_smoke\n\s+continue-on-error: true\n\s+run: node scripts\/cd\/smoke-health\.mjs "\$SITE_URL" "\$SERVICE" "\$REVISION"/,
  );
});

test("a failed production smoke reaches rollback handling before the job is failed", async () => {
  const workflow = await readWorkflow();
  const smokeIndex = workflow.indexOf("- name: Smoke test production");
  const rollbackIndex = workflow.indexOf("- name: Roll back a failed production health check");
  const failIndex = workflow.indexOf("- name: Fail after production smoke and rollback handling");

  assert.ok(smokeIndex >= 0, "production smoke step must exist");
  assert.ok(rollbackIndex > smokeIndex, "rollback must run after production smoke");
  assert.ok(failIndex > rollbackIndex, "final failure must happen after rollback handling");
  assert.match(
    workflow.slice(rollbackIndex, failIndex),
    /if: \$\{\{ always\(\) && steps\.production_smoke\.outcome == 'failure' && steps\.previous\.outputs\.version_id != '' \}\}/,
  );
  assert.match(
    workflow.slice(failIndex),
    /if: \$\{\{ always\(\) && steps\.production_smoke\.outcome == 'failure' \}\}/,
  );
});
