# 0007 — Define the TSP v1 wire framing and multiplexing contract

- **Status:** Proposed — maintainer review required before a Gateway relies on it
- **Date:** 2026-10-10
- **Deciders:** Contributor proposal; TermBox maintainer acceptance pending
- **Related:** ARCHITECTURE §6.2; ADR 0002; Q1, Q5, Q6, Q12

## Context

ADR 0002 settles WebSocket, binary PTY data, sequence-based replay, credit flow
control, and marks, but its short frame notation does not define a WebSocket
message boundary, a session identifier for the accepted multiplexing requirement,
how the implicit DATA sequence is represented on the wire, the MARK payload, or exact resume ordering. A browser
codec and a Go Gateway could therefore both appear to implement TSP v1 while
being incompatible. Guessing these details in either implementation would make
reconnect correctness difficult to test and could silently lose terminal output.

The detailed candidate contract is in [`docs/protocol/TSP-v1.md`](../protocol/TSP-v1.md).
The existing checkout has no Gateway or second implementation, so the proposal
has not yet been validated by cross-language interoperability or load testing.

## Decision

We propose one binary WebSocket message per TSP frame, with a 5-byte header
(type + big-endian stream ID), direction-specific DATA payloads, explicit
uint64 output sequence starts, fixed MARK payloads, and the replay/credit rules
in `docs/protocol/TSP-v1.md`; implement the browser codec and its conformance
unit tests without claiming Gateway support.

## Alternatives considered

| Alternative | Why it lost |
| --- | --- |
| Keep `[type][payload]` and infer stream from JSON | DATA/CREDIT/MARK are binary and need per-session routing; inference is ambiguous. |
| One WebSocket per session | Simpler routing, but does not meet ADR 0002's multiplexing requirement. |
| JSON envelope for every frame | Adds encoding overhead to the PTY hot path and weakens byte-transparent DATA handling. |
| Add an application length prefix | Redundant because each WebSocket message already supplies a length and frame boundary. |
| Keep output sequence entirely implicit | Lower per-frame overhead, but makes per-frame continuity and replay diagnostics harder to validate. The candidate format pays eight bytes per output DATA frame for an explicit first-byte sequence. |

## Consequences

**Good:** stream routing is unambiguous; output continuity can be checked per
frame; gaps are visible and have an exact restart sequence; bounds are testable
without a live shell; malformed input is rejected before terminal rendering.

**Bad / accepted:** the common header adds four bytes per frame and explicit
output sequence adds eight bytes per DATA frame; DATA layout differs by direction;
JavaScript and Go must share golden vectors and keep control JSON compatible.
The browser codec is not itself authentication, replay storage, or a runtime.

**New obligations:** the Gateway implementation must pass the same frame vectors,
fuzz malformed frames, test multi-stream isolation, and verify replay/credit
behavior under reconnect before deployment. The maintainer must accept or revise
this proposal before it becomes the production contract.

## Reversal conditions

- A Gateway prototype demonstrates that per-session WebSockets materially
  simplify isolation without violating the multiplexing requirement; revisit
  stream IDs in a superseding ADR.
- Measured overhead or latency makes the explicit sequence field unacceptable;
  compare with a tested implicit sequence alternative before changing the format.
- Gateway/client conformance tests reveal an ambiguity or security defect; fix
  the contract and codec before any production rollout.

## Evidence

- `npm test` covers the browser codec's binary round trips, field and size bounds,
  malformed input, multiplexed stream IDs, and explicit output gaps.
- No Go peer, WebSocket Gateway, production runtime, load spike, or
  reconnect-on-mobile measurement exists yet; those claims remain unverified.
