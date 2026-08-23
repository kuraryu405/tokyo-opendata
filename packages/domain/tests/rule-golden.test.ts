import { describe, expect, it } from "vitest";
import { generateActions } from "../src/rules";
import { ruleGoldenCases } from "./fixtures/rule-golden";

describe("representative rule golden fixtures", () => {
  it.each(ruleGoldenCases)("keeps $name stable", ({ situation, context, expected }) => {
    const actual = generateActions(situation, context).map(({ id, ruleId, timing, priority, reasonCode }) => ({
      id,
      ruleId,
      timing,
      priority,
      reasonCode,
    }));
    expect(actual).toEqual(expected);
  });
});
