export function resolveMunicipalityAppUrl(
  configuredUrl = process.env.NEXT_PUBLIC_MUNICIPALITY_APP_URL,
): string {
  return configuredUrl?.replace(/\/+$/, "") || "http://localhost:3001";
}
