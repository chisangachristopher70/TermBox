# 0002 — Terminal Stream Protocol (TSP) over WebSocket with seq replay and credit flow control

- **Status:** Accepted
- **Date:** 2026-10-09
- **Deciders:** TermBox architecture (lead)
- **Related:** ARCHITECTURE §2 (Q1, Q5, Q6, Q12), §6.2; ADR 0001, 0003

## Context

The terminal stream is the product's heart. Requirements that a naive "pipe
stdout into WebSocket" does not meet:

- Connections die (mobile networks, deploys, laptop sleep) and users expect to
  return to a live shell with scrollback intact (Q5, Q6).
- A malicious or bugged process can emit unbounded output (`yes`, `dmesg -w`,
  a fork bomb's stderr) — the browser must not become a bottomless buffer.
- The same bytes feed live rendering, replay recording, and (later) search.
- Multiple sessions per user, resize/signal control, and resume must coexist on
  one connection without a second protocol.

## Decision

We will define **TSP v1**: one WebSocket carrying length-framed binary messages
`[1B type][payload]` — `DATA` (opaque PTY bytes), `CONTROL` (JSON), `CREDIT`
(flow control), `MARK` (replay boundaries) — with:

- a **monotonic sequence number per DATA byte** and a server-side replay ring
  (default 2 MB / 60 s) enabling `attach{last_seq}` resume with `resume{replayed}`
  or an explicit `gap:true` marker (never silent truncation);
- **credit-based flow control** (default 512 KB in flight) that throttles the
  PTY instead of buffering unboundedly;
- idempotent `resize`/`signal` control messages and one-time, short-TTL attach
  tickets; a gateway that *tees* DATA into asciinema-v2-compatible recordings.

Full frame/JSON spec: `docs/ARCHITECTURE.md` §6.2.

## Alternatives considered

| Alternative | Why it lost |
| --- | --- |
| Raw PTY over bare WebSocket | No resume, no flow control, no recording seam; reconnect = lost session UX |
| SSH (dropbear/sshd) over WS | Heavy client-side crypto, no scrollback replay, sshd attack surface in guest (0001 uses vsock agent instead) |
| HTTP/2 or chunked streaming | Head-of-line blocking and poor fit for bidirectional interactive I/O |
| WebTransport/QUIC now | Premature: support and proxy traversal not universal; TSP frames can ride WebTransport later without semantic change |
| JSON-only framing | Per-byte overhead on hot path; binary DATA is the hot path |

## Consequences

**Good:** reconnects are invisible (Q6); abusive output cannot OOM clients or
servers; recordings are free; one connection multiplexes control + data; the
protocol is testable in isolation (property tests on the framer).

**Bad / accepted:** we own a protocol (spec + fuzzing + versioning burden —
mitigated: `packages/protocol/` is the single source of truth, Go codegen);
credit flow control adds a round-trip concept clients must honor; replay rings
cost memory per attached session (bounded and metered).

**New obligations:** fuzz the framer; keep `seq` accounting exact under every
reconnect path; protocol changes are additive-only with capability negotiation
(`caps` in `ready`).

## Reversal conditions

- WebTransport > 80 % of our user base **and** universal proxy traversal →
  consider carrier swap (frame semantics stay).
- Measured evidence that replay rings add p95 echo latency > 10 ms → revisit
  ring placement (move to node-agent only) or shrink guarantees to MARK-based.

## Evidence

- Prior art: VS Code remote / SSH, ttyd, gotty (bare WS — known to lose sessions
  on reconnect), tmux attach semantics (the UX we want), asciinema v2 format
  (recording interchange).
- Required spike (Phase 1): reconnect drill on a throttled mobile network with
  1 MB/s output; verify `gap:false` and byte-exact render continuity.
