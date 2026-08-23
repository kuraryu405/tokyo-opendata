import { vi } from "vitest";

type MockAiRun = (model: string, input: Record<string, unknown>, options?: Record<string, unknown>) => Promise<unknown>;
type MockRateLimit = (options: { key: string }) => Promise<{ success: boolean }>;

export type MockRecommendationEnv = {
  AI?: { run: ReturnType<typeof vi.fn<MockAiRun>> };
  AI_USER_RATE_LIMITER?: { limit: ReturnType<typeof vi.fn<MockRateLimit>> };
  AI_GLOBAL_RATE_LIMITER?: { limit: ReturnType<typeof vi.fn<MockRateLimit>> };
};

export const env: MockRecommendationEnv = {};

export function resetRecommendationEnv() {
  env.AI = {
    run: vi.fn<MockAiRun>().mockResolvedValue({ response: JSON.stringify({ actionIds: [] }) }),
  };
  env.AI_USER_RATE_LIMITER = {
    limit: vi.fn<MockRateLimit>().mockResolvedValue({ success: true }),
  };
  env.AI_GLOBAL_RATE_LIMITER = {
    limit: vi.fn<MockRateLimit>().mockResolvedValue({ success: true }),
  };
}

resetRecommendationEnv();
