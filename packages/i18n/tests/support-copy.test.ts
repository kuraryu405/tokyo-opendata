import { describe, expect, it } from "vitest";
import {
  consultationSourcesByNeed,
  humanHandoffSourceIds,
  sourceRegistry,
  supportSourceIds,
} from "@staybridge/data";
import { supportCopy, type LocalizedSupportText } from "../src";

const locales = ["ja", "en", "my"] as const;
const japaneseScript = /[\u3040-\u30ff\u3400-\u9fff]/u;

describe("support source copy", () => {
  it("has complete localized answers for all support sources", () => {
    expect(supportSourceIds).toHaveLength(29);
    expect(new Set(supportSourceIds).size).toBe(29);

    for (const id of supportSourceIds) {
      expect(sourceRegistry[id], `${id} is registered`).toBeTruthy();
      expect(sourceRegistry[id]).not.toHaveProperty("answersInText");
      for (const locale of locales) {
        expect(supportCopy[id].answersInText[locale].trim(), `${id}.answersInText.${locale}`).not.toBe("");
      }
    }
  });

  it("has all three note keys for every displayed support source", () => {
    const displayedIds = [...new Set([
      ...Object.values(consultationSourcesByNeed).flat(),
      ...humanHandoffSourceIds,
    ])];

    expect(displayedIds).toHaveLength(27);
    for (const id of displayedIds) {
      const notes: LocalizedSupportText = supportCopy[id].notes;
      expect(Object.keys(notes).sort(), `${id}.notes keys`).toEqual([...locales].sort());
      const values = locales.map((locale) => notes[locale].trim());
      expect(
        values.every(Boolean) || values.every((value) => value === ""),
        `${id}.notes must be translated in every locale or empty in every locale`,
      ).toBe(true);
    }
  });

  it("does not put Japanese app copy in English or Myanmar fields", () => {
    for (const id of supportSourceIds) {
      for (const locale of ["en", "my"] as const) {
        expect(supportCopy[id].answersInText[locale], `${id}.answersInText.${locale}`).not.toMatch(japaneseScript);
        expect(supportCopy[id].notes[locale], `${id}.notes.${locale}`).not.toMatch(japaneseScript);
      }
    }
  });
});
