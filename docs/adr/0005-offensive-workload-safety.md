# 0005 — Trust & safety model for offensive-security workloads

- **Status:** Accepted
- **Date:** 2026-10-09
- **Deciders:** TermBox architecture (lead), product
- **Related:** ARCHITECTURE §2 (Q7, Q8), §9, §10; ADR 0001, 0004

## Context

TermBox ships Kali Linux — a toolkit for scanning, exploitation, and
password-cracking. Unlike a normal SaaS, **misuse is a first-class product risk**:
abuse complaints, upstream ASN blocks, law-enforcement requests, and reputational
damage can end the product faster than any bug. Simultaneously, the legitimate
market (learners, educators, authorized pentesters) is real and must not be
strangled by friction. Safety must be *structural* (architecture-enforced), not
policy prose.

## Decision

We will treat every session as **hostile traffic with an identity attached**, and
enforce it in the network and isolation architecture:

1. **Identity & intent:** real account (GitHub OIDC) on every tier; verified
   identity (payment method or stronger check) before any general-internet egress.
2. **Structural egress control:** default-deny proxy per session. Free/Instant
   tiers: package mirrors + lab network only — arbitrary internet scanning is
   *impossible*, not discouraged. Verified tiers: scoped CIDR allowlists tied to
   declared targets, with flow logging.
3. **Lab network first:** intentionally vulnerable per-user targets are the
   encouraged place to point the toolbox — the cyber range is the product's
   safety valve as well as its differentiator.
4. **Full accountability:** append-only audit + network flow logs + optional
   session recordings; AUP with explicit authorization requirements; abuse
   detection heuristics; takedown SLA and law-enforcement runbook.
5. **Isolation invariant (Q7/Q8):** hardware-VM-grade guest isolation in
   production (ADR 0001) so "hostile guest" never implies "hostile host".

## Alternatives considered

| Alternative | Why it lost |
| --- | --- |
| Honor-system AUP only | Inevitable abuse → upstream blocks; legal exposure; collapses trust |
| No internet egress on any tier | Kills legitimate pentest/OSINT use cases → product becomes a toy |
| Full open egress with logging only | Reactive posture; we would be a bulletproof hoster in slow motion |
| Real-name/KYC for everyone | Friction strangles the learner funnel; tiered model is proportionate |

## Consequences

**Good:** free tier is abuse-resistant *by construction*; legitimate users get
more power with more accountability; defensible posture for payment processors,
cloud providers, and regulators; lab network doubles as onboarding UX.

**Bad / accepted:** verified-tier onboarding friction; scoped-egress verification
(ownership proofs for target ranges) is ongoing operational work; some users
want raw sockets/monitor mode — out of scope until safety model matures (wireless
attacks need physical radios anyway).

**New obligations:** abuse-response rotation with real SLAs; quarterly review of
detection heuristics; transparency reporting; every egress-policy change is an
ADR-level event.

## Reversal conditions

- A cheaper structural control achieves the same abuse record (e.g. an ISP-level
  clean-pipe product) → simplify ours.
- Abuse metrics on free tier exceed budget despite mirror-only egress → add
  friction (cooldowns, attestation) before widening anything.

## Evidence

- Industry posture: browser-based attack-sandbox products (HackTheBox,
  TryHackMe, PentesterLab, RangeForce) run labs behind identity + scoped
  targets; open-egress "anonymous Kali VPS" providers are exactly the abuse
  magnet we refuse to become.
- Legal framing: computer-misuse statutes (e.g. CFAA, CMA, Budapest Convention)
  hinge on authorization and intent — our controls create the evidence chain for
  both.
