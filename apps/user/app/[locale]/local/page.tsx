import { selectableUserLocales, type SelectableUserLocale } from "@staybridge/i18n/client";
import { notFound } from "next/navigation";
import { StayBridgeApp } from "../../../src/components/StayBridgeApp";

export default async function LocalPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!selectableUserLocales.includes(locale as SelectableUserLocale)) notFound();
  return <StayBridgeApp initialLocale={locale as SelectableUserLocale} initialScreen="local" initialMunicipality="Kita" />;
}
