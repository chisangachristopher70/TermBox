# Architecture Decision Records

An **ADR** captures one significant technical decision, its context, its
alternatives, and — crucially — **what evidence would reverse it**. ADRs are what
turn architecture from opinion into a defensible, revisable body of knowledge.

## Process

1. Number sequentially: `NNNN-kebab-title.md` (4 digits).
2. Use the template below. Keep one decision per record.
3. **Status:** `Proposed` → `Accepted` (rarely `Deprecated` / `Superseded by NNNN`).
4. Write it **in the same change** that implements the decision
   (`AGENTS.md` §6). If you disagree with an accepted ADR, bring *new evidence*
   in a new ADR that supersedes it — never silently contradict it.
5. Do not edit accepted ADRs except for typos and added "Reversal evidence"
   notes. History must stay legible.

## Template

```markdown
# NNNN — Title (imperative, one line)

- **Status:** Proposed | Accepted | Superseded by NNNN
- **Date:** YYYY-MM-DD
- **Deciders:** who was in the room
- **Related:** Q-numbers from docs/ARCHITECTURE.md §2, other ADRs

## Context
Forces, constraints, and the problem in a few paragraphs. What is true about
the world that forces this decision now?

## Decision
One sentence, active voice: "We will …"

## Alternatives considered
| Alternative | Why it lost |
| --- | --- |

## Consequences
Good, bad, and what we deliberately accept. New obligations created.

## Reversal conditions
The specific new evidence that would flip this decision (cost curve change,
benchmark result, browser feature, incident lesson…).

## Evidence
Spikes, benchmarks, prior art, links. Claims without evidence do not belong here.
```

## Index

| # | Title | Status | Date |
| --- | --- | --- | --- |
| 0001 | [Kali execution substrate](0001-kali-execution-substrate.md) | Accepted | 2026-10-09 |
| 0002 | [Terminal Stream Protocol over WebSocket](0002-terminal-stream-protocol.md) | Accepted | 2026-10-09 |
| 0003 | [xterm.js as terminal engine](0003-terminal-engine-xtermjs.md) | Accepted | 2026-10-09 |
| 0004 | [Workspace persistence model](0004-workspace-persistence.md) | Accepted | 2026-10-09 |
| 0005 | [Offensive-workload trust & safety](0005-offensive-workload-safety.md) | Accepted | 2026-10-09 |
| 0006 | [Go for gateway/scheduler/node-agent](0006-gateway-language.md) | Proposed | 2026-10-09 |
| 0007 | [TSP v1 wire framing and multiplexing](0007-tsp-v1-wire-details.md) | Proposed | 2026-10-10 |
| 0008 | [Vercel Web Analytics and Speed Insights](0008-vercel-analytics-and-speed-insights.md) | Accepted | 2026-10-10 |
