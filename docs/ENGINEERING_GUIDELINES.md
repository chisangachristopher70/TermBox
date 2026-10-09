# The Engineering Operating System
### Guidelines that turn any agent — human or AI — into a real, senior-grade software engineer

> **How to use this document.** This is not motivational writing. It is an operating
> system for engineering judgment. Internalize it, apply it mechanically at first
> (checklists at the end), and it becomes instinct. It is written for the TermBox
> codebase but is deliberately general: it applies to any software product that
> must survive contact with real users, real attackers, and real failure.

---

## 0. The prime directive

**Build software that survives contact with reality — and prove it.**

"Unbreakable" software is not software that never fails. It is software that:
- fails in small, contained, predictable ways (never catastrophically),
- detects its own failure (observability),
- recovers faster than users can notice (redundancy, snapshots, automation),
- and whose design decisions are **documented, evidence-backed, and disputable only
  with evidence** (architecture decision records).

"Undisputed" engineering is not authority by assertion. It is authority by proof:
benchmarks, tests, threat models, runbooks, and postmortems. If you cannot show the
evidence, you do not have the claim.

---

## Part I — THINK: the laws of strong engineering

### 1.1 First principles, then conventions

Before reaching for a pattern or framework, reduce the problem to its irreducible
facts: What is actually being asked? What constraints are physical (latency of
light, CPU, memory, human attention) versus negotiable? What must be true when
this works?

Only then apply known solutions — chosen because they fit the facts, not because
they were in a tutorial. **Conventions are compressed first-principles reasoning;
use them as defaults, not as thought substitutes.**

### 1.2 Problem before solution

Write the problem statement in one paragraph that a non-engineer could follow:
who hurts, when, why, and what "solved" measurably looks like. If you cannot write
it, you do not understand the task — spend more time in the problem space.
Half of all wasted implementation effort is a confidently built wrong problem.

### 1.3 Invariants, contracts, and states

Every system has **invariants** (statements that must always be true: "no user
reads another user's data"), **contracts** (interfaces with explicit inputs,
outputs, errors, and guarantees), and **state machines** (CREATING → ATTACHED →
SUSPENDED → …).

Design these explicitly, before code:
- Name the invariants. Then ask: what is the cheapest mechanism that enforces
  each one *by construction* (types, schema, isolation boundary) versus *by policy*
  (a check someone must remember)? Prefer by-construction.
- Contracts include failure: every call can fail; every error is either retryable
  or terminal; every response has a latency budget.
- If a flow has more than three states, draw the state machine. Most "impossible
  bugs" are two states being reachable in an order nobody enumerated.

### 1.4 Think in systems, not screenshots

Software is stocks (data, queues, connections), flows (requests, events), and
feedback loops (autoscaling, retries, rate limits). Before changing a flow, ask:
- What are the **second-order effects**? (A retry storm after a 5s blip. A cache
  that hides a DB failure until the cache expires — then amplifies it.)
- Where does load **accumulate** when one part is slow? (Queues without bounds are
  outages with extra steps.)
- Which feedback loops are **stabilizing** and which are **runaway**? (Exponential
  retry without jitter is a distributed denial-of-service weapon aimed at yourself.)

### 1.5 Falsifiability and evidence

Every belief about the system ("this is fast", "this is safe", "users will
understand") must be expressed so that evidence could prove it wrong: a benchmark,
a test, a metric, a usability observation. Then collect that evidence.
An engineer who cannot imagine being wrong is not engineering — they are
storytelling.

### 1.6 Tradeoffs are mandatory; "best" does not exist

There is no best technology, only fit against weighted constraints. When choosing,
write down: at least two real alternatives, the criteria, what you are *accepting*
(the cost of the choice), and what would have to be true to reverse the decision.
If a choice is expensive to reverse, it deserves an ADR (`docs/adr/`).

**Opportunity cost is a cost.** Every speculative abstraction, unused config knob,
and "flexible" framework layer is paid for in comprehension and maintenance by
every future reader. YAGNI is not laziness; it is inventory control. Build the
extension point when the second real use case arrives (Rule of Three), not before.

### 1.7 Attack the riskiest assumption first

Order work by risk, not by comfort. If the whole product hinges on "can we stream
a PTY over WebSocket at 60fps on mobile?", build the smallest experiment that
answers that question **this week** — before anyone writes UI polish. A cheap
experiment that kills a bad plan is the highest-value artifact in the project.

### 1.8 Design for failure (this is "unbreakable")

Assume every component will fail: processes crash, disks fill, networks partition,
DNS lies, dependencies change under you, users paste 1GB of output into your
terminal. For each component answer, in writing when it matters:
1. How does it fail? (Crash, hang, corrupt, slow-bleed, byzantine.)
2. What is the blast radius? (One session? One region? All data?)
3. How is it detected? (Signal, threshold, latency budget.)
4. How is it contained? (Isolation, circuit breaker, bulkhead, quota.)
5. How is it recovered? (Restart, restore, replay, failover — with an RTO.)

### 1.9 Simplicity is the hardest feature

Simplicity means the *absence* of unnecessary concepts, not the presence of clever
compression. A senior engineer's diff often makes the system *smaller*. Measure
complexity by: number of moving parts, number of concepts a new teammate must
learn to debug a 3 a.m. failure, and the number of states a system can be in.

### 1.10 Security and privacy are properties, not features

They cannot be bolted on in a hardening sprint; they are emergent properties of a
thousand small decisions. Threat model at design time (STRIDE is enough), keep
trust boundaries visible in the architecture, and default to deny. The user's
threat model is not yours: for TermBox, the guest OS is literally an attacker's
toolbox — the *product itself* is hostile compute, and the architecture must treat
it as such (see `docs/ARCHITECTURE.md` §10).

### 1.11 Economics is an engineering constraint

Latency, memory, cloud spend, and human attention are budgets. Write the budget
down ("initial JS < 200KB gz", "keystroke echo p95 < 50ms", "$0.03 per
session-hour"), instrument it, and make exceeding it visible. A system that is
correct but costs 10× what it earns is a slow failure.

---

## Part II — DESIGN: architecture discipline

### 2.1 Start with quality attributes

Functional requirements are table stakes. Systems are differentiated by
**quality attributes**: latency, availability, security, modifiability, cost,
accessibility, operability. Express them as concrete scenarios:

> *When 10,000 sessions are active and a sandbox node dies, affected users are
> reattached to a restored snapshot in < 10s, and no other session notices.*

Unquantified quality attributes ("fast", "scalable", "secure") cannot be
architected for or verified against. Quantify them.

### 2.2 Decomposition: boundaries over layers

Split systems at **change-rate and ownership boundaries** (front end, control
plane, data plane, per-tenant sandbox), not by file type (controllers/models/
views soup). Rules of thumb:
- Each component owns its data. **Single writer** per datum; everyone else reads
  through the owner's contract.
- Sync calls down, events up; never circular synchronous dependencies.
- Shared libraries encode *stable* knowledge only. A "common" module that changes
  for every feature is a distributed monolith wearing a trench coat.

### 2.3 APIs are contracts between strangers

Version them. Define error taxonomies (retryable vs terminal). Make operations
**idempotent** with keys where retries are possible. Put explicit latency budgets
and payload limits on every endpoint. An API that is only understood by its author
is a private function that escaped.

### 2.4 State: hide it, shrink it, snapshot it

State is where bugs live. Prefer stateless compute; where state must exist, make
it explicit, versioned, and recoverable (snapshots, WAL, replay). Any state that
cannot be rebuilt from a log + snapshot is a single point of failure wearing a
smile.

### 2.5 Evolutionary architecture

Design for reversible decisions: feature flags, parallel runs, expand/contract
migrations (never a breaking migration in one step), adapters at irreversible
boundaries (payment, identity, sandbox runtime). The goal is not the perfect
end-state diagram — it is the ability to reach any better state cheaply, safely,
at any time.

### 2.6 Technology selection protocol

1. State the constraint the technology must satisfy (the *why*).
2. Shortlist ≥2 real candidates + the status quo.
3. Spike the riskiest difference (one day, throwaway code).
4. Score against weighted criteria (fit, operational burden, ecosystem, cost,
   team learning curve, exit cost).
5. Record the decision as an ADR with consequences and reversal conditions.
6. Settle it. Do not relitigate without new evidence.

---

## Part III — BUILD: the craft of code

### 3.1 Code is read orders of magnitude more than written

Optimize for the reader: intention-revealing names (`sessionTtlMs`, not `t`),
small functions that do one thing, shallow nesting, no clever tricks that need
a comment to decode (if a comment explains *what* the code does, rewrite the code;
comments should explain *why* and *what is dangerous*).

### 3.2 Errors are part of the contract

- Handle errors explicitly. **Never swallow them** (`catch {}`, ignoring promise
  rejections, `console.log` and continue) — a swallowed error is a future outage
  with deleted evidence.
- Fail fast at system boundaries; validate inputs at every trust boundary; never
  let corrupt state propagate.
- Every error surfaced to a user must be actionable in plain language; every error
  logged must carry correlation context (session id, request id, tenant id).
- Distinguish programmer errors (bugs — crash loudly in dev, report and contain in
  prod) from operational errors (expected — retry, degrade, or surface).

### 3.3 Observability is built on day one

Logs (structured, with context), metrics (RED/USE per service), traces (spans
across every hop), and product-level events. If you cannot answer "what is this
session doing right now and why did it die?" you have not finished the feature.
Health endpoints are part of the API surface (`api/health.js` is the pattern).

### 3.4 Performance is a feature with a budget

Measure before optimizing; optimize against the budget; keep the measurement
(next to the code, or in CI). Know the orders of magnitude: network round trips,
disk seeks, memory allocation, DOM operations. The fastest code is the code that
doesn't run; the fastest request is the one not made.

### 3.5 Dependency hygiene (supply chain discipline)

Every dependency is code you didn't write, can't debug at 3 a.m., and must trust
with your users' data. Justify each one, pin versions, generate lockfiles and
SBOMs, watch advisories, and prefer the platform. "Zero dependencies" (TermBox
Phase 0) is a legitimate architecture, not a gimmick.

### 3.6 Accessibility and mobile are acceptance criteria

Keyboard paths for everything, visible focus, semantic markup, reduced-motion
support, contrast. A terminal product that fails on a phone or a screen reader has
failed. Treat these as tests, not polish.

### 3.7 Refactor with discipline

Refactor in small, behavior-preserving steps, with tests green between steps.
Boy-scout rule (leave it cleaner) but no drive-by rewrites in someone else's
feature. If a rewrite is needed, propose it as its own plan with migration and
rollback — rewrites are among the most lethal projects in software.

---

## Part IV — VERIFY: evidence over confidence

### 4.1 The test strategy

- **Unit tests** for pure logic (parsers, protocols, state machines) — fast,
  deterministic, many.
- **Integration tests** at real boundaries (API + DB, PTY + gateway). Mocks are
  for nondeterminism (clock, network), not for hiding your own code.
- **End-to-end tests** for the few critical journeys (create session → run
  command → persist → resume).
- **Property-based tests** for protocol parsers and serializers (round-trip,
  fuzz inputs).
- **Non-functional tests**: load (keystroke echo under load), security
  (authz matrix), chaos (kill a node), and accessibility audits.

Flaky tests are failed tests. Quarantine them, then fix or delete — a suite that
cries wolf trains everyone to ignore it.

### 4.2 The verification protocol (also in `AGENTS.md`)

1. Before claiming done, define what evidence would prove it (the test, the
   command, the observation).
2. Run it. Paste real output. Not "all tests pass" — the actual command and result.
3. Check the edges: empty input, huge input, concurrent calls, permission denied,
   dependency down.
4. If you cannot verify, label it `UNVERIFIED` and say why. An honest gap is
   engineering; a hidden gap is sabotage.

### 4.3 Verification is also negative

Try to break your own work: invalid auth tokens, path traversal in file APIs,
double-submit idempotency, 10× the rated load, a browser tab throttled to
CPU 1/10. The engineer who only tests the happy path ships the outage.

---

## Part V — OPERATE: resilience engineering

### 5.1 SLOs and error budgets

Turn quality attributes into SLOs with measurement windows and consequences.
Error budgets convert "how reliable?" into "how much change can we afford?" —
when the budget burns, the team ships reliability work instead of features.

TermBox starting SLOs (refine with real data):
- Terminal attach success ≥ 99.9% / 28 days.
- Control API availability ≥ 99.95%, p95 latency < 200ms.
- Keystroke echo (same-region) p95 < 50ms, p99 < 150ms.
- Session restore after node loss < 10s (RTO), data loss = last snapshot (RPO ≤ 60s).

### 5.2 Detect, contain, recover

- **Detect**: SLO burn-rate alerts (multi-window), saturation signals (queue
  depth, prewarm pool size), and user-visible probes (synthetic session create).
- **Contain**: bulkheads (per-tenant quotas, per-node capacity classes), circuit
  breakers at every cross-service hop, backpressure end-to-end (never buffer
  unboundedly), blast-radius limits (per-session sandboxes).
- **Recover**: automation first (restart, reschedule, snapshot restore), runbooks
  for the rest, and backups that are **regularly restored in drills** — an
  untested backup is a rumor.

### 5.3 Incident discipline

Severity taxonomy with response expectations; one incident commander; a single
written timeline; blameless postmortems within 5 days whose action items get
owners, due dates, and tracking. **The goal of a postmortem is a system change,
not a person change.** Measure MTTR, not heroism.

### 5.4 Capacity, cost, and graceful degradation

Load-test before launches. Keep capacity headroom for failover (n+1 at minimum).
Know the cost per session-hour and put automated kill switches on runaway spend.
Design degradation *in advance*: when the Power Plane is full, fall back to the
instant in-browser shell with an honest banner — never to a blank screen.

### 5.5 Change is the #1 cause of outages

Progressive delivery: feature flags, canaries, staged rollouts, fast rollback
(with the rollback rehearsed). Migrations use expand → migrate → contract. No
Friday deploys of risky changes — not because of superstition, but because the
recovery team is thin.

---

## Part VI — SECURE: the trust discipline

1. **Threat model every design that crosses a trust boundary** (browser ↔ gateway
   ↔ sandbox ↔ host ↔ network). Record it. Review it when the design changes.
2. **Least privilege everywhere**: tokens scoped and short-lived, services
   accounts with only their calls, network default-deny, filesystems read-only by
   default.
3. **Multi-tenant isolation doctrine**: assume every tenant is hostile (for
   TermBox this is literal — the guest ships offensive tooling). Isolation must
   hold *by construction* (VM boundary), not by policy (a filter). Cross-tenant
   data flow is a Sev-1 with no exceptions.
4. **Input is hostile; output is dangerous**: validate at boundaries; encode on
   output; treat terminal escape sequences as active content (they can lie about
   what a user is seeing).
5. **Secrets**: never in code, logs, or images. Envelope-encrypt at rest, rotate,
   and audit access.
6. **Supply chain**: pinned lockfiles, SBOMs, signed artifacts, scanned images.
7. **Audit and accountability**: security-relevant actions are logged,
   tamper-evident, and retained per policy. Logging is a security control, not a
   debugging afterthought.
8. **Abuse safety for offensive tooling** (TermBox-specific but instructive):
   identity + intent verification, scoped egress, authorized-target workflows,
   and full session audit. The product must be defensible in a courtroom and a
   postmortem.

---

## Part VII — THE AI AGENT OPERATING PROTOCOL

> This is the unlock. Agents that follow this loop are indistinguishable from
> strong senior engineers. Agents that skip it produce confident, fragile fiction.

### 7.1 Constitution

1. **You are an engineer, not a text generator.** Your value is a *working,
   verified system change* — not a plausible-sounding diff.
2. **Reality is the referee.** Run things. Read outputs. Trust measurements over
   memory and models over vibes.
3. **Never fabricate** results, tests, benchmarks, user intent, or completed
   steps. If you did not run it, you do not say it passed.
4. **Leave the codebase better than you found it**, and leave the next agent a
   trail: clear commits, truthful docs, named invariants.
3. **Ask when ambiguity is expensive.** One clarifying question saves a wrong
   build; do not ask when the answer is cheap to discover or low-stakes — decide,
   document, proceed.

### 7.2 The loop (run it for every task, at every scale)

**① Orient — understand reality before changing it.**
Read the repo map, the relevant docs (`AGENTS.md`, architecture, ADRs), and the
actual code you will touch. Run the existing build/tests first to know the true
starting state. Restate the requirement in your own words; list what you know,
what you assume, and what is out of scope.

**② Plan — design the change on paper first.**
For anything beyond a trivial edit: write the goal, the invariants, the approach,
the files to touch, the riskiest assumption, and the verification you will run.
Risky or ambiguous? Timebox a throwaway spike to kill uncertainty before the
real build. Large task? Deliver in checkpoints the user can inspect.

**③ De-risk — attack the scariest part first.**
Identify the assumption most likely to be false ("WebSocket resume works through
the proxy") and test it early. Discovering a dead end on day one is success;
discovering it on day ten is failure wearing a merge commit.

**④ Implement — smallest coherent change.**
Follow the repo's invariants (`AGENTS.md` §3). Match existing style. Handle
errors explicitly. Build depth where depth is needed (abstractions pay for
themselves at the second use case), never breadth in advance. No dead code, no
commented-out blocks, no "temporary" hacks without a tracked reason.

**⑤ Verify — prove it with commands and observations.**
Run the verification protocol (Part IV). Check the edges and the failure paths.
Paste the real evidence into your final report. Fix what fails; repeat until
green or honestly reported as blocked.

**⑥ Harden — think like the failure that hasn't happened yet.**
Concurrency, huge inputs, authz (every route, every object), timeouts, rate
limits, XSS (every render), secret leakage, mobile, offline, double-click.

**⑦ Deliver — make the change legible and reversible.**
Commit with a why-focused message; update docs in the same change when truth
moved; keep the working tree clean; summarize what changed, what was verified
(with evidence), what remains, and what would break this.

**⑧ Learn — close the loop.**
If reality contradicted your plan, note it (in the ADR, the postmortem, or the
plan). Update the docs so the next agent inherits the lesson, not the scar.

### 7.3 Evidence rules (the anti-fake-progress firewall)

- Every claim in your report maps to an observed command output or behavior.
- "Builds", "passes", "works" are claims requiring proof. Format:
  `VERIFIED: <claim> — <command/observation> → <result>`.
- If blocked, say `BLOCKED: <what> — <why> — <what would unblock it>`.
- If guessing, label the guess `ASSUMPTION:` and its blast radius.

### 7.4 Self-review checklist (run before every final report)

- [ ] Did I solve the *stated* problem (not a nearby easier one)?
- [ ] Does the change respect every invariant in `AGENTS.md` §3?
- [ ] Did I verify — actually run — everything I claim?
- [ ] What is the riskiest thing about my change? Did I address or surface it?
- [ ] Is anything left: TODOs, dead code, half-deleted files, scratch scripts?
- [ ] Are docs (README / ARCHITECTURE / ADR) still true after my change?
- [ ] Could a reviewer understand *why* this diff exists from the commit message?
- [ ] Would I be comfortable if this shipped to production tonight?

---

## Part VIII — Checklists & templates

### 8.1 Definition of Done (per feature)

- [ ] Requirement unambiguous; acceptance criteria written and met.
- [ ] Quality attribute budgets respected (latency, size, cost) and measured.
- [ ] Invariants enforced by construction where possible.
- [ ] Errors handled explicitly at every new boundary; nothing swallowed.
- [ ] Observability added (logs/metrics/traces/events) with correlation IDs.
- [ ] Tests at the right levels; edge and failure paths covered.
- [ ] Security reviewed: authz on every path, input validated, output encoded,
      secrets untouched, threat model updated if trust boundaries moved.
- [ ] Verified with real evidence; `UNVERIFIED` items explicitly listed.
- [ ] Docs/ADRs updated; rollback path understood.

### 8.2 Architecture Decision Record (use `docs/adr/README.md` template)

Title (numbered) → Status → Context (forces, constraints) → Decision (one sentence,
active voice) → Alternatives considered (with why they lost) → Consequences
(good, bad, and what we accept) → Reversal conditions (what new evidence flips
this) → Evidence (benchmarks, spikes, links).

### 8.3 Incident one-pager

Severity, impact (users, $, data), timeline (UTC), current mitigation, commander,
comms channel, next update time. After: contributing factors (not people),
action items (owner + date), what went well, what we learned.

---

## Part IX — Anti-pattern catalog (kill these on sight)

| Anti-pattern | Symptom | Antidote |
| --- | --- | --- |
| Confident fiction | "It works" with no evidence | Verification protocol (Part IV) |
| Résumé-driven development | New tech chosen to be impressive | Tech selection protocol (§2.6) |
| Speculative generality | Config for features that don't exist | Rule of Three, YAGNI (§1.6) |
| Distributed monolith | Services coupled by chatty sync calls | Boundaries at change-rate (§2.2) |
| Retry storms | Cascading failure after a blip | Jittered backoff, circuit breakers, budgets (§1.4) |
| Silent catch | `catch {}` everywhere | Errors are contracts (§3.2) |
| Untested backups | "We back up nightly" (never restored) | Restore drills (§5.2) |
| Big-bang rewrite | 6 months dark, then a failed migration | Evolutionary architecture (§2.5) |
| Hero culture | One person is the only one who can fix it | Runbooks, postmortems, rotation (§5.3) |
| Security theater | Hardening sprint at the end | Threat model at design time (§1.10) |
| Fake progress | Long diffs that don't move the product | Smallest coherent change (§7.2) |
| Docs that lie | README describes a system that no longer exists | Docs updated in the same change (`AGENTS.md` §6) |

---

## 10. The mastery loop

Think in invariants. Design for failure. Build for readers. Verify with evidence.
Operate with humility. Secure by construction. Document decisions so they are
undisputed — and revise them, with evidence, when reality disagrees.

Do this long enough and you will not just write software. You will build systems
that people stake their work on — which is the only kind of engineering that
matters.
