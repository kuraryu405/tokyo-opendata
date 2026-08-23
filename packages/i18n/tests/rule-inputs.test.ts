import { describe, expect, it } from "vitest";
import { assessmentOptionCodes } from "@staybridge/domain/selection-coverage";
import { userMessages } from "../src";

const questionKeys = [
  "municipality",
  "nationality",
  "visitPurpose",
  "departureWindow",
  "returnStatus",
  "stayAnswer",
  "family",
  "accommodation",
  "needs",
  "japaneseLevel",
] as const;

describe("all locale assessment inputs", () => {
  it.each(Object.entries(userMessages))("keeps %s labels mapped to the production answer codes", (_locale, messages) => {
    const actual = Object.fromEntries(questionKeys.map((key, index) => [key, messages.questions[index][2].map(([code]) => code)]));
    const expected = Object.fromEntries(questionKeys.map((key) => [key, assessmentOptionCodes[key]]));
    expect(actual).toEqual(expected);
  });
});
