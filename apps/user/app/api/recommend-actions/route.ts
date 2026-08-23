import {
  handleRecommendActionsRequest,
  type RecommendActionsAi,
  type RecommendActionsRateLimiter,
} from "../../../src/ai/recommend-actions";

export async function POST(request: Request): Promise<Response> {
  let bindings: {
    ai?: RecommendActionsAi;
    userRateLimiter?: RecommendActionsRateLimiter;
    globalRateLimiter?: RecommendActionsRateLimiter;
  };
  try {
    const workers = await import("cloudflare:workers");
    const env = isRecord(workers.env) ? workers.env : {};
    bindings = {
      ai: isAiBinding(env.AI) ? env.AI : undefined,
      userRateLimiter: isRateLimiter(env.AI_USER_RATE_LIMITER) ? env.AI_USER_RATE_LIMITER : undefined,
      globalRateLimiter: isRateLimiter(env.AI_GLOBAL_RATE_LIMITER) ? env.AI_GLOBAL_RATE_LIMITER : undefined,
    };
  } catch {
    bindings = {};
  }
  return handleRecommendActionsRequest(request, bindings);
}

function isAiBinding(value: unknown): value is RecommendActionsAi {
  return isRecord(value) && typeof value.run === "function";
}

function isRateLimiter(value: unknown): value is RecommendActionsRateLimiter {
  return isRecord(value) && typeof value.limit === "function";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
