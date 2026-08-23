import { describe, expect, it } from "vitest";
import {
  consultationSourcesByNeed,
  humanHandoffSourceIds,
  isSourceEligibleForVisitPurpose,
  sourceRegistry,
  supportSourceIds,
} from "../src";

describe("support source registry", () => {
  it("keeps every mapped source reachable and every need mapping duplicate-free", () => {
    for (const [need, ids] of Object.entries(consultationSourcesByNeed)) {
      expect(new Set(ids).size, `${need} contains duplicate source IDs`).toBe(ids.length);
      for (const id of ids) expect(sourceRegistry[id], `${need}.${id}`).toBeTruthy();
    }
    for (const id of humanHandoffSourceIds) expect(sourceRegistry[id], `handoff.${id}`).toBeTruthy();
    for (const id of supportSourceIds) expect(sourceRegistry[id], `support.${id}`).toBeTruthy();
  });

  it("preserves the visit-purpose boundaries for resident and status consultations", () => {
    expect(sourceRegistry.TMC_NAVI.eligibleVisitPurposes).toEqual(["resident"]);
    expect(sourceRegistry.TOKYO_MEDICAL_TMCNAVI.eligibleVisitPurposes).toEqual(["resident"]);
    expect(sourceRegistry.TOKYO_FRESC_STATUS_CONSULT.eligibleVisitPurposes).toEqual(["resident", "work", "study"]);
    expect(isSourceEligibleForVisitPurpose(sourceRegistry.TMC_NAVI, "tourism")).toBe(false);
    expect(isSourceEligibleForVisitPurpose(sourceRegistry.TMC_NAVI, "resident")).toBe(true);
    expect(isSourceEligibleForVisitPurpose(sourceRegistry.TOKYO_FRESC_STATUS_CONSULT, "work")).toBe(true);
    expect(isSourceEligibleForVisitPurpose(sourceRegistry.TOKYO_FRESC_STATUS_CONSULT, "tourism")).toBe(false);
  });
});
