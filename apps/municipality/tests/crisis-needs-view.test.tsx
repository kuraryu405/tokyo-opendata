// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CrisisView, getMunicipalityChangesMade, municipalityChangesMadeCopy } from "../src/components/CrisisView";

const baseData = {
  municipality: "13117" as const,
  period: "30d" as const,
  availability: "available" as const,
  freshness: "fresh" as const,
  threshold: 5 as const,
  countBucketSize: 5 as const,
  coverageNote: "同意と投稿条件を確認できた任意回答だけを自治体単位で匿名集計しています。",
  limitations: [] as string[],
};

const jsonResponse = (data: unknown) => new Response(JSON.stringify({ ok: true, data }), {
  status: 200,
  headers: { "content-type": "application/json" },
});

describe("Crisis View suppression rendering", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("withholds the respondent total when an exclusive axis is suppressed", async () => {
    vi.stubGlobal("fetch", vi.fn<(input: string | URL) => Promise<Response>>().mockImplementation(async (input) => {
      const view = new URL(input.toString(), "http://localhost").searchParams.get("view");
      if (view === "accommodation") {
        return jsonResponse({
          ...baseData,
          view: "accommodation",
          hasSuppressedCategories: true,
          categories: [],
          lastUpdatedAt: "2026-08-23",
        });
      }
      return jsonResponse({
        ...baseData,
        view: "needs",
        respondentCount: 10,
        hasSuppressedCategories: false,
        categories: [{ key: "medical", respondentCount: 5 }],
        lastUpdatedAt: "2026-08-23",
      });
    }));

    const user = userEvent.setup();
    render(<CrisisView />);

    expect(await screen.findByText("回答者数 10件以上")).toBeTruthy();

    await user.selectOptions(screen.getByRole("combobox", { name: "表示軸" }), "accommodation");

    expect(await screen.findByText("回答者数 —")).toBeTruthy();
    expect(screen.queryByText(/回答者数 \d/)).toBeNull();
    expect(screen.getByText("件数が少ない区分は表示を控えています。")).toBeTruthy();
    expect(screen.getByText("表示できる区分はありません。件数が少ない数値は表示を控えています。")).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
  });

  it("marks only adapted sources with the municipality changes-made copy", () => {
    expect(getMunicipalityChangesMade("selected_and_normalized")).toBe(municipalityChangesMadeCopy);
    expect(getMunicipalityChangesMade(undefined)).toBeUndefined();
  });

  it("states that Crisis View excludes contributions that were not accepted", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      ...baseData,
      view: "needs",
      categories: [],
      respondentCount: 5,
    })));

    render(<CrisisView />);

    expect(screen.getByText("集計対象として確認できた任意回答のみ")).toBeTruthy();
    expect(screen.getByText(/確認できない回答、会話本文・個票は含まれません/)).toBeTruthy();
  });
});
