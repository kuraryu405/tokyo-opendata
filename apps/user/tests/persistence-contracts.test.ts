import { describe, expect, it } from "vitest";
import { situationSubmissionAnswerCodes } from "@staybridge/domain/persistence-contracts";
import { SITUATION_CONSENT_VERSION } from "@staybridge/worker-runtime";
import { parsePendingSituationSubmission } from "../src/persistence/pending-submission";

describe("Situation persistence contracts", () => {
  it("keeps no-current-need submissions outside the client pending-retry format", () => {
    expect(situationSubmissionAnswerCodes.needs).toContain("none");

    const storedPending = JSON.stringify({
      version: 1,
      request: {
        consent: { accepted: true, version: SITUATION_CONSENT_VERSION },
        idempotencyKey: "request_key_123456",
        deletionToken: "A".repeat(43),
        answers: {
          municipalityCode: "13117",
          visitPurpose: "tourism",
          departureWindow: "within_30_days",
          returnStatus: "possible",
          familyAgeGroups: [],
          accommodation: "hotel",
          needs: ["none"],
          japaneseLevel: "none",
        },
      },
    });

    expect(parsePendingSituationSubmission(storedPending)).toEqual({ status: "incompatible" });
  });
});
