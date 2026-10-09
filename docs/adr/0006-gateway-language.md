# 0006 — Go for the terminal gateway, scheduler, and node-agent

- **Status:** Proposed
- **Date:** 2026-10-09
- **Deciders:** TermBox architecture (lead) — **ratify after the Phase 1 load spike**
- **Related:** ARCHITECTURE §13, §14; ADR 0002

## Context

Three data-plane components are born in Phase 1–2:

- **Terminal gateway** — 10k+ concurrent WebSockets, binary relay, replay rings,
  credit accounting (a connection-heavy, memory-precise workload).
- **Scheduler** — placement, prewarm pools, quota enforcement (control logic,
  modest load).
- **Node-agent** — sandbox lifecycle, vsock PTY bridging, snapshots (systems
  proximity, minimal trusted compute base).

The web app and Control API are TypeScript (types shared with the browser client,
Vercel functions already JS). Two languages is the ceiling; three is a mistake.

## Decision

We will implement **gateway, scheduler, and node-agent in Go**, keeping the
browser client and Control API in TypeScript. `packages/protocol/` (TS) generates
the Go message types so TSP has exactly one source of truth. The node-agent's
TCB stays small enough to audit like a security component.

## Alternatives considered

| Alternative | Why it lost |
| --- | --- |
| Node/TS everywhere (node-pty) | One language, but per-connection memory and GC jitter at 10k sockets; node-pty belongs to container-tier hosts anyway — our guest agent path uses vsock (ADR 0001) |
| Rust everywhere data-plane | Strongest perf/TCB, but slower iteration and hiring for control logic that doesn't need it; revisit for node-agent if TCB audit demands |
| Split: Node gateway + Go agent | Two runtimes to ship *and* a hot-path serialization hop; protocol drift risk doubles |

## Consequences

**Good:** tiny per-connection footprint and predictable memory for the gateway;
static binaries for node images (small attack surface); one protocol binding
generated from TS; TS stays where product iteration is fastest.

**Bad / accepted:** two languages in CI/hiring; codegen step in the protocol
package must be enforced in CI; contributors must not hand-edit generated Go.

**New obligations:** CI gate that regenerates and diffs protocol bindings; p95
echo latency benchmark in the gateway CI (Q1 as a regression test).

## Reversal conditions

- Phase 1 load spike shows Node ≥ Go on echo latency and memory at 10k conns
  with headroom → collapse to Node and delete this ADR.
- Node-agent TCB audit finds Go runtime surface unacceptable → move *only* the
  agent to Rust.

## Evidence

- Prior art: Coder's wsproxy lineage, Fly's proxy stack, Kubernetes'
  kubelet/agent ecosystem (Go), gorilla/websocket and coder/websocket at high
  connection counts in public benchmarks (to be reproduced in our spike).
- Required spike (Phase 1): 10k idle + 1k active TSP connections through a Go
  prototype relay on one node; record RSS, echo p95/p99, GC pauses.
