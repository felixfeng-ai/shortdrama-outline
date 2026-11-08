# Agent Command Closure

## Goal

Close the Agent gap between advice and execution with one confirmed command path.
The Agent may propose four command types, but nothing executes until the creator
confirms the card.

## Commands

### R1 Quick trial

`quick-trial` starts the existing project quick-trial run with `idea` and
`target`. It uses the shared quote and quota check and creates no parallel run.

### R2 Image batch

`image-batch` accepts stable `shotIds`, resolves prompts and aspect ratios from
the latest shots snapshot, and enqueues one persistent image batch. It never
accepts client-provided prompts or storage paths.

### R3 Batch rework

`batch-rework` accepts `repair-anchors` and optional stable shot IDs. It reuses the
existing deterministic batch rework implementation and writes one shots snapshot
only when something changed.

### R4 Canvas action

`canvas-action` accepts validated add/update/remove node and connect/disconnect
edge operations against `expectedRevision`. It saves through the existing canvas
graph repository and rejects stale revisions.

### R5 Confirmation boundary

- Tool proposal returns a `command-plan` card with command, title, summary, impact,
  and payload.
- Proposal does not mutate database state.
- Execution endpoint requires `{ confirmed: true }`.
- The command route applies command-specific rate limiting and project ownership.

## Acceptance

- Tool tests prove proposal cards do not mutate state.
- Execution tests cover all four command types.
- Source tests prove AgentDock calls the confirmed command endpoint.
- Full test suite and production build pass.
