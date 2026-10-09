# 0003 — xterm.js as the terminal engine

- **Status:** Accepted
- **Date:** 2026-10-09
- **Deciders:** TermBox architecture (lead)
- **Related:** ARCHITECTURE §2 (Q1, Q11), §6.1, §12; ADR 0002

## Context

The "lightweight terminal" is the first screen of the product. It must render a
real VT/xterm stream correctly (Kali tools emit full ANSI/OSC), scroll at 60 fps
under bursts, stay under a strict byte budget, run on mid-range phones, and meet
accessibility expectations. Building a terminal emulator is a multi-year project
*beside* our actual product.

## Decision

We will use **xterm.js** (with FitAddon, WebGL renderer, DOM fallback,
Search/Serialize addons as needed) as the sole terminal engine, lazy-loaded after
first paint, with output treated strictly as untrusted terminal data (never HTML).

## Alternatives considered

| Alternative | Why it lost |
| --- | --- |
| Custom DOM/canvas emulator | Years of edge cases (Unicode width, reflow, OSC, mouse modes); classic trap |
| hterm | Aging, weaker a11y/mobile trajectory, smaller ecosystem |
| xterm.js fork | Maintenance burden without product value; contribute upstream instead |
| Server-side rendering of terminal (screenshots/stream) | Kills offline/Instant Plane, adds latency, breaks text selection & a11y |

## Consequences

**Good:** correctness and performance battle-tested by VS Code/Gitpod/Coder;
audited a11y tree; ecosystem of addons; we spend effort on TSP and runtimes
where the product differentiates.

**Bad / accepted:** bundle weight (mitigated: code-split, budget gate in CI —
§12); upstream release cadence controls some bug fixes; WebGL fallback path
needs its own perf checks.

**New obligations:** pin versions + watch advisories; contribute fixes upstream;
never patch security-relevant rendering (OSC/clipboard) downstream without an ADR
note and upstream PR.

## Reversal conditions

- A successor engine demonstrably beats xterm.js on our own Q1/Q11 benchmarks
  (echo latency, burst scroll, mobile memory) **and** matches its a11y/ANSI
  coverage → run a two-release bake-off behind a flag.

## Evidence

- Adoption prior art: VS Code (integrated terminal), Gitpod, Coder, JupyterLab.
- Phase 0 baseline: current `app.js` DOM text-line renderer proves the UX shell
  but not VT fidelity — the gap xterm.js closes (real `nmap`/`htop` output).
