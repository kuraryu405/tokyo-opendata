import { redirect } from "next/navigation";
import { StayBridgeApp } from "../../../../../src/components/StayBridgeApp";
import { getTokyoAssessmentDate } from "../../../../../src/assessment-date";
import { parseStayBridgeRoute } from "../../../../../src/routing/staybridge-routes";

export default async function RoadmapActionPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; actionId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale, actionId }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>),
  ]);
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(resolvedSearchParams)) {
    if (Array.isArray(v)) {
      for (const val of v) search.append(k, val);
    } else if (v !== undefined) {
      search.set(k, String(v));
    }
  }
  const queryString = search.toString();
  const requestedPath = `/${locale}/roadmap/action/${actionId}${queryString ? `?${queryString}` : ""}`;
  const parsed = parseStayBridgeRoute(requestedPath, resolvedSearchParams);
  if (requestedPath !== parsed.canonicalPath) redirect(parsed.canonicalPath);
  return <StayBridgeApp route={parsed.route} assessmentDate={getTokyoAssessmentDate()} />;
}
