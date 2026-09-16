import { describe, expect, it } from "vitest";
import { demoSituation } from "@staybridge/domain/demo";
import { assessmentOptionCodes } from "@staybridge/domain/selection-coverage";
import type { NeedCategory } from "@staybridge/domain/types";
import { createPendingSituationSubmission, parsePendingSituationSubmission } from "../src/consented-persistence";

describe("pending save recovery for every selectable need", () => {
  const selections: NeedCategory[][] = [
    ...assessmentOptionCodes.needs.map((need) => [need]),
    assessmentOptionCodes.needs.filter((need) => need !== "none"),
  ];
  it.each(selections.map((needs) => ({ needs })))("restores the same retry credentials for $needs", ({ needs }) => {
    const pending = createPendingSituationSubmission({ ...demoSituation, needs });
    expect(parsePendingSituationSubmission(JSON.stringify(pending))).toEqual({ status: "retryable", submission: pending });
  });

  it("does not retry a contradictory no-current-need answer", () => {
    const pending = createPendingSituationSubmission({ ...demoSituation, needs: ["none", "medical"] });
    expect(parsePendingSituationSubmission(JSON.stringify(pending))).toEqual({ status: "incompatible" });
  });
});
