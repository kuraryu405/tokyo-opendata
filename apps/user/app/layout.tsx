import type { Metadata } from "next";
import { headers } from "next/headers";
import { selectableUserLocales, type SelectableUserLocale } from "@staybridge/i18n";
import "./globals.css";

function resolveSiteUrl(requestHeaders: Pick<Headers, "get">): URL | undefined {
  const forwardedHost = requestHeaders.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || requestHeaders.get("host")?.split(",")[0]?.trim();
  const forwardedProtocol = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProtocol || (host?.startsWith("localhost") || host?.startsWith("127.0.0.1") ? "http" : "https");

  try {
    return host ? new URL(`${protocol}://${host}`) : undefined;
  } catch {
    return undefined;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const siteUrl = resolveSiteUrl(await headers());
  const imageUrl = siteUrl ? new URL("/og.png", siteUrl).toString() : undefined;
  const tagline = "見つけよう。東京での第一歩を。";

  return {
    metadataBase: siteUrl,
    title: {
      default: "StayBridge Tokyo",
      template: "%s | StayBridge Tokyo",
    },
    description:
      `${tagline} Official information and open data, organized into practical next steps for people unexpectedly staying in Tokyo.`,
    openGraph: {
      title: `${tagline} | StayBridge Tokyo`,
      description: tagline,
      type: "website",
      images: imageUrl ? [{ url: imageUrl, width: 1728, height: 909, alt: `${tagline} StayBridge Tokyo` }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: `${tagline} | StayBridge Tokyo`,
      description: tagline,
      images: imageUrl ? [imageUrl] : undefined,
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = resolveRouteLocale(await headers());
  return (
    <html lang={locale}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- Instrument Serif / Inter / Noto Serif JP required for Velorah hero */}
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500&family=Noto+Serif+JP:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}

function resolveRouteLocale(requestHeaders: Pick<Headers, "get">): SelectableUserLocale {
  const locale = requestHeaders.get("x-staybridge-locale");
  return selectableUserLocales.includes(locale as SelectableUserLocale)
    ? locale as SelectableUserLocale
    : "ja";
}
