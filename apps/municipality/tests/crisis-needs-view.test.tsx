// @vitest-environment jsdom

import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CRISIS_NEEDS_REQUEST_TIMEOUT_MS,
  CrisisView,
  getMunicipalityChangesMade,
  municipalityChangesMadeCopy,
} from "../src/components/CrisisView";

const baseData = {
  municipality: "13117" as const,
  period: "30d" as const,
  availability: "available" as const,
  freshness: "fresh" as const,
  threshold: 5 as const,
  countBucketSize: 5 as const,
  coverageNote: "同意済みの任意回答だけを自治体単位で匿名集計しています。",
  limitations: [] as string[],
};

const availableData = (overrides: Record<string, unknown> = {}) => ({
  ...baseData,
  view: "needs" as const,
  submissionCount: 10,
  hasSuppressedCategories: false,
  categories: [{ key: "medical", submissionCount: 5 }],
  lastUpdatedAt: "2026-08-23",
  ...overrides,
});

const jsonResponse = (data: unknown) => new Response(JSON.stringify({ ok: true, data }), {
  status: 200,
  headers: { "content-type": "application/json" },
});

describe("Crisis View suppression rendering", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("withholds the submission total when an exclusive axis is suppressed", async () => {
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
      return jsonResponse(availableData());
    }));

    const user = userEvent.setup();
    render(<CrisisView />);

    expect(await screen.findByText("回答件数 10件以上")).toBeTruthy();

    await user.selectOptions(screen.getByRole("combobox", { name: "表示軸" }), "accommodation");

    expect(await screen.findByText("回答件数 —")).toBeTruthy();
    expect(screen.queryByText(/回答件数 \d/)).toBeNull();
    expect(screen.getByText("件数が少ない区分は表示を控えています。")).toBeTruthy();
    expect(screen.getByText("表示できる区分はありません。件数が少ない数値は表示を控えています。")).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
  });

  it("moves a never-resolving request from loading to error and aborts it after the timeout", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_input: string | URL, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => undefined);
    }));

    render(<CrisisView />);

    expect(screen.getByText("匿名集計を確認しています…")).toBeTruthy();
    expect(signal?.aborted).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CRISIS_NEEDS_REQUEST_TIMEOUT_MS);
    });

    expect(signal?.aborted).toBe(true);
    expect(screen.getByTestId("crisis-needs-error")).toBeTruthy();
    expect(screen.queryByText("匿名集計を確認しています…")).toBeNull();
  });

  it("times out while response.json is still pending without allowing the late body to overwrite error", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    let resolveBody: ((value: unknown) => void) | undefined;
    const response = jsonResponse(availableData());
    const jsonSpy = vi.spyOn(response, "json").mockImplementation(() => new Promise((resolve) => {
      resolveBody = resolve;
    }));
    vi.stubGlobal("fetch", vi.fn((_input: string | URL, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return Promise.resolve(response);
    }));

    render(<CrisisView />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(jsonSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CRISIS_NEEDS_REQUEST_TIMEOUT_MS);
    });

    expect(signal?.aborted).toBe(true);
    expect(screen.getByTestId("crisis-needs-error")).toBeTruthy();

    await act(async () => {
      resolveBody?.({ ok: true, data: availableData() });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId("crisis-needs-error")).toBeTruthy();
    expect(screen.queryByTestId("crisis-needs-available")).toBeNull();
  });

  it("can retry with new conditions after a timed-out request", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<(input: string | URL) => Promise<Response>>().mockImplementation((input) => {
      const period = new URL(input.toString(), "http://localhost").searchParams.get("period");
      if (period === "30d") return new Promise<Response>(() => undefined);
      return Promise.resolve(jsonResponse(availableData({ period: "7d" })));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CrisisView />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CRISIS_NEEDS_REQUEST_TIMEOUT_MS);
    });
    expect(screen.getByTestId("crisis-needs-error")).toBeTruthy();

    await act(async () => {
      fireEvent.change(screen.getByRole("combobox", { name: "対象期間" }), { target: { value: "7d" } });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId("crisis-needs-available")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not let an old delayed response overwrite a newer request", async () => {
    let resolveFirst: ((value: Response) => void) | undefined;
    const firstResponse = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const fetchMock = vi.fn<(input: string | URL) => Promise<Response>>().mockImplementation((input) => {
      const view = new URL(input.toString(), "http://localhost").searchParams.get("view");
      if (view === "needs") return firstResponse;
      return Promise.resolve(jsonResponse(availableData({
        view: "accommodation",
        categories: [{ key: "unstable", submissionCount: 5 }],
      })));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CrisisView />);

    await act(async () => {
      fireEvent.change(screen.getByRole("combobox", { name: "表示軸" }), { target: { value: "accommodation" } });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText("不安定")).toBeTruthy();

    await act(async () => {
      resolveFirst?.(jsonResponse(availableData({ categories: [{ key: "medical", submissionCount: 20 }] })));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("不安定")).toBeTruthy();
    expect(screen.queryByText("医療")).toBeNull();
  });

  it("renders the existing error state for a 503 response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: false }), {
      status: 503,
      headers: { "content-type": "application/json" },
    })));

    render(<CrisisView />);

    expect(await screen.findByTestId("crisis-needs-error")).toBeTruthy();
  });

  it("renders the existing error state for malformed JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{", {
      status: 200,
      headers: { "content-type": "application/json" },
    })));

    render(<CrisisView />);

    expect(await screen.findByTestId("crisis-needs-error")).toBeTruthy();
  });

  it("aborts the in-flight request when the component unmounts", () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_input: string | URL, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => undefined);
    }));

    const view = render(<CrisisView />);
    expect(signal?.aborted).toBe(false);

    view.unmount();

    expect(signal?.aborted).toBe(true);
  });

  it("marks only adapted sources with the municipality changes-made copy", () => {
    expect(getMunicipalityChangesMade("selected_and_normalized")).toBe(municipalityChangesMadeCopy);
    expect(getMunicipalityChangesMade(undefined)).toBeUndefined();
  });
});
