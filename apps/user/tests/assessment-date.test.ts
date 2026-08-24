import { describe, expect, it } from "vitest";
import { formatAssessmentDateForLocale, getTokyoAssessmentDate } from "../src/assessment-date";

describe("getTokyoAssessmentDate", () => {
  it("uses the server request time and Tokyo calendar boundary", () => {
    expect(getTokyoAssessmentDate(new Date("2026-08-22T14:59:59.000Z"))).toBe("2026-08-22");
    expect(getTokyoAssessmentDate(new Date("2026-08-22T15:00:00.000Z"))).toBe("2026-08-23");
  });
});

describe("formatAssessmentDateForLocale", () => {
  it.each([
    ["ja", "2026年8月24日"],
    ["en", "August 24, 2026"],
    ["my", "August 24, 2026"],
  ])("formats the pinned date for %s", (locale, expected) => {
    expect(formatAssessmentDateForLocale("2026-08-24", locale)).toBe(expected);
  });

  it("stays stable regardless of the system time zone", () => {
    const originalTZ = process.env.TZ;
    try {
      process.env.TZ = "Pacific/Honolulu";
      const honolulu = formatAssessmentDateForLocale("2026-08-24", "en");
      process.env.TZ = "Asia/Tokyo";
      const tokyo = formatAssessmentDateForLocale("2026-08-24", "en");
      process.env.TZ = "America/Sao_Paulo";
      const paulo = formatAssessmentDateForLocale("2026-08-24", "en");
      expect(honolulu).toBe(tokyo);
      expect(paulo).toBe(tokyo);
    } finally {
      if (originalTZ === undefined) delete process.env.TZ;
      else process.env.TZ = originalTZ;
    }
  });
});
