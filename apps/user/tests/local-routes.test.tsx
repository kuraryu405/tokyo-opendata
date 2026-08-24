// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StayBridgeApp } from "../src/components/StayBridgeApp";
import { createInitialSituation, serializeStoredSession } from "../src/components/staybridge-session";

vi.mock("next/navigation", () => ({
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push: vi.fn<(path: string) => void>(), replace: vi.fn<(path: string) => void>() }),
}));

afterEach(cleanup);

beforeEach(() => {
  sessionStorage.clear();
});

describe("localized Local Action routes", () => {
  it("renders source-backed facility facts with an English safety description for /en/local", async () => {
    window.history.replaceState(null, "", "/en/local");
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      provenance: "user",
      situation: { ...createInitialSituation(), currentMunicipality: "Kita" },
      stayAnswer: "unknown",
      familyAnswers: [],
      answeredSteps: [0],
    }));
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    const card = screen.getByRole("heading", { name: "おうじキッズクリニック" }).closest("article");
    expect(card).not.toBeNull();
    expect(within(card!).getByText("Kita")).toBeTruthy();
    expect(within(card!).getByText("東京都北区王子五丁目1-40サミットストア王子桜田通り店2階12室")).toBeTruthy();
    expect(within(card!).getByText("A medical institution. Confirm services and appointment requirements directly.")).toBeTruthy();
  });

  it("renders source-backed facility facts with a Burmese safety description for /my/local", async () => {
    window.history.replaceState(null, "", "/my/local");
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      provenance: "user",
      situation: { ...createInitialSituation(), currentMunicipality: "Kita" },
      stayAnswer: "unknown",
      familyAnswers: [],
      answeredSteps: [0],
    }));
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    const card = (await screen.findByRole("heading", { name: "おうじキッズクリニック" })).closest("article");
    expect(card).not.toBeNull();
    expect(within(card!).getByText("Kita")).toBeTruthy();
    expect(within(card!).getByText("東京都北区王子五丁目1-40サミットストア王子桜田通り店2階12室")).toBeTruthy();
    expect(within(card!).getByText("ဆေးဘက်ဆိုင်ရာအဖွဲ့အစည်းဖြစ်ပါသည်။ ဝန်ဆောင်မှုနှင့် ကြိုတင်ချိန်းဆိုမှုကို တိုက်ရိုက်အတည်ပြုပါ။")).toBeTruthy();
  });
});
