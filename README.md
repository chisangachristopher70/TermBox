# TermBox

TermBox is a focused, browser-native workspace inspired by the workflow of Termux: start in a terminal, run familiar commands, and switch into a visual GUI workspace when a command-line view is not the best tool.

This repository is a static web prototype built with Vite. The terminal view uses a locally bundled xterm.js renderer, but its command adapter is still a safe browser simulator: it does not execute commands or connect to a remote shell. Run the source through Vite (`npm run dev`) or build it for a static host; opening the source `index.html` directly via `file://` is not supported.

## Documentation map

| Document | What it is |
| --- | --- |
| **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** | **The production architecture — source of truth.** How TermBox becomes a real Kali-in-the-browser platform: hybrid runtime (in-browser WASM Linux + Firecracker/gVisor sandboxes), Terminal Stream Protocol, control plane, data model, security/threat model, reliability, cost, and the phased roadmap. |
| **[docs/ENGINEERING_GUIDELINES.md](docs/ENGINEERING_GUIDELINES.md)** | The engineering operating system: how to think, design, build, verify, operate, and secure — including the AI agent execution protocol that makes any agent working on this repo effective. |
| **[docs/adr/](docs/adr/README.md)** | Architecture Decision Records: the settled calls (runtime substrate, terminal protocol, engine, persistence, offensive-workload safety) with the evidence that would reverse each one. |
| **[docs/protocol/TSP-v1.md](docs/protocol/TSP-v1.md)** | Proposed TSP v1 wire contract and conformance notes; no Gateway is implemented yet. |
| **[AGENTS.md](AGENTS.md)** | Operating manual and invariants for AI agents (and humans) contributing to this repository. |

The product plan below describes the shipped prototype and the original phase
sketch. **When it disagrees with [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md),
the architecture document wins** — and a PR fixing the disagreement is welcome.

## Product plan

### Product principles

1. **Terminal first** — the first screen should feel like a real shell, with a readable prompt, session tabs, command history, shortcuts, and useful starter output.
2. **GUI when it helps** — the GUI mode turns the same workspace into a visual launchpad for files, tools, packages, and system health. Switching modes should never feel like leaving the project.
3. **Safe by default** — the front-end demo must not imply that arbitrary shell commands execute on an edge server. A future execution service should be isolated in a sandbox with authentication, limits, and an explicit permission model.
4. **Portable deployment** — package assets are bundled locally with Vite; the app loads no remote CDN scripts. The generated static build can be deployed to Vercel or GitHub Pages, or archived for sharing and backup.

### MVP shipped in this prototype

- Responsive TermBox shell with a mobile navigation bar.
- Terminal mode rendered with xterm.js and local Fit/WebGL addons; the current command adapter simulates `help`, `ls`, `pwd`, `neofetch`, `git status`, `npm run build`, `npm run dev`, `pkg`, `echo`, `date`, `history`, and version commands. This is not a real shell.
- Command history with Up/Down, Tab autocomplete, `Ctrl/⌘ + K` command palette, and `Ctrl + L` clear.
- GUI mode with a launchpad, recent files, workspace status, resource health, and active session card.
- Files, Packages, and Activity views accessible from the sidebar or palette.
- Toast feedback for actions that will later connect to real services.
- Accessible controls, focus states, responsive layouts, reduced-motion support, and no arbitrary HTML interpolation of terminal input.

### Production roadmap (summary)

The full roadmap with exit gates, acceptance criteria, and latency budgets lives
in **[docs/ARCHITECTURE.md §15](docs/ARCHITECTURE.md)**. Summary:

#### Phase 0 — shipped ✅ (this repository)

- Static prototype: honest terminal simulator, GUI workspace, palette, `/api/health`, strict CSP, Vercel pipeline.

#### Phase 1 — the real terminal

**Current checkpoint:** this branch bundles xterm.js as the terminal renderer,
with FitAddon and optional WebGL acceleration. Commands still go to the safe
browser simulator; there is no PTY, TSP connection, or remote shell yet. A
JavaScript TSP frame codec and tests now exist, alongside a proposed wire contract
that still needs Gateway/maintainer conformance review.

Remaining Phase 1 work:

- Replace the simulator command adapter with a real terminal connection using
  Terminal Stream Protocol (TSP v1), reconnect/resume, flow control, and a
  Terminal Gateway.
- **Instant Plane**: in-browser Linux (v86/WASM) with a Kali-mini rootfs — free,
  offline-capable, boots to a prompt in the tab.
- GitHub OAuth, session store, rate limits, idle timeouts, size/perf budgets in CI.

#### Phase 2 — the Power Plane (real Kali)

- Isolated server-side Kali sandboxes behind a `RuntimeDriver` contract: gVisor
  containers (MVP) → Firecracker microVMs with snapshot/suspend (production).
- Workspace volumes + snapshots, file APIs, editor, session recordings, egress
  proxy (package mirrors), quotas, metering, audit pipeline.

#### Phase 3 — cyber range & collaboration

- Lab network with intentionally vulnerable targets; verified-tier scoped egress.
- Teams/orgs, shareable sessions, package catalog, PWA offline shell, billing,
  responsible-use program, disaster-recovery game days.

## Run locally

Use Node.js 20+ and Vite to resolve and bundle the local xterm.js packages:

```bash
npm ci
npm test          # terminal-output sanitizer + TSP codec tests
npm run dev       # development server on 0.0.0.0
npm run build     # production build into dist/
npm run preview   # serve dist/ locally
```

The generated `dist/` directory is static and can be deployed to a static host. The unbuilt source cannot be served with a plain static server because its bare package imports are resolved by Vite.

## Deployment: Vercel

TermBox is deployed to Vercel as a Vite static site with one optional serverless function. `vercel.json` holds the full configuration, so no dashboard overrides are needed.

| Setting | Value |
| --- | --- |
| Framework | Vite (detected from `vercel.json`) |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Node.js | 20 or newer (`engines` in `package.json`) |

### One-time setup

1. Push the branch to GitHub.
2. In Vercel, choose **Add New → Project** and import `chisangachristopher70/TermBox`.
3. Keep the detected settings from the table above and click **Deploy**.
4. Every push to a branch creates a Preview deployment; merging to `main` updates Production.

Or deploy from the terminal:

```bash
npm i -g vercel
vercel login
vercel          # preview deployment
vercel --prod   # production deployment
```

### What the Vercel config provides

- **Security headers** on every route: a strict Content-Security-Policy (`script-src 'self'`, `style-src 'self'`, no inline scripts or styles), `X-Frame-Options: DENY`, `nosniff`, a referrer policy, a permissions policy, and HSTS.
- **Caching:** hashed files under `/assets/` are cached for one year as immutable; HTML is always revalidated.
- **Routing:** clean URLs, and unknown paths fall back to `index.html`. Vercel serves existing files and `api/` functions before applying this fallback, so `/api/*` requests still reach the functions.
- **Serverless API:** `api/health.js` is served at `/api/health` (GET returns `{ status, service, timestamp }`). It is the entry point for the future workspace API and runs no commands.

### Verify a deployment

```bash
curl -I https://<your-deployment>.vercel.app/            # 200, security headers present
curl https://<your-deployment>.vercel.app/api/health     # {"status":"ok",...}
```

Use `vercel dev` to run the function and static site locally with the same routing as production.

### GitHub Pages (alternative)

GitHub Pages can host the built `dist/` folder as a static site. It does not run `api/` functions and does not apply the `vercel.json` headers, so Vercel remains the recommended host.

### Google Drive

Google Drive is useful for sharing a zipped snapshot or design handoff, but it is not a reliable production host for a JavaScript app. Upload a zip of the repository to Drive for backup or stakeholder sharing, and use Vercel or GitHub Pages for the live URL. Do not put API keys, shell credentials, or user data in the Drive copy.

## Project structure

```text
.
├── api/
│   └── health.js    # Vercel serverless function: GET /api/health
├── docs/
│   ├── ARCHITECTURE.md          # production system design (source of truth)
│   ├── ENGINEERING_GUIDELINES.md# engineering operating system
│   ├── protocol/TSP-v1.md       # proposed TSP wire contract
│   └── adr/                     # architecture decision records
├── packages/protocol/tsp.js    # browser-side TSP v1 frame codec (no Gateway yet)
├── AGENTS.md        # operating manual for AI agents and contributors
├── index.html       # semantic app shell and view markup
├── styles.css       # responsive dark UI system
├── app.js           # safe command simulator and view interactions
├── terminal-view.js # lazily loaded xterm.js terminal renderer
├── terminal-text.js # control-sequence-safe output text conversion
├── tests/           # Node built-in tests
├── package.json     # Vite/xterm.js dependencies; Node.js 20+
├── vite.config.js   # build output (dist/) and dev/preview servers
└── vercel.json      # build, routing, security headers, caching
```

## Security boundary

The current terminal is a front-end simulation. For a real Termux-like product, never pass untrusted command strings to an unrestricted host shell. Use isolated containers/Firecracker/WASM, per-user permissions, network egress controls, resource quotas, sanitized PTY output, and short-lived credentials before exposing execution to users.
