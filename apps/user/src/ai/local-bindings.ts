export function resolveUserWranglerConfigPath(remoteAiValue: string | undefined) {
  return remoteAiValue === "1"
    ? "./wrangler.remote-ai.jsonc"
    : "./wrangler.jsonc";
}
