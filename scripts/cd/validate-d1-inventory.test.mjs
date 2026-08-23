import assert from "node:assert/strict";
import test from "node:test";
import {
  parseD1Inventory,
  validateD1Inventory,
} from "./validate-d1-inventory.mjs";

const stagingId = "11111111-1111-4111-8111-111111111111";
const productionId = "22222222-2222-4222-8222-222222222222";

function validInventory() {
  return [
    { uuid: stagingId, name: "staybridge-staging" },
    { uuid: productionId, name: "staybridge-production" },
    {
      uuid: "33333333-3333-4333-8333-333333333333",
      name: "unrelated-database",
    },
  ];
}

test("accepts the exact staging and production D1 identity pair", () => {
  assert.doesNotThrow(() =>
    validateD1Inventory(validInventory(), stagingId, productionId),
  );
});

test("rejects swapped staging and production IDs", () => {
  assert.throws(
    () => validateD1Inventory(validInventory(), productionId, stagingId),
    /does not map/,
  );
});

test("rejects configured IDs that are absent from the inventory", () => {
  assert.throws(
    () =>
      validateD1Inventory(
        validInventory(),
        "44444444-4444-4444-8444-444444444444",
        productionId,
      ),
    /exactly one staybridge-staging/,
  );
});

test("rejects duplicate or ambiguous inventory entries", () => {
  assert.throws(
    () =>
      validateD1Inventory(
        [
          ...validInventory(),
          { uuid: stagingId, name: "staybridge-staging" },
        ],
        stagingId,
        productionId,
      ),
    /exactly one staybridge-staging/,
  );

  assert.throws(
    () =>
      validateD1Inventory(
        [
          ...validInventory(),
          {
            uuid: "55555555-5555-4555-8555-555555555555",
            name: "staybridge-production",
          },
        ],
        stagingId,
        productionId,
      ),
    /exactly one staybridge-production/,
  );
});

test("rejects malformed Wrangler JSON and inventory shapes", () => {
  assert.throws(() => parseD1Inventory("{not-json"), /not valid JSON/);
  assert.throws(
    () => validateD1Inventory({ result: [] }, stagingId, productionId),
    /must be a JSON array/,
  );
  assert.throws(
    () =>
      validateD1Inventory(
        [{ uuid: stagingId }, ...validInventory().slice(1)],
        stagingId,
        productionId,
      ),
    /malformed database entry/,
  );
});
