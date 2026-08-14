import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

function resolveSiteUrl(requestHeaders: Pick<Headers, "get">): URL | undefined {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const forwardedHost = requestHeaders.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || requestHeaders.get("host")?.split(",")[0]?.trim();
  const forwardedProtocol = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProtocol || (host?.startsWith("localhost") || host?.startsWith("127.0.0.1") ? "http" : "https");

  try {
    return configuredUrl ? new URL(configuredUrl) : host ? new URL(`${protocol}://${host}`) : undefined;
  } catch {
    return undefined;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const siteUrl = resolveSiteUrl(await headers());
  const imageUrl = siteUrl ? new URL("/og.png", siteUrl).toString() : undefined;

  return {
    metadataBase: siteUrl,
    title: {
      default: "StayBridge Tokyo",
      template: "%s | StayBridge Tokyo",
    },
    description:
      "Official information and open data, organized into the next steps for people unexpectedly unable to return home from Tokyo.",
    openGraph: {
      title: "StayBridge Tokyo",
      description: "国には帰れない。でも、東京での次の一歩は見つけられる。",
      type: "website",
      images: imageUrl ? [{ url: imageUrl, width: 1728, height: 909, alt: "StayBridge Tokyo — 次の一歩を時間軸で示す生活再建ナビゲーション" }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: "StayBridge Tokyo",
      description: "国には帰れない。でも、東京での次の一歩は見つけられる。",
      images: imageUrl ? [imageUrl] : undefined,
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
