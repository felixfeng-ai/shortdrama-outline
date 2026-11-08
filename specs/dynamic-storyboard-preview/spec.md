# Dynamic Storyboard Preview

## Goal

Let creators watch a real 30-45 second dynamic storyboard without generating a
new video or inventing a parallel progress model.

The preview is assembled only from the current shot order and media already
adopted in the project. When there is not enough adopted media, the product says
so and points to the next real production action.

## Requirements

### R1 Real source facts

The preview uses:

- Latest `shots` snapshot order, episode first and shot number second.
- Selected video for a shot when available.
- Selected image for a shot when no selected video exists.
- The shot speaker, dialogue, characters, and action for captions and context.

Unselected candidates, placeholders, stock images, and fabricated frames are not
allowed.

### R2 Duration

- Selected videos use their real duration, clamped to 2-10 seconds.
- Selected still images use 6 seconds.
- The plan stops once 36 seconds is reached.
- A plan shorter than 30 seconds is `insufficient`.
- A plan from 30 to 45 seconds is `ready`.
- No segment extends the plan beyond 45 seconds.

### R3 Honest status

The API returns `ready` or `insufficient` with actual segment count, image/video
counts, duration, and skipped shots. It does not report rendering, generation,
or final-video progress.

When insufficient, it reuses the production acceptance repair queue and returns
the current next action rather than a generic error.

### R4 Player

The dedicated player route is `/storyboard/[projectId]`.

It provides:

- Play, pause, restart, previous, and next controls.
- Space to toggle playback and arrow keys to move between segments.
- Current elapsed time and total duration.
- A real segment rail showing episode, shot, media kind, duration, and dialogue.
- Image segments use a restrained pan/zoom effect unless reduced motion is set.
- Video segments play muted and inline.
- Loading, empty, insufficient, and fetch-error states are explicit.

### R5 Entry and privacy

- A completed quick-trial visual result exposes a "播放动态分镜" entry.
- The preview API and page are owner-scoped.
- API responses contain no owner, prompt, storage key, or file path.

## Acceptance

- Pure tests cover ordering, video preference, selected-only media, duration
  clamping, ready/insufficient thresholds, and the 45-second cap.
- Source tests cover the API, player states, keyboard controls, reduced motion,
  and quick-result entry.
- Real screenshots at 1440px and 390px verify ready and insufficient states with
  no overflow.
- Full test suite and production build pass.
