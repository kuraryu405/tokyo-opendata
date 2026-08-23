import { supportedUserLocales, type UserLocale } from "@staybridge/i18n";
import { notFound } from "next/navigation";
import { StayBridgeApp } from "../../../src/components/StayBridgeApp";

export default async function LocalPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!supportedUserLocales.includes(locale as UserLocale)) notFound();
  return <StayBridgeApp initialLocale={locale as UserLocale} initialScreen="local" initialMunicipality="Kita" />;
}
