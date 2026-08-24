import { describe, expect, it } from "vitest";
import { demoSituation } from "@staybridge/domain/demo";
import type { Situation } from "@staybridge/domain/types";
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
    expect(parseStoredSession(serializeStoredSession({ provenance: "user", situation: demoSituation, stayAnswer: "unknown", familyAnswers: ["children"], answeredSteps: Array(10).fill(0) }))).toBeNull();
  });

  it("requires every distinct assessment step before generating a roadmap", () => {
    expect(isAssessmentComplete(Array.from({ length: 10 }, (_, index) => index))).toBe(true);
    expect(isAssessmentComplete(Array(10).fill(0))).toBe(false);
    expect(isAssessmentComplete([0, 1, 2, 3, 4, 5, 6, 7, 8])).toBe(false);
  });

  it("round-trips form-only state with its answer markers", () => {
    const serialized = serializeStoredSession({
      provenance: "user",
      situation: demoSituation,
      stayAnswer: "unknown",
      familyAnswers: ["children", "spouse"],
      answeredSteps: [0, 1, 6, 8],
    });
    expect(parseStoredSession(serialized)).toEqual({
      version: 4,
      provenance: "user",
      situation: demoSituation,
      stayAnswer: "unknown",
      familyAnswers: ["children", "spouse"],
      answeredSteps: [0, 1, 6, 8],
      otherAnswers: { area: "", nationality: "", visitPurpose: "", family: "" },
      aiRecommendation: null,
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

  it("migrates sessions without provenance as demo-derived until the user re-answers", () => {
    const versionTwo = JSON.stringify({
      version: 2,
      situation: demoSituation,
      stayAnswer: "unknown",
      familyAnswers: ["children"],
      answeredSteps: Array.from({ length: 10 }, (_, index) => index),
    });
    const versionOne = JSON.stringify({
      version: 1,
      situation: demoSituation,
      stayAnswer: "unknown",
      familyAnswer: "children",
      answeredSteps: [6],
    });
    expect(parseStoredSession(versionTwo)?.provenance).toBe("demo");
    expect(parseStoredSession(versionOne)?.familyAnswers).toEqual(["children"]);
    expect(parseStoredSession(versionOne)?.provenance).toBe("demo");
  });

  it("migrates version 3 and requires new Other text before keeping those steps answered", () => {
    const versionThree = JSON.stringify({
      version: 3,
      provenance: "user",
      situation: {
        ...demoSituation,
        currentMunicipality: "Other",
        nationality: "OTHER",
        visitPurpose: "other",
      },
      stayAnswer: "unknown",
      familyAnswers: ["other"],
      answeredSteps: Array.from({ length: 10 }, (_, index) => index),
    });

    expect(parseStoredSession(versionThree)).toMatchObject({
      version: 4,
      provenance: "user",
      answeredSteps: [3, 4, 5, 7, 8, 9],
      otherAnswers: { area: "", nationality: "", visitPurpose: "", family: "" },
      aiRecommendation: null,
    });
  });

  it("round-trips all Other text and keeps only recommendations derived from the same Q3 text", () => {
    const situation: Situation = {
      ...demoSituation,
      currentMunicipality: "Other",
      nationality: "OTHER",
      visitPurpose: "other",
    };
    const otherAnswers = {
      area: "世田谷区",
      nationality: "タイ",
      visitPurpose: "国際会議に参加するため",
      family: "親",
    };
    const serialized = serializeStoredSession({
      provenance: "user",
      situation,
      stayAnswer: "unknown",
      familyAnswers: ["other"],
      answeredSteps: Array.from({ length: 10 }, (_, index) => index),
      otherAnswers,
      aiRecommendation: { input: otherAnswers.visitPurpose, actionIds: ["CONTACT_OFFICIAL_SUPPORT"] },
    });

    expect(parseStoredSession(serialized)).toMatchObject({
      version: 4,
      otherAnswers,
      aiRecommendation: { input: otherAnswers.visitPurpose, actionIds: ["CONTACT_OFFICIAL_SUPPORT"] },
    });

    const changed = JSON.parse(serialized) as Record<string, unknown>;
    changed.otherAnswers = { ...otherAnswers, visitPurpose: "別の目的" };
    expect(parseStoredSession(JSON.stringify(changed))?.aiRecommendation).toBeNull();

    const invalid = JSON.parse(serialized) as Record<string, unknown>;
    invalid.aiRecommendation = { input: otherAnswers.visitPurpose, actionIds: ["NOT_ALLOWED"] };
    expect(parseStoredSession(JSON.stringify(invalid))?.aiRecommendation).toBeNull();
  });

  it("rejects Other text beyond the per-question limits", () => {
    const serialized = serializeStoredSession({
      provenance: "user",
      situation: demoSituation,
      stayAnswer: "unknown",
      familyAnswers: ["children"],
      answeredSteps: [0],
    });
    const value = JSON.parse(serialized) as Record<string, unknown>;
    value.otherAnswers = { area: "a".repeat(101), nationality: "", visitPurpose: "", family: "" };
    expect(parseStoredSession(JSON.stringify(value))).toBeNull();
  });

  it("round-trips multiple child age groups in order", () => {
    const situation: Situation = { ...demoSituation, familyMembers: { children: [{ ageGroup: "6-11" }, { ageGroup: "0-2" }] } };
    const serialized = serializeStoredSession({
      provenance: "user",
      situation,
      stayAnswer: "unknown",
      familyAnswers: ["children"],
      answeredSteps: [6],
    });
    expect(parseStoredSession(serialized)?.situation.familyMembers.children).toEqual([{ ageGroup: "6-11" }, { ageGroup: "0-2" }]);
  });

  it("summarizes a spouse and child together", () => {
    expect(summarizeSituation("ja", demoSituation, "unknown", ["children", "spouse"], [6])).toEqual([
      "子どもがいる · 年齢: 6-11 / 配偶者がいる",
    ]);
  });

  it("lists every selected child age group with a locale-aware separator", () => {
    const situation: Situation = { ...demoSituation, familyMembers: { children: [{ ageGroup: "3-5" }, { ageGroup: "6-11" }] } };
    expect(summarizeSituation("ja", situation, "unknown", ["children"], [6])).toEqual([
      "子どもがいる · 年齢: 3-5、6-11",
    ]);
    expect(summarizeSituation("en", situation, "unknown", ["children"], [6])).toEqual([
      "A child is with me · age: 3-5, 6-11",
    ]);
  });

  it("includes all four Other answers in the consultation summary", () => {
    const situation: Situation = {
      ...createInitialSituation(),
      currentMunicipality: "Other",
      nationality: "OTHER",
      visitPurpose: "other",
    };
    expect(summarizeSituation(
      "en",
      situation,
      "unknown",
      ["other"],
      [0, 1, 2, 6],
      { area: "Setagaya City", nationality: "Thailand", visitPurpose: "Attend a conference", family: "Parent" },
    )).toEqual([
      "Area: Setagaya City",
      "Nationality/region: Thailand",
      "Other: Attend a conference",
      "Other family is with me: Parent",
    ]);
  });
});
