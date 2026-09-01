import { parseAiActionIds, type AiSelectableActionId } from "@staybridge/domain/ai-actions";

export async function requestRecommendedActions(text: string, signal: AbortSignal): Promise<AiSelectableActionId[] | null> {
  try {
    const response = await fetch("/api/recommend-actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
      signal,
    });
    if (response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json" || !response.ok) return null;
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || Object.keys(payload).length !== 1 || !("actionIds" in payload)) return null;
    return parseAiActionIds(payload.actionIds);
  } catch {
    return null;
  }
}
