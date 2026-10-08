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

Open `http://localhost:4173` in a browser. If Node.js is available, a Vite script is also provided:

```bash
npm install
npm run dev
```

## Deployment options

### Vercel (recommended for the web app)

1. Import the GitHub repository into Vercel.
2. Select **Other** / static site, or use the included `npm run build` script if a build command is requested.
3. Use `.` as the output directory. The app is already deployable from the repository root.
4. Every push to the connected branch can create a preview deployment.

The included `vercel.json` keeps history-style routes working if more views are added later.

### GitHub Pages

1. Push the repository to GitHub.
2. In **Settings → Pages**, choose **GitHub Actions** or deploy the repository root with a static-pages workflow.
3. Use the repository root as the published directory. No server-side runtime is required for the current prototype.

### Google Drive

Google Drive is useful for sharing a zipped snapshot or design handoff, but it is not a reliable production host for a JavaScript app. Upload a zip of the repository to Drive for backup or stakeholder sharing, and use Vercel or GitHub Pages for the live URL. Do not put API keys, shell credentials, or user data in the Drive copy.

## Project structure

```text
.
├── index.html       # semantic app shell and view markup
├── styles.css       # responsive dark UI system
├── app.js           # safe terminal simulator and view interactions
├── package.json     # optional Vite commands
└── vercel.json      # static deployment fallback
```

## Security boundary

The current terminal is a front-end simulation. For a real Termux-like product, never pass untrusted command strings to an unrestricted host shell. Use isolated containers/Firecracker/WASM, per-user permissions, network egress controls, resource quotas, sanitized PTY output, and short-lived credentials before exposing execution to users.
