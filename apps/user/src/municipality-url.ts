export const municipalityAppRoute = "/crisis";

export function resolveMunicipalityAppUrl(configuredUrl?: string): string {
  return normalizeAppUrl(configuredUrl) ?? "http://localhost:3001";
}

export function createMunicipalityAppRedirect(configuredUrl: string | undefined, requestUrl: string): Response {
  const localRequest = isLocalRequest(requestUrl);
  const target = normalizeAppUrl(configuredUrl, !localRequest) ??
    (localRequest ? "http://localhost:3001" : undefined);
  if (!target) {
    return new Response("Municipality application URL is unavailable.", {
      status: 503,
      headers: { "cache-control": "no-store" },
    });
  }
  return Response.redirect(target, 307);
}

function isLocalRequest(requestUrl: string): boolean {
  try {
    return ["localhost", "127.0.0.1", "::1"].includes(new URL(requestUrl).hostname);
  } catch {
    return false;
  }
}

function normalizeAppUrl(configuredUrl?: string, requireHttps = false): string | undefined {
  try {
    const url = new URL(configuredUrl ?? "");
    if (!(["http:", "https:"] as string[]).includes(url.protocol)) return undefined;
    if (requireHttps && url.protocol !== "https:") return undefined;
    if (url.username || url.password) return undefined;
    return url.toString().replace(/\/+$/, "");
  } catch {
    return undefined;
  }
}
