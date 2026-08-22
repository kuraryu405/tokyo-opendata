import { NextRequest, NextResponse } from "next/server";
import { selectableUserLocales, type SelectableUserLocale } from "@staybridge/i18n";
import { buildStayBridgePath, isLocalFilter, isValidStep, type StayBridgeScreen } from "./src/routing/staybridge-routes";

const DEFAULT_LOCALE: SelectableUserLocale = "ja";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/") {
    const requestedScreen = request.nextUrl.searchParams.get("screen");
    const screenByLegacyParam: Record<string, StayBridgeScreen> = {
      landing: "landing",
      check: "check",
      status: "status",
      roadmap: "roadmap",
      local: "local",
      help: "help",
      summary: "summary",
    };
    const screen = screenByLegacyParam[requestedScreen ?? ""] ?? "landing";
    const query = screen === "check"
      ? { step: Number(request.nextUrl.searchParams.get("step")) }
      : screen === "local"
        ? { filter: request.nextUrl.searchParams.get("filter") ?? undefined }
        : {};
    return NextResponse.redirect(new URL(buildStayBridgePath({ locale: "ja", screen, query: {
      ...(screen === "check" && isValidStep(query.step) ? { step: query.step } : {}),
      ...(screen === "local" && isLocalFilter(query.filter) ? { filter: query.filter } : {}),
    } }), request.url));
  }

  const requestedLocale = pathname.split("/")[1];
  const locale = selectableUserLocales.includes(requestedLocale as SelectableUserLocale)
    ? requestedLocale as SelectableUserLocale
    : DEFAULT_LOCALE;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-staybridge-locale", locale);

  return NextResponse.next({ request: { headers: requestHeaders } });
}
