# Project Progress DTO

## Goal

Provide one owner-scoped project progress model for the workspace, Agent, mobile
context, and future reporting. Six-step content progress, production stage,
completion, blocker, and next action must no longer be calculated independently.

## Requirements

### R1 Single response

`GET /api/projects/[id]/progress` returns:

- Project id and title.
- Current six-step key, index, label, completed count, total, percentage, and all
  six step states.
- Production stage key, label, position, total, percentage, stage status, and
  plan status.
- At most one blocker.
- At most one next action.
- Counts for characters, acts, episodes, visuals, scenes, shots, adopted images,
  and adopted videos.

### R2 Step semantics

Six-step completion is based on whether the corresponding latest snapshot exists
with content. The current step is the first incomplete main-chain step. When all
steps are complete, current remains delivery/shots-complete rather than inventing
a seventh step.

### R3 Blocker and next

The unique blocker is the first `fix` item from the existing todo facts. The next
action is the first `next` item. Their text, target step, and stable kind are
returned once, not duplicated across UI panels.

### R4 Production stage

If a production plan exists, its current stage is authoritative. Without a plan,
derive the stage from the six-step facts. The response includes stage progress
without mutating the plan.

### R5 Consumers

The workspace overview uses the pure DTO builder for its current task, blocker and
next action. The API uses the same builder from persisted facts and remains
owner-scoped with `cache-control: no-store`.

## Acceptance

- Pure tests cover empty, partial, blocked, and completed projects.
- Database tests prove adopted image/video counts and snapshot facts are used.
- Source/API tests prove the route and workspace share the DTO.
- Full test suite and production build pass.
