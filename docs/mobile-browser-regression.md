# Mobile browser regression tests

StayBridge keeps an in-repository Playwright suite for automated mobile browser regression checks. The suite is intended to catch repeatable interaction, layout, keyboard, and accessible-name regressions before merge.

It does **not** replace the human validation tracked in #6. Real iPhone/Android devices, VoiceOver/TalkBack, assistive-technology users, and qualitative checks such as whether legal guidance could be misunderstood still require human evaluation.

## What is covered

The user-app suite checks:

- 375px, 390px, and 430px viewports;
- Japanese, English, and Myanmar routes;
- Landing and Situation Check rendering;
- the demo-backed Status → Roadmap → Local Action → Help → Summary journey;
- a complete 10-question persona-style Situation Check journey at 390px;
- keyboard reachability and `:focus-visible` for a primary action;
- accessible names for visible buttons, links, comboboxes, textboxes, radios, and checkboxes;
- the `main` landmark and fatal document-level horizontal overflow;
- major controls through real Playwright clicks and form interactions, so covered or non-actionable controls fail at the interaction that matters rather than through synthetic scrolling.

The municipality suite checks:

- Preparedness View at 375px, 390px, and 430px;
- accessible aggregate filters and keyboard focus;
- period/view changes against a deterministic aggregate API fixture;
- loading and unavailable/error states while keeping the filters usable;
- the same accessible-name, overflow, landmark, and real-interaction contracts.

The tests intentionally prefer role/name/visibility/focus/flow assertions over screenshot snapshots. Trace, screenshot, and video evidence is retained only on failures.

## Run locally

Install dependencies and Chromium once:

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
```

Run the full browser regression suite:

```bash
pnpm test:e2e
```

Run only one application:

```bash
pnpm test:e2e:user
pnpm test:e2e:municipality
```

Playwright starts the existing development servers automatically on port 3000 for the user app and port 3001 for the municipality app. If those servers are already running locally, Playwright reuses them.

## CI

The `Validate monorepo` GitHub Actions job already installs Chromium. After lint, typecheck, unit/integration tests, and both application builds, CI runs `pnpm test:e2e` as part of the required check.

Playwright artifacts are written under `test-results/` (and `playwright-report/` if an HTML report is enabled locally); both paths are ignored by Git.
