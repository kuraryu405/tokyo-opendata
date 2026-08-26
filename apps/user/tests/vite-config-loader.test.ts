import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createLogger, resolveConfig } from "vite";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configFile = resolve(appRoot, "vite.config.ts");

function warningCollector() {
  const warnings: string[] = [];
  const logger = createLogger("warn");
  logger.warn = (message) => {
    warnings.push(message);
  };
  logger.warnOnce = (message) => {
    warnings.push(message);
  };
  return { logger, warnings };
}

describe("Vite config loaders", () => {
  it.each(["bundle", "native"] as const)("loads the user config with the %s loader without native-compat warnings", async (configLoader) => {
    const { logger, warnings } = warningCollector();
    const config = await resolveConfig({
      root: appRoot,
      configFile,
      configLoader,
      customLogger: logger,
    }, "build");

    expect(config.configFile).toBe(configFile);
    expect(config.plugins.length).toBeGreaterThan(0);
    expect(warnings.join("\n")).not.toContain("unsupported by `configLoader: 'native'`");
  });
});
