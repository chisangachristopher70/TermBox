# 0008 — Use Vercel Web Analytics and Speed Insights for production telemetry

- **Status:** Accepted
- **Date:** 2026-10-10
- **Deciders:** Repository owner (requested in session); TermBox maintainer review pending on merge
- **Related:** ARCHITECTURE §11.3 (product analytics, observability), AGENTS §3.5 and §3.7, ADR 0003

## Context

The static TermBox shell is deployed to Vercel at `term-box.vercel.app`. Until now
nothing measured how real visitors experience it: which views they open, or whether
first paint and interaction are fast on phones. ARCHITECTURE §11.3 asks for
privacy-preserving product analytics and for performance numbers, and AGENTS §5
forbids claiming performance without evidence.

Constraints that shape the choice:

- The CSP in `vercel.json` is `script-src 'self'`, `connect-src 'self'`. Any telemetry
  must be same-origin or the CSP must be widened, and widening it is forbidden.
- AGENTS §3.7 keeps runtime lean: a new runtime dependency needs a written cost
  justification.
- The app is a Vite static site, so the integration must work without a server
  framework.

## Decision

We will add `@vercel/analytics` (Web Analytics) and `@vercel/speed-insights`
(Core Web Vitals field data) as runtime dependencies, injected through the vanilla
`inject()` and `injectSpeedInsights()` entry points from `monitoring.js`, and only in
production builds.

## Alternatives considered

| Alternative | Why it lost |
| --- | --- |
| Google Analytics / GTM | Third-party origin; needs a CSP widening and loads a large remote script; conflicts with the privacy-preserving intent |
| Self-hosted analytics endpoint (`api/` function) | Needs storage, retention policy, and a data pipeline we do not have; the Vercel products need no server code |
| Hand-written `PerformanceObserver` beacons to `api/` | Re-implements Web Vitals math and sampling; no dashboard; more code to maintain than the official package |
| `web-vitals` library posting to our own API | Same as above, plus we own the storage and dashboards |
| Do nothing until Phase 2 | Leaves the live URL unmeasured; the cost of adding it now is small and reversible |

## Consequences

**Good**

- Both scripts load from same-origin `/_vercel/...` paths, so the CSP stays
  unchanged. No `unsafe-inline`, no new origins in `connect-src` or `script-src`.
- Dev builds inject nothing (`import.meta.env.PROD` gate), so local work sends no data.
- Speed Insights reports real-user Core Web Vitals (LCP, INP, CLS, and others) per
  page, which is the speed signal the product needs.

**Bad / accepted**

- Telemetry is only active after the owner enables Web Analytics and Speed Insights
  for the Vercel project in the dashboard. Until then the scripts return 404 and the
  SDK logs one console message. This is a manual step outside the repository.
- Bundle cost: the production entry bundle grows by about 1.1 kB gzip (6.30 kB →
  7.44 kB, measured with `npm run build` on 2026-10-10).
- Vercel's collection endpoints receive page URLs, referrers, device class, and
  timing data. Data is not sent by TermBox code itself, but the privacy stance must
  be stated in the README. No custom event properties are sent, so no user-entered
  content (commands, file names) leaves the browser.
- The dev-mode code path in both SDKs references a debug script on
  `va.vercel-scripts.com`. It is unreachable in production because the build resolves
  `process.env.NODE_ENV` to `"production"`, and our gate skips injection in dev.

**Obligations created**

- Keep the two packages on current major versions and watch their advisories.
- Never call `track()` with command text, file paths, or any terminal output. This is
  the same rule as AGENTS §3.6 (untrusted terminal data).
- Any future product-analytics events (ARCHITECTURE §11.3) need a new ADR before they
  are added.

## Reversal conditions

- Vercel removes or changes the Web Analytics / Speed Insights products, or their CSP
  requirements become incompatible with `script-src 'self'`.
- The privacy review concludes that page-level collection is not acceptable, in which
  case we keep Speed Insights only, or replace both with the `web-vitals` library and
  a first-party `api/` endpoint.
- Measured bundle cost on mid-range phones exceeds the performance budget for the
  shell (to be set in ARCHITECTURE §12 when the CI budget gate exists).

## Evidence

- Build with the change: `npm run build` passes; `index` entry bundle 16.75 kB →
  20.42 kB raw, 6.30 kB → 7.44 kB gzip. Both `/_vercel/insights/script.js` and
  `/_vercel/speed-insights/script.js` appear in the bundle.
- Headless Chromium served from `dist/` with the exact `vercel.json` CSP header
  (stubbed `/_vercel` endpoints, because Vercel is not reachable from the build
  sandbox): both scripts are requested same-origin, `window.va` and `window.si` are
  defined, and there are no `script-src` or `connect-src` violations. The only CSP
  messages are 8 pre-existing `style-src-elem inline` messages, which also appear on
  the untouched `HEAD` build.
- `vite dev`: neither script is injected and the page has no errors.
- Packages: `@vercel/analytics` 2.0.1 (MIT) and `@vercel/speed-insights` 2.0.0
  (Apache-2.0), both with no runtime dependencies; `npm audit` reports 0 vulnerabilities.
- UNVERIFIED: real data collection on `term-box.vercel.app`. This needs a production
  deploy and the dashboard toggles, which this sandbox cannot perform.
