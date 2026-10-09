# 0004 — Workspace persistence: per-workspace volumes + versioned snapshots in object storage

- **Status:** Accepted
- **Date:** 2026-10-09
- **Deciders:** TermBox architecture (lead)
- **Related:** ARCHITECTURE §2 (Q6), §5.4, §8, §11.2; ADR 0001

## Context

Sessions are disposable by design (ephemeral sandboxes give us density, security,
and cheap recovery), but users' *work* is not. Files, dotfiles, and even running
processes must survive node loss, suspends, and tier changes. The persistence
model must respect: hostile guests (a sandbox cannot be trusted to write directly
to core storage), RPO ≤ 60 s (Q6), cheap idle cost, and instant attach.

## Decision

We will persist **workspaces, not machines**:

1. **Per-workspace volume** (network block/object-backed FS) mounted into each
   session sandbox read-write at a fixed mountpoint — the durable "home".
2. **Versioned snapshots** of the volume and (for microVMs) of full VM state to
   object storage on: explicit user action, suspend, and a rolling interval
   (≤ 60 s dirty-block delta, satisfying RPO).
3. **Postgres** stores metadata only (refs, digests, state machine — §8); object
   storage holds bytes. Guests reach persistence only through the node-agent —
   never with raw credentials.

## Alternatives considered

| Alternative | Why it lost |
| --- | --- |
| Durable full VMs per user | Cost (idle VMs), slow migrate, weaker isolation economics |
| Git-only persistence | Git is not a filesystem; binary artifacts, tool state, and running work don't fit; offered as an *export*, not the substrate |
| Direct S3 mounts from guests | Gives hostile code cloud credentials — violates §10.3-2/3 |
| Browser-only storage (IndexedDB) | Lost on cache clear; no multi-device; Instant Plane can cache, not own, the workspace |

## Consequences

**Good:** sessions are cattle (kill/restore freely — Q6 cheap); idle sessions
cost ≈ storage; multi-device continuity; volume snapshots double as backups and
as shareable workspace templates (Phase 3).

**Bad / accepted:** volume I/O is slower than local disk (mitigate with
write-through cache in the node-agent); snapshot consistency needs
crash-consistent FS semantics (journalled FS + agent-coordinated quiesce);
storage garbage collection is a real subsystem (snapshot TTLs, dedup).

**New obligations:** restore drills are part of ops (Guidelines §5.2); every
snapshot is content-addressed and encrypted at rest; volume data is tenant-scoped
in the access layer *and* by encryption keys per workspace.

## Reversal conditions

- Measured volume I/O p95 misses tool-workload budgets (e.g. `metasploit`
  workspace ops) → evaluate local-first FS with async replication instead.
- Snapshot RPO/RTO targets tighten below what delta sync delivers → move to
  continuous block replication.

## Evidence

- Prior art: Codespaces/DevPod volume+snapshot models; Firecracker snapshot
  resume (ms-scale) enabling full-VM-state suspend; CRIU-class process state via
  VM snapshots is exactly the "my `tmux` is still running" UX.
- Required spike (Phase 2): restore drill — kill node under load, measure time
  to resumed prompt and data loss window against RPO ≤ 60 s.
