# Delivery and Publish Center

## Goal

Turn a completed episode render into a publish-ready delivery package that a
small team can review, download, publish manually, and track in the production
ledger.

## Product Boundary

- Primary users are individual creators and teams of two to five people.
- Collaboration is link based. There are no organizations, member invitations,
  permission groups, or multi-level approval workflows.
- A reviewer may enter a display name and a free-form role label such as
  screenwriter, director, producer, client, or publisher.
- External publishing is manual until a platform provides an official API.

## Requirements

### R1 Publish-ready delivery package

Given a succeeded delivery render
When the owner creates a delivery package
Then the server creates:

- a clean MP4 copy;
- a publish MP4 with burned subtitles;
- SRT and ASS subtitle files;
- a cover image;
- publish metadata and an AI disclosure;
- a package manifest;
- a ZIP containing every artifact.

The package build must fail explicitly when subtitle burning or artifact
generation is unavailable. It must never return placeholder files or report a
partial package as successful.

### R2 Platform readiness

Given a supported platform profile
When the package is checked
Then the server validates ratio, resolution, duration, file size, subtitle,
cover, title, description, hashtag, and AI disclosure requirements.

Supported profiles are Douyin, Kuaishou, WeChat Channels, TikTok, Reels,
Shorts, Bilibili, and YouTube.

### R3 Series delivery

Given multiple succeeded episode renders
When the owner creates a series package
Then episodes are ordered and named `S01E01`, `S01E02`, and so on.

The package includes a `series-manifest.json` with episode metadata, hashes,
review status, publish status, and total production units.

### R4 Lightweight review links

Given a ready package
When the owner creates a review link
Then the server returns the raw token once and stores only its hash.

The public review page allows an unauthenticated reviewer to:

- play package episodes;
- leave timestamped feedback;
- submit `approved` or `changes_requested`.

The link expires, can be revoked, and exposes no owner, prompt, local reference
image, cost, or generation task data.

### R5 Publish records and metrics

Given an approved or ready package item
When the owner records a manual publish
Then the server stores platform, status, published URL, publish time, and note.

The owner can append metric snapshots with views, three-second views, completion
rate, likes, comments, shares, and production units.

### R6 Delivery page

The product exposes `/delivery/[projectId]` with:

- package creation;
- build progress;
- platform validation;
- copy-ready title, description, hashtags, and AI disclosure;
- download links;
- review-link management;
- publish records and metrics.

The entry is available from a succeeded render and the project tools menu.

### R7 Production ledger

The delivery summary exposes approved episode count, published episode count,
total views, weighted three-second retention, completion rate, production units,
and cost per thousand views. It must not invent data when metrics are absent.

## Non-goals

- Enterprise organization and role-based access control.
- Unattended automatic publishing through undocumented APIs.
- Professional multi-track editing, color grading, or VFX.

## Acceptance

- Unit and API tests cover package validation, manifests, review tokens,
  decisions, publish records, and metric aggregation.
- A real FFmpeg integration test verifies burned subtitles and a readable ZIP.
- Desktop and 390px browser screenshots verify the delivery and review pages.
- Full tests, production build, and production-readiness checks pass.
