import { describe, expect, it } from "vitest";
import { assessmentOptionCodes } from "@staybridge/domain/selection-coverage";
import { getUserMessages, selectableUserLocales } from "@staybridge/i18n/client";

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

describe("rule inputs and rendered assessment options", () => {
  it.each(selectableUserLocales)("keeps every %s option code aligned with the rule coverage table", (locale) => {
    const questions = getUserMessages(locale).questions;
    const actual = Object.fromEntries(questionKeys.map((key, index) => [key, questions[index][2].map(([code]) => code)]));
    const expected = Object.fromEntries(questionKeys.map((key) => [key, assessmentOptionCodes[key]]));
    expect(actual).toEqual(expected);
  });
});
