// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StayBridgeApp } from "../src/components/StayBridgeApp";
import { demoSituation } from "@staybridge/domain/demo";
import { getUserMessages, selectableUserLocales } from "@staybridge/i18n/client";
import { createInitialSituation, serializeStoredSession } from "../src/components/staybridge-session";

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

function restoreCompleteDemoSession() {
  sessionStorage.setItem("staybridge.session", serializeStoredSession({
    provenance: "demo",
    situation: demoSituation,
    stayAnswer: "unknown",
    familyAnswers: ["children"],
    answeredSteps: Array.from({ length: 10 }, (_, index) => index),
  }));
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

describe("StayBridge client flow: assessment", () => {
  it("keeps a partial ward search visible while requiring an exact option", async () => {
    navigation.reset("/ja/check?step=0");
    restoreCompleteUserSession();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);
    const search = await screen.findByRole("combobox", { name: "東京23区から選択" }) as HTMLInputElement;

    expect(document.querySelector("datalist")).toBeNull();
    fireEvent.focus(search);
    const listbox = screen.getByRole("listbox", { name: "東京23区から選択" });
    expect(listbox).toBeTruthy();
    expect(within(listbox).getAllByRole("option")).toHaveLength(23);
    fireEvent.change(search, { target: { value: "世" } });
    expect(search.value).toBe("世");
    expect(screen.getByRole("option", { name: "世田谷区" })).toBeTruthy();
    expect((screen.getByRole("button", { name: /次へ/ }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(search.value).toBe("世田谷区");
    expect((screen.getByRole("button", { name: /次へ/ }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("finds a ward by hiragana and ignores the Enter used to confirm IME composition", async () => {
    navigation.reset("/ja/check?step=0");
    restoreCompleteUserSession();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);
    const search = await screen.findByRole("combobox", { name: "東京23区から選択" }) as HTMLInputElement;

    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: "あらかわ" } });
    expect(screen.getByRole("option", { name: "荒川区" })).toBeTruthy();
    fireEvent.change(search, { target: { value: "荒川" } });
    fireEvent.keyDown(search, { key: "Enter", keyCode: 229, isComposing: true });
    expect(search.value).toBe("荒川");
    expect((screen.getByRole("button", { name: /次へ/ }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.keyDown(search, { key: "Enter" });
    expect(search.value).toBe("荒川区");
    expect((screen.getByRole("button", { name: /次へ/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("does not render internal defaults as selected before each single-answer step is answered", async () => {
    const user = userEvent.setup();
    navigation.reset("/ja/check?step=2");
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      provenance: "user",
      situation: { ...createInitialSituation(), currentMunicipality: "Kita", nationality: "MM" },
      stayAnswer: "unknown",
      familyAnswers: [],
      answeredSteps: [0, 1],
    }));
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await screen.findByRole("radio", { name: "旅行" });
    expect(screen.queryByRole("radio", { name: "分からない / 答えたくない" })).toBeNull();
    expect(screen.getAllByRole("radio").every((radio) => !(radio as HTMLInputElement).checked)).toBe(true);
    await user.click(screen.getByRole("radio", { name: "旅行" }));
    await user.click(screen.getByRole("button", { name: "次へ" }));
    expect(screen.queryByRole("radio", { name: "分からない" })).toBeNull();
    expect((screen.getByRole("radio", { name: "3か月以降" }) as HTMLInputElement).checked).toBe(false);
    await user.click(screen.getByRole("radio", { name: "7日以内" }));
    await user.click(screen.getByRole("button", { name: "次へ" }));
    expect((screen.getByRole("radio", { name: "分からない" }) as HTMLInputElement).checked).toBe(false);
    await user.click(screen.getByRole("radio", { name: "帰国できる" }));
    await user.click(screen.getByRole("button", { name: "次へ" }));
    expect((screen.getByRole("radio", { name: "分からない" }) as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByRole("radio", { name: "書類を確認したい" })).toBeNull();
    await user.click(screen.getByRole("radio", { name: "分からない" }));
    await user.click(screen.getByRole("button", { name: "次へ" }));
    const noFamily = screen.getByRole("checkbox", { name: "いない" });
    await user.click(noFamily);
    expect((noFamily as HTMLInputElement).checked).toBe(true);
    await user.click(screen.getByRole("button", { name: "次へ" }));
    expect(screen.queryByRole("radio", { name: "答えたくない" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "今後の滞在場所に不安がある" })).toBeNull();
    const accommodationOther = screen.getByRole("radio", { name: "その他" });
    expect((accommodationOther as HTMLInputElement).checked).toBe(false);
    await user.click(accommodationOther);
    expect((accommodationOther as HTMLInputElement).checked).toBe(true);
    const accommodationDetails = screen.getByRole("textbox", { name: "その他の滞在場所を入力" }) as HTMLTextAreaElement;
    expect(accommodationDetails.maxLength).toBe(100);
    expect((screen.getByRole("button", { name: "次へ" }) as HTMLButtonElement).disabled).toBe(true);
    await user.type(accommodationDetails, "友人が手配した場所");
    await user.click(screen.getByRole("button", { name: "次へ" }));
    const needsOther = screen.getByRole("checkbox", { name: "その他" });
    await user.click(needsOther);
    const needsDetails = screen.getByRole("textbox", { name: "その他の困りごとを入力" }) as HTMLTextAreaElement;
    expect(needsDetails.maxLength).toBe(100);
    expect((screen.getByRole("button", { name: "次へ" }) as HTMLButtonElement).disabled).toBe(true);
    await user.type(needsDetails, "生活に必要な手続");
    await user.click(screen.getByRole("button", { name: "次へ" }));
    expect((screen.getByRole("radio", { name: "ほとんど話せない" }) as HTMLInputElement).checked).toBe(false);
  });

  it.each(selectableUserLocales)("offers 23 searchable wards and localized Q2 Other details in %s", async (locale) => {
    const messages = getUserMessages(locale);
    navigation.reset(`/${locale}/check?step=0`);
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-24" />);

    const firstSearch = (await screen.findAllByRole("combobox")).find((element) => element instanceof HTMLInputElement) as HTMLInputElement;
    expect(messages.questions[0][2]).toHaveLength(23);
    expect(messages.questions[0][2].some(([value]) => value === "Other")).toBe(false);
    fireEvent.change(firstSearch, { target: { value: messages.questions[0][2][0][1] } });
    await user.click(screen.getByRole("button", { name: new RegExp(messages.ui.next) }));

    const secondSearch = screen.getAllByRole("combobox").find((element) => element instanceof HTMLInputElement) as HTMLInputElement;
    const otherLabel = messages.questions[1][2].find(([value]) => value === "OTHER")?.[1] ?? "";
    expect(messages.questions[1][2]).toHaveLength(250);
    fireEvent.focus(secondSearch);
    const countryListbox = screen.getByRole("listbox");
    expect(within(countryListbox).getAllByRole("option")).toHaveLength(249);
    expect(within(countryListbox).queryByRole("option", { name: otherLabel })).toBeNull();
    await user.click(screen.getByRole("button", { name: otherLabel }));
    expect(screen.getByRole("button", { name: otherLabel }).getAttribute("aria-pressed")).toBe("true");
    const textarea = screen.getByRole("textbox", { name: messages.otherAnswers.nationality.label }) as HTMLTextAreaElement;
    expect(textarea.maxLength).toBe(100);
    expect(textarea.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText(messages.otherAnswers.nationality.notice)).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe(messages.otherAnswers.nationality.required);
    expect((screen.getByRole("button", { name: new RegExp(messages.ui.next) }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("requires an explicit child age instead of assuming school age", async () => {
    navigation.reset("/ja/check?step=6");
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      provenance: "user",
      situation: { ...demoSituation, familyMembers: { children: [] } },
      stayAnswer: "known",
      familyAnswers: [],
      answeredSteps: [0, 1, 2, 3, 4, 5],
    }));
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);
    await screen.findByRole("heading", { name: "一緒に日本にいる家族はいますか？" });

    await user.click(screen.getByRole("checkbox", { name: "子どもがいる" }));
    expect(screen.getByRole("button", { name: /次へ/ }).hasAttribute("disabled")).toBe(true);
    expect(screen.queryByText("6-11", { selector: ".age-options .selected" })).toBeNull();

    await user.click(screen.getByRole("checkbox", { name: "3-5" }));
    expect((screen.getByRole("button", { name: /次へ/ }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole("checkbox", { name: "3-5" }).closest(".age-chip")!.classList.contains("selected")).toBe(true);

    await user.click(screen.getByRole("checkbox", { name: "3-5" }));
    expect(screen.getByRole("button", { name: /次へ/ }).hasAttribute("disabled")).toBe(true);
  });

  it("tracks several child ages through rules, summary, and reload", async () => {
    navigation.reset("/ja/check?step=6");
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      provenance: "user",
      situation: { ...demoSituation, familyMembers: { children: [] }, needs: [] },
      stayAnswer: "unknown",
      familyAnswers: [],
      answeredSteps: [0, 1, 2, 3, 4, 5],
    }));
    const user = userEvent.setup();
    const firstRender = render(<StayBridgeApp assessmentDate="2026-08-23" />);
    await screen.findByRole("heading", { name: "一緒に日本にいる家族はいますか？" });

    await user.click(screen.getByRole("checkbox", { name: "子どもがいる" }));
    await user.click(screen.getByRole("checkbox", { name: "3-5" }));
    expect(screen.queryByRole("checkbox", { name: "6-11" })?.closest(".age-chip")?.classList.contains("selected")).toBe(false);
    await user.click(screen.getByRole("button", { name: /次へ/ }));

    await user.click(screen.getByRole("radio", { name: "賃貸住宅" }));
    await user.click(screen.getByRole("button", { name: /次へ/ }));
    await user.click(screen.getByRole("checkbox", { name: "子どもの学校・教育" }));
    await user.click(screen.getByRole("checkbox", { name: "子どもの生活" }));
    await user.click(screen.getByRole("button", { name: /次へ/ }));
    await user.click(screen.getByRole("radio", { name: "日常会話ができる" }));
    await user.click(screen.getByRole("button", { name: /状況を整理する/ }));

    await user.click(await screen.findByRole("button", { name: /次のステップを見る/ }));
    expect(screen.getByRole("heading", { name: "子どもと利用できる地域資源を確認する" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "子どもの教育について相談する" })).toBeNull();

    navigation.reset("/ja/check?step=6");
    await screen.findByRole("heading", { name: "一緒に日本にいる家族はいますか？" });
    await user.click(screen.getByRole("checkbox", { name: "6-11" }));
    await user.click(screen.getByRole("button", { name: "わたしのステップ" }));

    expect(screen.getByRole("heading", { name: "子どもと利用できる地域資源を確認する" })).toBeTruthy();
    // The education card stays fail-closed while the school source publishes zero rows.
    expect(screen.queryByRole("heading", { name: "子どもの教育について相談する" })).toBeNull();
    await waitFor(() => expect(sessionStorage.getItem("staybridge.session")).toContain('"children":[{"ageGroup":"3-5"},{"ageGroup":"6-11"}]'));

    navigation.reset("/ja/summary");
    firstRender.unmount();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);
    expect(await screen.findByText(/年齢: 3-5、6-11/)).toBeTruthy();
  });

  it("accepts a past stay deadline and shows the urgent deadline rules", async () => {
    navigation.reset("/ja/check?step=5");
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      provenance: "user",
      situation: {
        ...demoSituation,
        returnStatus: "possible",
        stayDeadlineKnown: false,
        knownStayDeadline: undefined,
        accommodation: "rental",
        japaneseLevel: "advanced",
        familyMembers: { children: [] },
        needs: [],
      },
      stayAnswer: "unknown",
      familyAnswers: ["none"],
      answeredSteps: Array.from({ length: 10 }, (_, index) => index),
    }));
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);
    await screen.findByRole("heading", { name: "日本にいつまで滞在できるか分かりますか？" });

    await user.click(screen.getByRole("radio", { name: "分かっている" }));
    const deadline = screen.getByLabelText("滞在できる期限（任意）") as HTMLInputElement;
    expect(deadline.getAttribute("min")).toBeNull();
    await user.type(deadline, "2026-08-22");
    expect(deadline.value).toBe("2026-08-22");
    await user.click(screen.getByRole("button", { name: "わたしのステップ" }));

    const urgentStay = await screen.findByRole("heading", { name: "日本に滞在できる期間を確認する" });
    const urgentCard = urgentStay.closest("article");
    expect(urgentCard).not.toBeNull();
    expect(within(urgentCard!).queryByText(/優先度/)).toBeNull();
    expect(within(urgentCard!).queryByText("R-STAY-DEADLINE-PAST")).toBeNull();
    expect(within(urgentCard!).getByText("入力した滞在期限を過ぎているため、すぐに公式窓口へ状況を確認する案内を表示しています。")).toBeTruthy();
    expect(within(urgentCard!).getByRole("button", { name: /公式相談先を見る/ })).toBeTruthy();
  });

  it("keeps the self-reported status review free of confirmation checkmarks", async () => {
    navigation.reset("/ja/status");
    restoreCompleteDemoSession();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    expect(await screen.findByRole("heading", { name: "回答を確認して、次の行動へ進みましょう" })).toBeTruthy();
    const resultPage = document.querySelector(".result-page");
    expect(resultPage).not.toBeNull();
    expect(resultPage!.textContent).not.toContain("✓");
  });
});
