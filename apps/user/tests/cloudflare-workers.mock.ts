import { vi } from "vitest";

export type MockRecommendationEnv = {
  AI?: { run: ReturnType<typeof vi.fn> };
  AI_USER_RATE_LIMITER?: { limit: ReturnType<typeof vi.fn> };
  AI_GLOBAL_RATE_LIMITER?: { limit: ReturnType<typeof vi.fn> };
};

export const env: MockRecommendationEnv = {};

export function resetRecommendationEnv() {
  env.AI = {
    run: vi.fn().mockResolvedValue({ response: JSON.stringify({ actionIds: [] }) }),
  };
  env.AI_USER_RATE_LIMITER = {
    limit: vi.fn().mockResolvedValue({ success: true }),
  };
  env.AI_GLOBAL_RATE_LIMITER = {
    limit: vi.fn().mockResolvedValue({ success: true }),
  };
}

resetRecommendationEnv();
