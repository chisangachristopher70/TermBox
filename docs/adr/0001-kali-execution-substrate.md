# 0001 — Hybrid Kali execution substrate: Instant Plane (WASM) + Power Plane (Firecracker, gVisor MVP)

- **Status:** Accepted
- **Date:** 2026-10-09
- **Deciders:** TermBox architecture (lead)
- **Related:** ARCHITECTURE §2 (Q2, Q4, Q7, Q8, Q9, Q10), §5; ADR 0005

## Context

"Run Kali Linux in a web app" is physically impossible in the browser alone at
useful performance: browsers cannot execute Linux processes. The three credible
substrates are (a) full-system emulation in WebAssembly (v86), (b) server-side
sandboxes (containers or microVMs) streaming a PTY to the tab, and (c) remote
full VMs per user. Constraints in tension:

- **Time-to-first-prompt** decides first impressions (seconds matter) → favors (a).
- **Real tools** (`nmap`, `metasploit`, `burp`) need native CPU, RAM ≥ 2 GB,
  and controlled network → only (b)/(c).
- **Multi-tenancy with an offensive-security guest** makes the guest *hostile by
  product design*; shared-kernel isolation alone is a weak boundary → favors
  hardware-virtualized (b) at scale.
- **Cost**: free tiers must be near-zero marginal cost → favors (a) and aggressive
  suspend-on-idle for (b).
- **Q9 (modifiability)**: the runtime substrate will change (MVP → production);
  the rest of the system must not.

## Decision

We will run **two runtime planes behind one `RuntimeDriver` contract**:

1. **Instant Plane** — a Linux kernel + Kali-mini rootfs emulated in-browser
   (v86 / WASM), free, offline-capable, honestly labeled as slow.
2. **Power Plane** — real Kali sandboxes on server-side nodes: **gVisor
   containers as the MVP path**, **Firecracker microVMs as the production
   target** (snapshot/suspend enables Q4/Q6 economics).

The UI and protocol are substrate-agnostic; every shell is labeled with its tier.

## Alternatives considered

| Alternative | Why it lost |
| --- | --- |
| WASM-only (no server) | Cannot run real Kali tooling at usable speed/RAM; product promise unkept |
| Containers only (Docker/LXC) | Shared kernel is too weak a boundary for hostile multi-tenant guests at scale; acceptable only as MVP behind gVisor |
| Full VM per user (VPS-style) | 30–60 s provision, 10× cost, no cheap suspend/resume |
| Remote SSH boxes | Same as above plus BYO operational burden; revisited later as a feature (§16.3) |
| WebContainers-style | Node.js userspace only — not Kali, not Linux-distro semantics |

## Consequences

**Good:** instant free shell (funnel + demo + offline); native-grade real Kali on
paid/verified tiers; isolation upgraded to hardware VM boundary without touching
UI/API; suspend-on-idle makes free tier sustainable; one protocol, two runtimes.

**Bad / accepted:** two runtimes to build and support; WASM plane has real
performance limits (documented in-UI); gVisor MVP period carries residual
shared-kernel risk (mitigated: per-session instances, no privileged, seccomp,
egress default-deny, short-lived); Firecracker requires KVM-capable hosts
(sandbox node pools are sized accordingly).

**New obligations:** `RuntimeDriver` interface is the compatibility contract and
must stay stable; image pipeline must produce both mini (WASM) and core (server)
rootfs from one definition; UI must disclose tier and fidelity honestly.

## Reversal conditions

- v86/WASM (or a faster emulator, e.g. ARM-on-WASM with native-speed tricks)
  reaches within ~3× native on typical security tooling → collapse to Instant-only.
- A stronger-than-gVisor shared-kernel runtime (Kata 3.x maturity, etc.) with
  microVM-equivalent audit results and better density → retire Firecracker driver.
- Provisioning cost curve flips (e.g. microVM-per-session becomes cheaper than
  dense containers) → drop the container driver entirely.

## Evidence

- Prior art: Gitpod (Firecracker-class isolation for untrusted code), Coder,
  GitHub Codespaces (container+VM spectrum), v86 boots real Linux ISOs in-tab
  (demos publicly reproducible).
- Spike required (Phase 1, ARCHITECTURE §16.1): boot kali-mini under v86 on a
  mid-range phone; record boot time and `nasm`/`python3` micro-benchmarks.
