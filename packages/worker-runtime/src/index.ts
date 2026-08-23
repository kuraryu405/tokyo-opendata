export type StayBridgeService = "user" | "municipality";

export interface RevisionEnv {
  APP_REVISION?: string;
}

export function createHealthResponse(
  env: RevisionEnv | undefined,
  service: StayBridgeService,
): Response {
  const revision = env?.APP_REVISION?.trim() || "local";

  return Response.json(
    { status: "ok", service, revision },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
