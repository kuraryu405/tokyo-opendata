// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StayBridgeApp } from "../src/components/StayBridgeApp";

afterEach(cleanup);

describe("localized Local Action routes", () => {
  it("renders catalog display values for /en/local", async () => {
    window.history.replaceState(null, "", "/en/local");
    render(<StayBridgeApp initialLocale="en" initialScreen="local" initialMunicipality="Kita" />);

    const card = (await screen.findByRole("heading", { name: "Toyokawa Elementary School" })).closest("article");
    expect(card).not.toBeNull();
    expect(within(card!).getByText("Kita City")).toBeTruthy();
    expect(within(card!).getByText("3-10-23 Toshima, Kita City, Tokyo")).toBeTruthy();
    expect(screen.getByRole("combobox").getAttribute("disabled")).not.toBeNull();
    expect(screen.queryByText("豊川小学校")).toBeNull();
  });

  it("renders catalog display values for /my/local", async () => {
    window.history.replaceState(null, "", "/my/local");
    render(<StayBridgeApp initialLocale="my" initialScreen="local" initialMunicipality="Kita" />);

    const card = (await screen.findByRole("heading", { name: "တိုယိုကာဝါ မူလတန်းကျောင်း" })).closest("article");
    expect(card).not.toBeNull();
    expect(within(card!).getByText("ကီတာမြို့နယ်")).toBeTruthy();
    expect(within(card!).getByText("တိုကျို၊ ကီတာမြို့နယ်၊ တိုယိုရှီမာ ၃-၁၀-၂၃")).toBeTruthy();
    expect(screen.getByRole("combobox").getAttribute("disabled")).not.toBeNull();
    expect(screen.queryByText("豊川小学校")).toBeNull();
  });
});
