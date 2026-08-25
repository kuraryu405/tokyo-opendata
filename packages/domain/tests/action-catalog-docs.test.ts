import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { actionCatalog, actionIds } from "../src/action-catalog";

const catalogDoc = readFileSync(
  fileURLToPath(new URL("../../../docs/action-card-catalog.md", import.meta.url)),
  "utf8",
);

function sectionBetween(startHeading: string, endHeading: string): string {
  const start = catalogDoc.indexOf(startHeading);
  const end = catalogDoc.indexOf(endHeading);
  expect(start, `missing start heading: ${startHeading}`).toBeGreaterThanOrEqual(0);
  expect(end, `missing end heading: ${endHeading}`).toBeGreaterThan(start);
  return catalogDoc.slice(start + startHeading.length, end);
}

function formatDestination(id: (typeof actionIds)[number]): string {
  const destination = actionCatalog[id].destination;
  return destination.screen === "help" ? "help" : `local:${destination.filter}`;
}

describe("Action Card Catalog documentation", () => {
  it("keeps the Production inventory audit fields aligned with actionCatalog", () => {
    const inventory = sectionBetween("## Production inventory", "## Publication gates");
    const documented = inventory
      .split("\n")
      .filter((line) => line.startsWith("|`"))
      .map((line) => {
        const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
        expect(cells, `unexpected Production inventory column count for row: ${line}`).toHaveLength(11);
        const reviewStatus = cells[7];
        const review = reviewStatus === "reviewed"
          ? {
              status: "reviewed",
              reviewedAt: cells[8],
              reviewedBy: cells[9],
              reviewAfter: cells[10],
            }
          : { status: reviewStatus };
        return {
          id: cells[0]?.replaceAll("`", ""),
          timing: cells[2],
          destination: cells[3]?.replaceAll("`", ""),
          sourceIds: [...(cells[4] ?? "").matchAll(/`([^`]+)`/g)].map((match) => match[1]),
          riskLevel: cells[5],
          notice: cells[6],
          review,
        };
      });
    const expected = actionIds.map((id) => {
      const entry = actionCatalog[id];
      return {
        id,
        timing: entry.timing,
        destination: formatDestination(id),
        sourceIds: [...entry.sourceIds],
        riskLevel: entry.riskLevel,
        notice: entry.fallback.notice,
        review: entry.review,
      };
    });

    expect(documented, "Production inventory must match the actionCatalog audit fields in actionIds order").toEqual(expected);
  });
});
