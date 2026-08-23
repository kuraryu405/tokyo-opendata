import { describe, expect, it } from "vitest";
import { getTokyoAssessmentDate } from "../src/assessment-date";

describe("getTokyoAssessmentDate", () => {
  it("uses the server request time and Tokyo calendar boundary", () => {
    expect(getTokyoAssessmentDate(new Date("2026-08-22T14:59:59.000Z"))).toBe("2026-08-22");
    expect(getTokyoAssessmentDate(new Date("2026-08-22T15:00:00.000Z"))).toBe("2026-08-23");
  });
});
