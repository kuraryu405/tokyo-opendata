export const env = {
  AI: {
    async run(..._args: unknown[]) {
      return { response: JSON.stringify({ actionIds: [] }) };
    },
  },
  AI_USER_RATE_LIMITER: {
    async limit(..._args: unknown[]) {
      return { success: true };
    },
  },
  AI_GLOBAL_RATE_LIMITER: {
    async limit(..._args: unknown[]) {
      return { success: true };
    },
  },
};
