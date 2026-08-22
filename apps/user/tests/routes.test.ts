import { describe, expect, it } from "vitest";
import {
  buildStayBridgePath,
  canonicalizeStayBridgePath,
  equivalentStayBridgePath,
  isLocalFilter,
  isSelectableLocale,
  parseStayBridgeRoute,
} from "../src/routing/staybridge-routes";

describe("StayBridge URL routes", () => {
  it("builds every reviewed route shape", () => {
    expect(buildStayBridgePath({ locale: "ja", screen: "landing" })).toBe("/ja/");
    expect(buildStayBridgePath({ locale: "en", screen: "check", query: { step: 4 } })).toBe("/en/check?step=4");
    expect(buildStayBridgePath({ locale: "my", screen: "status" })).toBe("/my/status");
    expect(buildStayBridgePath({ locale: "ja", screen: "roadmap" })).toBe("/ja/roadmap");
    expect(buildStayBridgePath({ locale: "en", screen: "local", query: { filter: "medical" } })).toBe("/en/local?filter=medical");
    expect(buildStayBridgePath({ locale: "my", screen: "help" })).toBe("/my/help");
    expect(buildStayBridgePath({ locale: "ja", screen: "summary" })).toBe("/ja/summary");
  });

  it("parses screen and route query values", () => {
    expect(parseStayBridgeRoute("/en/check?step=8").route.query).toEqual({ step: 8 });
    expect(parseStayBridgeRoute("/en/check", new URLSearchParams("step=9")).route).toEqual({
      locale: "en",
      screen: "check",
      query: { step: 9 },
    });
    expect(parseStayBridgeRoute("/my/local", { filter: "child_support" }).route).toEqual({
      locale: "my",
      screen: "local",
      query: { filter: "child_support" },
    });
  });

  it("redirects unknown and draft locales to ja while preserving valid route queries", () => {
    expect(parseStayBridgeRoute("/zh-CN/check", { step: "3" }).canonicalPath).toBe("/ja/check?step=3");
    expect(parseStayBridgeRoute("/unknown/local", { filter: "school" }).canonicalPath).toBe("/ja/local?filter=school");
    expect(parseStayBridgeRoute("/zh-CN/roadmap").canonicalPath).toBe("/ja/roadmap");
  });

  it("canonicalizes invalid or irrelevant query values", () => {
    expect(canonicalizeStayBridgePath("/ja/check", { step: "10" })).toBe("/ja/check?step=0");
    expect(canonicalizeStayBridgePath("/ja/check", { step: "nope" })).toBe("/ja/check?step=0");
    expect(canonicalizeStayBridgePath("/ja/local", { filter: "unknown" })).toBe("/ja/local?filter=all");
    expect(canonicalizeStayBridgePath("/ja/status", { step: "7", filter: "medical" })).toBe("/ja/status");
  });

  it("treats Vinext's locale-root trailing-slash normalization as equivalent", () => {
    expect(equivalentStayBridgePath("/ja", "/ja/")).toBe(true);
    expect(equivalentStayBridgePath("/ja/check?step=2", "/ja/check/?step=2")).toBe(true);
    expect(equivalentStayBridgePath("/ja/check?step=2", "/ja/check?step=3")).toBe(false);
  });

  it("keeps the selectable locale boundary separate from the twelve-value catalog", () => {
    expect(isSelectableLocale("ja")).toBe(true);
    expect(isSelectableLocale("en")).toBe(true);
    expect(isSelectableLocale("my")).toBe(true);
    expect(isSelectableLocale("zh-CN")).toBe(false);
    expect(isLocalFilter("public_facility")).toBe(true);
    expect(isLocalFilter("other")).toBe(false);
  });
});
