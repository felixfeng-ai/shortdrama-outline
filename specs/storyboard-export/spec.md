# Storyboard Export

## Goal

Turn a ready dynamic storyboard into a standalone vertical MP4 with subtitles,
optional automatic narration, and a system BGM bed.

The export reuses the same selected media, shot order, captions, voice profiles,
quota ledger, and generated-file store as the browser player.

## Requirements

### R1 Source and eligibility

Only a `ready` 30-45 second storyboard can be exported. The manifest uses the
current selected image/video per shot and the same episode/shot order as the
player.

### R2 Narration

- Narration uses each segment's speaker and dialogue.
- If the speaker has no voice profile, export assigns a stable default system
  voice before synthesis.
- TTS calls use the existing generation task, asset, rate-limit and quota
  reservation ledger.
- If TTS is unavailable, the export continues with subtitles and BGM and returns
  an explicit narration warning.

### R3 BGM

The export automatically selects one system BGM track from the current project
facts, loops/trims it to the storyboard duration, fades at both ends, and ducks it
under narration.

### R4 Media

- Images become six-second vertical motion segments.
- Selected videos retain their planned duration and are normalized to the same
  frame size and format.
- A separate SRT is always produced.
- The final artifact is an MP4 with AAC audio and burned subtitles when the
  runtime font pipeline succeeds; otherwise the SRT remains available and the
  result reports that subtitles are sidecar-only.

### R5 Persistence

Exports are persisted per project with running, ready, or failed status, video
key, SRT key, duration, narration count, BGM track, warning, and timestamps.
Files are owner-scoped and served with `no-store`.

### R6 UI

The player exposes a secondary export action. Before paid narration it shows the
estimated character count and cost. Running, ready, download, and error states are
visible without blocking playback.

## Acceptance

- Pure tests cover SRT timing, narration quote, TTS unavailable fallback, and BGM
  plan.
- Repository tests cover owner/project isolation and terminal states.
- A real low-resolution FFmpeg integration test produces a playable MP4 and SRT.
- Full test suite and production build pass.
