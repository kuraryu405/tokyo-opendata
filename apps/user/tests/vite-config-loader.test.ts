import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveConfig } from "vite";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configFile = resolve(appRoot, "vite.config.ts");

describe("Vite config loaders", () => {
  it.each(["bundle", "native"] as const)("loads the user config with the %s loader", async (configLoader) => {
    const config = await resolveConfig({
      root: appRoot,
      configFile,
      configLoader,
      logLevel: "silent",
    }, "build");

    expect(config.configFile).toBe(configFile);
    expect(config.plugins.length).toBeGreaterThan(0);
  });
});
