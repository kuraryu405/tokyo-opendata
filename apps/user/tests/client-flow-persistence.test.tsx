// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoSituation } from "@staybridge/domain/demo";
import type { Situation } from "@staybridge/domain/types";
import { getUserMessages, selectableUserLocales } from "@staybridge/i18n/client";
import { SITUATION_CONSENT_VERSION } from "@staybridge/worker-runtime";
import { createPendingSituationSubmission } from "../src/consented-persistence";
import { StayBridgeApp } from "../src/components/StayBridgeApp";
import { serializeStoredSession } from "../src/components/staybridge-session";
import { getPersistenceCopy } from "../src/persistence-copy";

const navigation = vi.hoisted(() => {
  let currentPath = "/ja/";
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const navigate = (path: string) => {
    const url = new URL(path, "http://localhost");
    currentPath = `${url.pathname}${url.search}`;
    notify();
  };
  return {
    getPathname: () => currentPath.split("?", 1)[0],
    getSearch: () => currentPath.includes("?") ? currentPath.slice(currentPath.indexOf("?") + 1) : "",
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    push: vi.fn<(path: string) => void>(navigate),
    replace: vi.fn<(path: string) => void>(navigate),
    reset: (path = "/ja/") => {
      currentPath = path;
      notify();
    },
    path: () => currentPath,
  };
});

vi.mock("next/navigation", async () => {
  const React = await import("react");
  return {
    usePathname: () => React.useSyncExternalStore(navigation.subscribe, navigation.getPathname, navigation.getPathname),
    useSearchParams: () => React.useSyncExternalStore(navigation.subscribe, navigation.getSearch, navigation.getSearch),
    useRouter: () => ({ push: navigation.push, replace: navigation.replace }),
  };
});

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={String(href)} {...props}>{children}</a>,
}));

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, String(value)); },
  };
}

function restoreCompleteUserSession() {
  sessionStorage.setItem("staybridge.session", serializeStoredSession({
    provenance: "user",
    situation: demoSituation,
    stayAnswer: "unknown",
    familyAnswers: ["children"],
    answeredSteps: Array.from({ length: 10 }, (_, index) => index),
  }));
}

const testSubmissionCapability = `cap_${"A".repeat(43)}`;

function capabilityResponse(capability = testSubmissionCapability): Response {
  return new Response(JSON.stringify({
    ok: true,
    data: { capability, expiresAt: "2026-08-24T10:05:00.000Z" },
  }), { status: 201, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  navigation.reset();
  navigation.push.mockClear();
  navigation.replace.mockClear();
  vi.stubGlobal("matchMedia", vi.fn<() => { matches: boolean }>().mockReturnValue({ matches: true }));
  vi.stubGlobal("localStorage", memoryStorage());
  vi.stubGlobal("sessionStorage", memoryStorage());
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal("print", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("StayBridge consented persistence", () => {
  it.each(selectableUserLocales)("keeps primary actions before supplemental persistence details in %s", async (locale) => {
    const messages = getUserMessages(locale);
    const persistence = getPersistenceCopy(locale);
    navigation.reset(`/${locale}/status`);
    restoreCompleteUserSession();
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    const nextStep = await screen.findByRole("button", { name: new RegExp(messages.ui.seeRoadmap) });
    const situationConsent = screen.getByRole("heading", { name: persistence.situationTitle });
    expect(nextStep.compareDocumentPosition(situationConsent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const situationDetails = screen.getByText(persistence.detailsTitle).closest("details") as HTMLDetailsElement;
    expect(situationDetails.open).toBe(false);
    expect(within(situationDetails).getByText(persistence.retention)).toBeTruthy();
    expect(screen.getByText(persistence.warning)).toBeTruthy();

    await user.click(nextStep);
    const firstAction = screen.getAllByRole("heading", { level: 3 })[0];
    const conversationConsent = screen.getByRole("heading", { name: persistence.conversationTitle });
    expect(firstAction.compareDocumentPosition(conversationConsent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const conversationDetails = screen.getByText(persistence.detailsTitle).closest("details") as HTMLDetailsElement;
    expect(conversationDetails.open).toBe(false);
    expect(within(conversationDetails).getByText(persistence.deletion)).toBeTruthy();
    expect(screen.getByText(persistence.warning)).toBeTruthy();
  });

  it("saves only allowlisted Situation fields after separate explicit consent", async () => {
    navigation.reset("/ja/status");
    restoreCompleteUserSession();
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(capabilityResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        data: { id: "sit_11111111-1111-4111-8111-111111111111", created: true },
      }), { status: 201, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await user.click(await screen.findByRole("button", { name: "同意して保存" }));
    expect(await screen.findByRole("heading", { name: "削除に必要な情報" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/situation-submission-capabilities");
    const request = fetchMock.mock.calls[1];
    expect(request[0]).toBe("/api/situation-submissions");
    const options = request[1] as RequestInit;
    const body = JSON.parse(String(options.body)) as Record<string, unknown>;
    const answers = body.answers as Record<string, unknown>;
    expect(answers.municipalityCode).toBe("13117");
    expect(answers).not.toHaveProperty("nationality");
    expect(answers).not.toHaveProperty("knownStayDeadline");
    expect(answers).not.toHaveProperty("stayDeadlineKnown");
    expect(answers).not.toHaveProperty("visitPurposeOther");
    expect(String(body.deletionToken)).toHaveLength(43);
    expect(body.capability).toBe(testSubmissionCapability);
    expect(JSON.parse(sessionStorage.getItem("staybridge.saved-situation-credentials") ?? "{}")).toMatchObject({
      version: 1,
      id: "sit_11111111-1111-4111-8111-111111111111",
    });
  });


  it("keeps the Rule Engine journey working after refusal or save failure", async () => {
    navigation.reset("/ja/status");
    restoreCompleteUserSession();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      ok: false,
      error: { code: "SERVICE_UNAVAILABLE", message: "unavailable" },
    }), { status: 503, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await user.click(await screen.findByRole("button", { name: "同意して保存" }));
    expect(await screen.findByText("保存できませんでした。回答と次の案内は引き続き利用できます。")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/situation-submission-capabilities");
    await user.click(screen.getByRole("button", { name: /次のステップを見る/ }));
    expect(screen.getByRole("heading", { name: "あなたの次のステップ" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "このタブだけで続ける" }));
    expect(screen.getByText("このタブだけで案内を続けます。")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "子どもと利用できる地域資源を確認する" })).toBeTruthy();
  });


  it("preserves a versioned pending retry when corrupt saved credentials are discarded", async () => {
    restoreCompleteUserSession();
    const versionedPending = createPendingSituationSubmission(demoSituation);
    sessionStorage.setItem("staybridge.saved-situation-credentials", "{");
    sessionStorage.setItem("staybridge.pending-situation-submission", JSON.stringify(versionedPending));
    navigation.reset("/ja/status");
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    expect(await screen.findByRole("heading", { name: "削除情報を確認できません" })).toBeTruthy();
    expect(screen.getByText(/別の未完了の保存情報も残っています/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "壊れた削除情報だけ破棄" }));

    expect(sessionStorage.getItem("staybridge.saved-situation-credentials")).toBeNull();
    expect(JSON.parse(sessionStorage.getItem("staybridge.pending-situation-submission") ?? "null")).toEqual(versionedPending);
    expect(sessionStorage.getItem("staybridge.session")).not.toBeNull();
    expect(await screen.findByText("保存できませんでした。回答と次の案内は引き続き利用できます。")).toBeTruthy();
    expect(screen.getByRole("button", { name: "同意して保存" })).toBeTruthy();
  });

  it("opens answer review while retaining a retryable pending save", async () => {
    restoreCompleteUserSession();
    const storedPending = JSON.stringify(createPendingSituationSubmission(demoSituation));
    sessionStorage.setItem("staybridge.pending-situation-submission", storedPending);
    navigation.reset("/ja/status");
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await screen.findByText("保存できませんでした。回答と次の案内は引き続き利用できます。");
    await user.click(screen.getByRole("button", { name: "回答を見直す" }));

    await waitFor(() => expect(navigation.path()).toBe("/ja/check?step=0"));
    expect(screen.getByRole("combobox", { name: "東京23区から選択" })).toBeTruthy();
    expect(sessionStorage.getItem("staybridge.pending-situation-submission")).toBe(storedPending);
  });

  it.each(["altered answers", "migrated session", "malformed session"] as const)(
    "restores the initial pending payload after response loss with %s",
    async (sessionChange) => {
    navigation.reset("/ja/status");
    restoreCompleteUserSession();
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(capabilityResponse(`cap_${"A".repeat(43)}`))
      .mockRejectedValueOnce(new TypeError("response lost after request"))
      .mockResolvedValueOnce(capabilityResponse(`cap_${"B".repeat(43)}`))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        data: { id: "sit_33333333-3333-4333-8333-333333333333", created: false },
      }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const firstRender = render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await user.click(await screen.findByRole("button", { name: "同意して保存" }));
    await screen.findByText("保存できませんでした。回答と次の案内は引き続き利用できます。");
    const pendingBeforeReload = sessionStorage.getItem("staybridge.pending-situation-submission");
    expect(pendingBeforeReload).toBeTruthy();
    const firstBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body)) as Record<string, unknown>;
    expect(firstBody.capability).toBe(testSubmissionCapability);
    // The stored snapshot excludes the per-attempt capability entirely.
    const { capability: _sentCapability, ...firstRequestWithoutCapability } = firstBody;
    const pendingSnapshot = JSON.parse(pendingBeforeReload ?? "null") as {
      request: { answers: Record<string, unknown> };
    };
    expect(pendingSnapshot).toEqual({ version: 1, request: firstRequestWithoutCapability });
    expect(pendingSnapshot.request.answers).not.toHaveProperty("nationality");
    expect(pendingSnapshot.request.answers).not.toHaveProperty("knownStayDeadline");
    expect(pendingSnapshot.request.answers).not.toHaveProperty("stayDeadlineKnown");
    expect(pendingSnapshot.request).not.toHaveProperty("capability");

    firstRender.unmount();
    const alteredSituation: Situation = {
      ...demoSituation,
      currentMunicipality: "Shinjuku",
      visitPurpose: "work",
      nationality: "US",
      knownStayDeadline: "2030-12-31",
      needs: ["employment"],
    };
    if (sessionChange === "altered answers") {
      sessionStorage.setItem("staybridge.session", serializeStoredSession({
        provenance: "user",
        situation: alteredSituation,
        stayAnswer: "known",
        familyAnswers: ["none"],
        answeredSteps: Array.from({ length: 10 }, (_, index) => index),
      }));
    } else if (sessionChange === "migrated session") {
      sessionStorage.setItem("staybridge.session", JSON.stringify({
        version: 2,
        situation: alteredSituation,
        stayAnswer: "known",
        familyAnswers: ["none"],
        answeredSteps: Array.from({ length: 10 }, (_, index) => index),
      }));
    } else {
      sessionStorage.setItem("staybridge.session", "{malformed");
    }
    render(<StayBridgeApp assessmentDate="2026-08-23" />);
    await screen.findByText("保存できませんでした。回答と次の案内は引き続き利用できます。");
    await user.click(screen.getByRole("button", { name: "同意して保存" }));
    await screen.findByRole("heading", { name: "削除に必要な情報" });

    const retryBody = JSON.parse(String(fetchMock.mock.calls[3][1]?.body)) as Record<string, unknown>;
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[2][0]).toBe("/api/situation-submission-capabilities");
    expect(retryBody.capability).not.toBe(firstBody.capability);
    expect({ ...retryBody, capability: undefined }).toEqual({ ...firstBody, capability: undefined });
    expect(sessionStorage.getItem("staybridge.pending-situation-submission")).toBeNull();
    expect(sessionStorage.getItem("staybridge.saved-situation-credentials")).toContain("sit_33333333");
    },
  );

  it.each([
    { idempotencyKey: "legacy_request_key", deletionToken: "A".repeat(43) },
    { version: 2, request: {} },
    { version: 1, request: { unexpected: "payload" } },
    {
      version: 1,
      request: {
        consent: { accepted: true, version: SITUATION_CONSENT_VERSION },
        idempotencyKey: "request_key_123456",
        deletionToken: "A".repeat(43),
        answers: {
          municipalityCode: "13117",
          visitPurpose: "tourism",
          departureWindow: "within_30_days",
          returnStatus: "difficult",
          familyAgeGroups: ["6-11"],
          accommodation: "hotel",
          needs: ["medical"],
          japaneseLevel: "beginner",
          nationality: "MMR",
        },
      },
    },
  ])("keeps an incompatible pending format without overwriting or sending it: %#", async (pending) => {
    navigation.reset("/ja/status");
    restoreCompleteUserSession();
    const storedPending = JSON.stringify(pending);
    sessionStorage.setItem("staybridge.pending-situation-submission", storedPending);
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    // An unreadable pending value is protected fail-closed: the corrupt-pending
    // section replaces the normal consent actions until it is explicitly discarded.
    await screen.findByRole("heading", { name: "未完了の保存情報を確認できません" });
    expect(screen.queryByRole("button", { name: "同意して保存" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("staybridge.pending-situation-submission")).toBe(storedPending);
  });


  it("labels conversation consent as a preference without claiming a saved conversation", async () => {
    navigation.reset("/ja/roadmap");
    restoreCompleteUserSession();
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await user.click(await screen.findByRole("button", { name: "会話保存への同意を設定" }));
    expect(screen.getByText(/現在は同意設定の確認のみです/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

});
