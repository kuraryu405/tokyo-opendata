import { describe, expect, it } from "vitest";
import { demoSituation } from "../src/domain/demo";
import {
  createInitialSituation,
  isAssessmentComplete,
  parseStoredSession,
  serializeStoredSession,
} from "../src/components/staybridge-session";
import { summarizeNeeds, summarizeSituation } from "../src/components/StayBridgeApp";

describe("StayBridge session data", () => {
  it("rejects malformed and partial persisted data", () => {
    expect(parseStoredSession("not-json")).toBeNull();
    expect(parseStoredSession(JSON.stringify({ needs: ["medical"] }))).toBeNull();
    expect(parseStoredSession(JSON.stringify({ version: 1, situation: { needs: [] } }))).toBeNull();
    expect(parseStoredSession(serializeStoredSession({ situation: demoSituation, stayAnswer: "unknown", familyAnswers: ["children"], answeredSteps: Array(10).fill(0) }))).toBeNull();
  });

  it("requires every distinct assessment step before generating a roadmap", () => {
    expect(isAssessmentComplete(Array.from({ length: 10 }, (_, index) => index))).toBe(true);
    expect(isAssessmentComplete(Array(10).fill(0))).toBe(false);
    expect(isAssessmentComplete([0, 1, 2, 3, 4, 5, 6, 7, 8])).toBe(false);
  });

  it("round-trips form-only state with its answer markers", () => {
    const serialized = serializeStoredSession({
      situation: demoSituation,
      stayAnswer: "unknown",
      familyAnswers: ["children", "spouse"],
      answeredSteps: [0, 1, 6, 8],
    });
    expect(parseStoredSession(serialized)).toEqual({
      version: 2,
      situation: demoSituation,
      stayAnswer: "unknown",
      familyAnswers: ["children", "spouse"],
      answeredSteps: [0, 1, 6, 8],
    });
  });

  it("never invents area, nationality, or needs for an unanswered summary", () => {
    const situation = createInitialSituation();
    expect(summarizeSituation("ja", situation, "unknown", [], [])).toEqual([]);
    expect(summarizeNeeds("ja", situation, [])).toEqual([]);
  });

  it("summarizes only fields whose questions were answered", () => {
    expect(summarizeSituation("en", demoSituation, "unknown", ["children"], [0, 1])).toEqual([
      "Area: Kita City",
      "Nationality/region: Myanmar",
    ]);
    expect(summarizeNeeds("en", demoSituation, [0, 1])).toEqual([]);
  });

  it("preserves stay and non-child family answers in the summary", () => {
    const situation = createInitialSituation();
    expect(summarizeSituation("ja", situation, "documents", ["spouse"], [5, 6])).toEqual([
      "書類を確認したい",
      "配偶者がいる",
    ]);
    expect(summarizeSituation("en", situation, "unknown", ["other"], [5, 6])).toEqual([
      "I do not know",
      "Other family is with me",
    ]);
  });

  it("migrates version 1 family answers without losing existing sessions", () => {
    const versionOne = JSON.stringify({
      version: 1,
      situation: demoSituation,
      stayAnswer: "unknown",
      familyAnswer: "children",
      answeredSteps: [6],
    });
    expect(parseStoredSession(versionOne)?.familyAnswers).toEqual(["children"]);
  });

  it("summarizes a spouse and child together", () => {
    expect(summarizeSituation("ja", demoSituation, "unknown", ["children", "spouse"], [6])).toEqual([
      "子どもがいる · 年齢: 6-11 / 配偶者がいる",
    ]);
  });
});
