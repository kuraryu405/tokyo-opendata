import assert from "node:assert/strict";
import test from "node:test";
import { issueSignedCapability, verifySignedCapability } from "../src/index";

const signingSecret = "characterization-only-capability-secret-2026";
const capabilityClaims = {
  version: 1,
  expiresAt: 1_800_000_000,
  nonce: "0123456789abcdefghijkl",
  scope: "situation-submission:create",
};

test("signed capabilities round-trip through the public Worker runtime API", async () => {
  const capability = await issueSignedCapability(signingSecret, capabilityClaims);
  assert.deepEqual(await verifySignedCapability(signingSecret, capability), capabilityClaims);
});

test("tampered capabilities and invalid claims fail closed", async () => {
  const capability = await issueSignedCapability(signingSecret, capabilityClaims);
  const [encodedClaims = "", signature = ""] = capability.split(".");
  const replacement = signature.startsWith("A") ? "B" : "A";
  const tamperedCapability = `${encodedClaims}.${replacement}${signature.slice(1)}`;

  assert.equal(await verifySignedCapability(signingSecret, tamperedCapability), null);
  assert.equal(await verifySignedCapability(signingSecret, "not-a-capability"), null);
  await assert.rejects(
    issueSignedCapability("too-short", capabilityClaims),
    /INVALID_CAPABILITY_CONFIGURATION/u,
  );
  await assert.rejects(
    issueSignedCapability(signingSecret, { ...capabilityClaims, expiresAt: 0 }),
    /INVALID_CAPABILITY_CONFIGURATION/u,
  );
});
