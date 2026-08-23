import { describe, expect, it } from "vitest";
import {
  actionIds,
  assertValidUserMessages,
  getUserMessages,
  needKeys,
  reasonCodes,
  supportedUserLocales,
  timingKeys,
  userMessages,
  localResourceCatalogs,
} from "../src/index";
import { localResources } from "@staybridge/data";

describe("user message catalogs", () => {
  it("has a complete typed catalog for every current locale", () => {
    for (const locale of supportedUserLocales) {
      const messages = getUserMessages(locale);
      expect(messages.questions).toHaveLength(10);
      expect(Object.keys(messages.actions)).toHaveLength(actionIds.length);
      expect(Object.keys(messages.reasons)).toHaveLength(reasonCodes.length);
      expect(Object.keys(messages.timing)).toHaveLength(timingKeys.length);
      expect(Object.keys(messages.needs)).toHaveLength(needKeys.length);
      expect(messages.metadata.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(messages.metadata.internalReview.status).toBe("reviewed");
      expect(messages.metadata.expertReview.status).toBe("pending");
    }
  });

  it("rejects malformed or incomplete catalogs at runtime", () => {
    expect(() => assertValidUserMessages({})).toThrow(/Missing user locale catalog/);
    expect(() => assertValidUserMessages({ ja: userMessages.ja, en: userMessages.en, my: { ...userMessages.my, questions: userMessages.my.questions.slice(0, 9) } })).toThrow(/Expected 10 questions/);
    expect(() => assertValidUserMessages({ ja: userMessages.ja, en: { ...userMessages.en, actions: { ...userMessages.en.actions, CHECK_STAY_STATUS: { ...userMessages.en.actions.CHECK_STAY_STATUS, title: "" } } }, my: userMessages.my })).toThrow(/Invalid user catalog value/);
  });

  it("keeps representative full-flow copy in every locale", () => {
    for (const locale of supportedUserLocales) {
      const messages = getUserMessages(locale);
      expect(messages.ui.start).not.toBe("");
      expect(messages.questions[0][0]).not.toBe("");
      expect(messages.actions.CHECK_STAY_STATUS.title).not.toBe("");
      expect(messages.reasons.RETURN_DIFFICULT).not.toBe("");
      expect(messages.ui.summaryTitle).not.toBe("");
      expect(messages.ui.storageError).not.toBe("");
    }
  });

  it("has a non-empty display value for every resource ID in every locale", () => {
    for (const locale of supportedUserLocales) {
      const catalog = localResourceCatalogs[locale];
      expect(Object.keys(catalog)).toHaveLength(localResources.length);
      for (const resource of localResources) {
        const display = catalog[resource.id];
        expect(display.name.trim()).not.toBe("");
        expect(display.municipality.trim()).not.toBe("");
        expect(display.address.trim()).not.toBe("");
        expect(display.description.trim()).not.toBe("");
      }
    }
  });

  it("does not leave Japanese characters in the English local resource catalog", () => {
    for (const display of Object.values(localResourceCatalogs.en)) {
      expect(Object.values(display).join("")).not.toMatch(/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u);
    }
  });
});
