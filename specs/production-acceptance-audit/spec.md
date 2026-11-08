# Production Acceptance Audit

## Goal

Turn the 10-episode acceptance run into a repeatable, read-only audit. The audit
must use persisted project facts and never trigger generation, rendering, publish,
or quota changes.

## Requirements

### R1 Content chain

For a project, check the latest snapshots for characters, acts, episodes, visual
characters, scenes, and shots. The default acceptance target is 10 episodes, and
each episode must contain at least one scene and one shot.

### R2 Visual continuity

Every core character must have a visual-character record. At least one selected
image and one selected video must exist for every episode, mapped through the
current shot IDs.

### R3 Delivery chain

Every episode must have a successfully rendered delivery version. A ready
delivery package must cover all expected episodes, either as one series package
or multiple episode packages.

### R4 Task health

Only the latest generation task for each target and media kind counts as current.
A current failed task or a queued/running task older than 60 minutes blocks
acceptance. Superseded failures do not block a later successful retry.

### R5 Verdict

- `ready`: every check passes.
- `incomplete`: required content or delivery coverage is missing.
- `blocked`: a current task failed or is stale.

### R6 Privacy and read-only behavior

The report may contain counts, episode numbers, and check messages. It must not
contain story ideas, prompts, owner identifiers, storage keys, or generated
content. Reading the report must not create snapshots, tasks, renders, or quota
reservations.

### R7 Actionable repair queue

Every missing or blocked check produces one repair action with a stable target
workspace, a concise instruction, whether it may cause provider charges, and
whether it can run without user confirmation. No repair action is auto-runnable
in this iteration.

The report exposes:

- `actions`: all repair actions in execution order.
- `nextAction`: the first action, or `null` when ready.

Task failures and stale tasks are ordered first because they can invalidate later
production work. Missing creative content follows the normal production order.

## Acceptance

- Pure tests cover ready, incomplete, blocked, retry-superseded failure, and
  privacy-safe database reads.
- Tests prove every non-pass check yields a repair action, blocked tasks are
  prioritized, and no action is auto-runnable.
- The project API is owner-scoped and returns `cache-control: no-store`.
- Full test suite and production build pass.
