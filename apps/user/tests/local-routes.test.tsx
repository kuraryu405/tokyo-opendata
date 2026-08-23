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
  it("renders catalog display values for /en/local", async () => {
    window.history.replaceState(null, "", "/en/local");
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      situation: { ...createInitialSituation(), currentMunicipality: "Kita" },
      stayAnswer: "unknown",
      familyAnswers: [],
      answeredSteps: [0],
    }));
    render(<StayBridgeApp />);

    const card = screen.getByRole("heading", { name: "Toyokawa Elementary School" }).closest("article");
    expect(card).not.toBeNull();
    expect(within(card!).getByText("Kita City")).toBeTruthy();
    expect(within(card!).getByText("3-10-23 Toshima, Kita City, Tokyo")).toBeTruthy();
    expect(screen.queryByText("豊川小学校")).toBeNull();
  });

  it("renders catalog display values for /my/local", async () => {
    window.history.replaceState(null, "", "/my/local");
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      situation: { ...createInitialSituation(), currentMunicipality: "Kita" },
      stayAnswer: "unknown",
      familyAnswers: [],
      answeredSteps: [0],
    }));
    render(<StayBridgeApp />);

    const card = (await screen.findByRole("heading", { name: "တိုယိုကာဝါ မူလတန်းကျောင်း" })).closest("article");
    expect(card).not.toBeNull();
    expect(within(card!).getByText("ကီတာမြို့နယ်")).toBeTruthy();
    expect(within(card!).getByText("တိုကျို၊ ကီတာမြို့နယ်၊ တိုယိုရှီမာ ၃-၁၀-၂၃")).toBeTruthy();
    expect(screen.queryByText("豊川小学校")).toBeNull();
  });
});
