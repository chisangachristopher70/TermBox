# TermBox

TermBox is a focused, browser-native workspace inspired by the workflow of Termux: start in a terminal, run familiar commands, and switch into a visual GUI workspace when a command-line view is not the best tool.

This repository is a dependency-free static prototype. It can be opened directly from `index.html`, served by any static server, or deployed to Vercel/GitHub Pages. The command runner is intentionally a safe browser simulator; it does not execute arbitrary commands on a server.

## Product plan

### Product principles

1. **Terminal first** — the first screen should feel like a real shell, with a readable prompt, session tabs, command history, shortcuts, and useful starter output.
2. **GUI when it helps** — the GUI mode turns the same workspace into a visual launchpad for files, tools, packages, and system health. Switching modes should never feel like leaving the project.
3. **Safe by default** — the front-end demo must not imply that arbitrary shell commands execute on an edge server. A future execution service should be isolated in a sandbox with authentication, limits, and an explicit permission model.
4. **Portable deployment** — the initial build has no build-time dependencies or external assets. The same files can be deployed to Vercel, GitHub Pages, or copied to Google Drive for sharing and backup.

### MVP shipped in this prototype

- Responsive TermBox shell with a mobile navigation bar.
- Terminal mode with simulated `help`, `ls`, `pwd`, `neofetch`, `git status`, `npm run build`, `npm run dev`, `pkg`, `echo`, `date`, `history`, and version commands.
- Command history with Up/Down, Tab autocomplete, `Ctrl/⌘ + K` command palette, and `Ctrl + L` clear.
- GUI mode with a launchpad, recent files, workspace status, resource health, and active session card.
- Files, Packages, and Activity views accessible from the sidebar or palette.
- Toast feedback for actions that will later connect to real services.
- Accessible controls, focus states, responsive layouts, reduced-motion support, and no arbitrary HTML interpolation of terminal input.

### Suggested production roadmap

#### Phase 1 — foundation

- Replace the simulated command adapter with a small authenticated API.
- Put every shell session in an isolated, short-lived container or WebAssembly runtime.
- Add a session store for workspace metadata, command history, and open tabs.
- Add rate limits, idle timeouts, output-size limits, and audit logging.

#### Phase 2 — useful workspace tools

- Connect a file tree and editor to a workspace filesystem.
- Add terminal resize/PTY support over WebSockets.
- Add GitHub OAuth and repository import/export.
- Add package metadata and allow-list packages rather than arbitrary network installs.
- Persist settings and recent work with a small database.

#### Phase 3 — collaboration and release

- Shareable read-only session links.
- User-owned environment variables and secrets stored outside source control.
- Automated tests for command parsing, permissions, and session lifecycle.
- Security review, cost controls, observability, backups, and disaster recovery.
- PWA install support and optional offline GUI shell.

## Run locally

No install step is required for the static prototype:

```bash
python3 -m http.server 4173 --bind 0.0.0.0
```

Open `http://localhost:4173` in a browser. With Node.js 20+, the Vite scripts are:

```bash
npm ci
npm run dev       # development server
npm run build     # production build into dist/
npm run preview   # serve dist/ locally
```

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
├── index.html       # semantic app shell and view markup
├── styles.css       # responsive dark UI system
├── app.js           # safe terminal simulator and view interactions
├── package.json     # Vite scripts; Node.js 20+
├── vite.config.js   # build output (dist/) and dev/preview servers
└── vercel.json      # build, routing, security headers, caching
```

## Security boundary

The current terminal is a front-end simulation. For a real Termux-like product, never pass untrusted command strings to an unrestricted host shell. Use isolated containers/Firecracker/WASM, per-user permissions, network egress controls, resource quotas, sanitized PTY output, and short-lived credentials before exposing execution to users.
