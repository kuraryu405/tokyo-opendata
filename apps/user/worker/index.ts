/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import {
  createHealthResponse,
  handleOpenDataResourcesRequest,
  createMethodNotAllowedResponse,
  createReadinessResponse,
  handleConsentedPersistenceRequest,
  type PersistenceEnv,
  type PersistenceRateLimiter,
} from "@staybridge/worker-runtime";

interface Env extends PersistenceEnv {
  ASSETS: Fetcher;
  PERSISTENCE_RATE_LIMITER: PersistenceRateLimiter;
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
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

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

    if (url.pathname === "/api/open-data/resources") {
      return handleOpenDataResourcesRequest(request, env);
    }

    const persistenceResponse = await handleConsentedPersistenceRequest(request, env);
    if (persistenceResponse) return persistenceResponse;

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
