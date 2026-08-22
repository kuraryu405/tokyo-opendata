import { NextRequest, NextResponse } from "next/server";
import { selectableUserLocales, type SelectableUserLocale } from "@staybridge/i18n";

const DEFAULT_LOCALE: SelectableUserLocale = "ja";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/") {
    return NextResponse.redirect(new URL("/ja", request.url));
  }

  const requestedLocale = pathname.split("/")[1];
  const locale = selectableUserLocales.includes(requestedLocale as SelectableUserLocale)
    ? requestedLocale as SelectableUserLocale
    : DEFAULT_LOCALE;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-staybridge-locale", locale);

  return NextResponse.next({ request: { headers: requestHeaders } });
}
