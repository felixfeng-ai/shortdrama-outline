# Quick Storyboard Batch

## Goal

Make the default quick visual result immediately playable as a 30-second dynamic
storyboard by generating and adopting five real shot keyframes after one budget
confirmation.

## Requirements

### R1 Five-shot scope

The quick visual target selects the first five valid shots in episode/shot order.
If some of those shots already have an adopted keyframe, only missing shots are
generated.

### R2 One budget

The visual quote includes five image generations in addition to visual, scenes,
and shots. The quote is frozen before execution. The page does not issue a second
confirmation for the four additional frames.

### R3 Persistent batch

Missing frames are submitted through one persistent image generation batch with
concurrency two. Successful assets are selected immediately. Failed items remain
visible in the existing task center and a retry only requests still-missing
shots.

### R4 User-facing result

The quick result describes the output as a dynamic storyboard, not a single first
frame:

- Composer option: `动态分镜`.
- Gate: five adopted keyframes, no video.
- Progress macro: `动态分镜`.
- Completion action: `播放动态分镜`.

### R5 Scope boundaries

This iteration does not add audio, BGM, MP4 rendering, or a new project.

## Acceptance

- Pure tests cover ordering, five-shot limit, selected-frame skipping, and missing
  target selection.
- Budget tests cover the new five-image price.
- Source tests cover one batch request, concurrency two, immediate adoption, and
  the quick result entry.
- Full test suite and production build pass.
