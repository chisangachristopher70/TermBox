# AGENTS.md — Operating Manual for AI Agents in the TermBox Repository

> Read this file first. Then internalize `docs/ENGINEERING_GUIDELINES.md`.
> It is the engineering constitution for this product. Agents that skip it produce
> fragile work that gets reverted.

## 0. Mission

Build **TermBox**: a browser-native, terminal-first Linux workspace (like Termux,
but for the web) whose terminal runs **real Kali Linux** behind an unbreakable,
multi-tenant security boundary — with a lightweight frontend that stays fast on a
phone.

Everything you do here serves that mission. When in doubt, choose the option that
is more secure, more observable, and easier for the next engineer to verify.

## 1. Read order (before touching code)

1. `AGENTS.md` (this file) — repo rules and invariants.
2. `docs/ENGINEERING_GUIDELINES.md` — how to think, design, build, verify, operate.
3. `docs/ARCHITECTURE.md` — system design, protocols, roadmap. Source of truth.
4. `docs/adr/*.md` — decisions that are settled. Do not relitigate; write a new
   ADR if you have material new evidence.
5. `README.md` — product narrative and deployment facts.

## 2. Repository map

```text
.
├── AGENTS.md              # this file — agent contract
├── README.md              # product narrative, deployment
├── index.html             # static app shell (views: terminal, gui, files, packages, activity)
├── styles.css             # dark UI system (no inline styles anywhere — CSP)
├── app.js                 # terminal simulator + view interactions (Phase 0 only)
├── api/health.js          # Vercel function: GET /api/health — runs NO commands
├── package.json           # Vite scripts, Node >= 20
├── vite.config.js         # build to dist/, dev/preview on 0.0.0.0
├── vercel.json            # build, routing, security headers, caching
└── docs/
    ├── ARCHITECTURE.md            # the real system design (Phases 1–3)
    ├── ENGINEERING_GUIDELINES.md  # engineering operating system
    └── adr/                       # architecture decision records
```

## 3. Invariants — NEVER break these

1. **No command execution on a server, ever, in this repo's current shape.**
   `app.js` is a browser simulator; `api/` functions must not shell out. Real
   execution belongs to the sandbox architecture in `docs/ARCHITECTURE.md`.
2. **CSP is strict and stays strict.** `vercel.json` forbids `script-src 'unsafe-inline'`
   and `style-src 'unsafe-inline'`. Never add inline `<script>`, `onclick=`,
   `style=""` attributes, or `innerHTML` with untrusted data. Use the CSSOM
   (`element.style.*`) or classes. Icons are injected via trusted constant strings only.
3. **No secrets in the repository.** No tokens, keys, credentials — not in code,
   not in docs, not in examples. Use placeholders like `<YOUR_TOKEN>`.
4. **Never delete, rename, or move the repository root or `.git`.**
5. **Do not weaken security headers** (HSTS, frame-options, nosniff, permissions
   policy, CSP). Tightening them is welcome if the app still works.
6. **Terminal output is untrusted data.** Render with `textContent`/DOM text nodes
   (or xterm.js later). Never interpolate terminal bytes into HTML.
7. **Runtime stays lean.** The static shell has zero runtime dependencies today.
   Adding one requires a written justification (what it costs, what it replaces,
   bundle size). Prefer platform APIs.
8. **Work only on the branch you were given.** Commit there; never switch branches.

## 4. Commands

```bash
npm ci                  # install (dev deps only: vite)
npm run dev             # dev server on 0.0.0.0 (preview-proxied)
npm run build           # production build -> dist/
npm run preview         # serve dist/ on 0.0.0.0
node --check app.js     # fast syntax gate
python3 -m http.server 4173 --bind 0.0.0.0   # no-build static serve
```

## 5. Verification protocol (non-negotiable)

A task is **done** only when you have produced **evidence**, not vibes:

- Code changed → `node --check` on every changed JS file and `npm run build` passes.
- UI changed → describe exactly what was verified (dev server, which view, which
  interaction). If you cannot verify behavior, say so explicitly and mark it.
- Backend/API changed → `curl` the endpoint (e.g. `GET /api/health`) and paste the
  real response.
- Never write "should work", "likely works", or "completed successfully" without a
  command output or observed behavior behind the claim. If something is unverified,
  state it plainly: "UNVERIFIED: …".
- If a test suite exists at the time of your change, run it. If you add non-trivial
  logic, add tests.

## 6. Change discipline

- Smallest coherent change that fully solves the stated problem. No speculative
  scaffolding, no "future-proofing" without a tracked need (see Guidelines, §1.6).
- If a change crosses an architectural boundary (protocol, persistence, security
  model, runtime strategy), write or amend an ADR in `docs/adr/` **in the same change**.
- Keep `README.md` and `docs/ARCHITECTURE.md` truthful. If reality changes, update
  the docs in the same commit. Docs that lie are worse than missing docs.
- Commit messages: imperative mood, explain *why* in the body when the change is
  non-obvious. One logical change per commit where practical.

## 7. Where things go

| You are doing… | Write it in… |
| --- | --- |
| Product narrative, how to run/deploy | `README.md` |
| System design, protocols, data model, roadmap | `docs/ARCHITECTURE.md` |
| A settled technical decision + rationale | `docs/adr/NNNN-title.md` (use the template in `docs/adr/README.md`) |
| Engineering process / thinking rules | `docs/ENGINEERING_GUIDELINES.md` |
| UI | `index.html` + `styles.css` + `app.js` (until the Phase 1 rewrite) |
| Edge/API behavior | `api/`, `vercel.json` |

## 8. Forbidden

- Executing or wiring untrusted input to a shell anywhere in this codebase.
- `eval`, `new Function`, remote script loading, or CDN assets (CSP is `self`-only).
- Committing `node_modules/`, `dist/`, `.env*`, logs, or OS junk (see `.gitignore`).
- Fabricating results, tests, benchmark numbers, or user quotes.
- Quietly accepting an ambiguous, high-stakes requirement — ask. A 30-second
  clarification beats a 3-day wrong build.
- Rewriting large areas of the codebase without an explicit plan and checkpoints.

## 9. Definition of Done

- [ ] Requirement is unambiguous (clarified if it wasn't).
- [ ] Design fits `docs/ARCHITECTURE.md` (or the ADR set is updated).
- [ ] Code is minimal, readable, handles errors explicitly, logs/metrics hooks exist.
- [ ] Security invariants (§3) hold — checked, not assumed.
- [ ] Verification evidence collected (§5) and shown in your report.
- [ ] Docs updated where truth changed.
- [ ] You can state what would break this change and how you'd detect it.
