import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const userCss = await readFile(new URL("apps/user/app/globals.css", root), "utf8");
const municipalityCss = await readFile(new URL("apps/municipality/app/globals.css", root), "utf8");

function luminance(hex) {
  const channels = hex.slice(1).match(/.{2}/g).map((channel) => Number.parseInt(channel, 16) / 255);
  const linear = channels.map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(foreground, background) {
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

function cssVariable(css, name) {
  const match = css.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, "i"));
  assert.ok(match, `Missing ${name}`);
  return match[1];
}

test("Issue #14 critical color pairs meet WCAG 2 AA normal-text contrast", () => {
  const accessibleText = cssVariable(userCss, "--accessible-text");
  const municipalityAccessibleText = cssVariable(municipalityCss, "--accessible-text");
  const brandOnDark = cssVariable(municipalityCss, "--brand-on-dark");
  const pairs = [
    ["landing roadmap preview step number", accessibleText, "#ffffff"],
    ["roadmap action number", accessibleText, "#f0f5f3"],
    ["local location pill", accessibleText, "#e9f1ef"],
    ["resource definition label", accessibleText, "#ffffff"],
    ["municipality Tokyo brand", brandOnDark, "#102d36"],
    ["municipality intro/section copy", municipalityAccessibleText, "#f2f5f2"],
  ];
  for (const [label, foreground, background] of pairs) {
    const ratio = contrast(foreground, background);
    assert.ok(ratio >= 4.5, `${label}: ${ratio.toFixed(2)}:1 is below 4.5:1`);
  }
});

test("targeted selectors use semantic accessible color variables", () => {
  for (const selector of [".step-number", ".action-number", ".location-pill", ".resource-main dt"]) {
    const escaped = selector.replaceAll(".", "\\.");
    assert.match(userCss, new RegExp(`${escaped}[^}]*color:\\s*var\\(--accessible-text\\)`));
  }
  for (const selector of [".crisis-header .brand b", ".crisis-intro p", ".crisis-section-title > p", ".interpretation-card p"]) {
    const escaped = selector.replaceAll(".", "\\.").replace(">", "\\s*>\\s*");
    assert.match(municipalityCss, new RegExp(`${escaped}[^}]*color:\\s*var\\(--(?:brand-on-dark|accessible-text)\\)`));
  }
});
