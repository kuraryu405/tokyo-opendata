import { redirect } from "next/navigation";
import { selectableUserLocales, type SelectableUserLocale } from "@staybridge/i18n";
import { DeleteSavedSituation } from "../../../src/components/DeleteSavedSituation";

export default async function DeleteSavedSituationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!selectableUserLocales.includes(locale as SelectableUserLocale)) {
    redirect("/ja/delete");
  }
  return <DeleteSavedSituation locale={locale as SelectableUserLocale} />;
}
