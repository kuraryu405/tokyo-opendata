/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import {
  createHealthResponse,
  createMethodNotAllowedResponse,
  createReadinessResponse,
  type BackendEnv,
} from "@staybridge/worker-runtime";
import { handleSupportChatRequest, type SupportChatAi, type SupportChatRateLimiter } from "../src/ai/support-chat";
import {
  handleRecommendActionsRequest,
  type RecommendActionsAi,
  type RecommendActionsRateLimiter,
} from "../src/ai/recommend-actions";

interface Env extends BackendEnv {
  AI?: SupportChatAi & RecommendActionsAi;
  SUPPORT_CHAT_RATE_LIMITER?: SupportChatRateLimiter;
  AI_USER_RATE_LIMITER?: RecommendActionsRateLimiter;
  AI_GLOBAL_RATE_LIMITER?: RecommendActionsRateLimiter;
  ASSETS: Fetcher;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env | undefined, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/support-chat") {
      return handleSupportChatRequest(request, {
        ai: env?.AI,
        rateLimiter: env?.SUPPORT_CHAT_RATE_LIMITER,
      });
    }

    if (url.pathname === "/api/recommend-actions") {
      return handleRecommendActionsRequest(request, {
        ai: env?.AI,
        userRateLimiter: env?.AI_USER_RATE_LIMITER,
        globalRateLimiter: env?.AI_GLOBAL_RATE_LIMITER,
      });
    }

    if (request.method === "GET" && url.pathname === "/healthz") {
      return createHealthResponse(env, "user");
    }

    if (url.pathname === "/healthz") {
      return createMethodNotAllowedResponse();
    }

    if (request.method === "GET" && url.pathname === "/readyz") {
      return createReadinessResponse(env);
    }

    if (url.pathname === "/readyz") {
      return createMethodNotAllowedResponse();
    }

    if (url.pathname === "/_vinext/image") {
      if (!env) {
        return new Response("Image bindings are unavailable.", { status: 503 });
      }
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env as Env, ctx);
  },
};

export default worker;
