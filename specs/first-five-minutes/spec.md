# First Five Minutes

## Goal

Let a first-time creator turn one story idea into a visible, judgeable sample
without first learning the six-step system.

## Requirements

### R1 One protagonist

The empty-project home has one visual protagonist: the story idea composer.
Project management, the six-step explanation, source import, and sample projects
must not compete with it in the first hierarchy.

### R2 One primary action

The primary action creates the selected quick sample. The default is a playable
dynamic storyboard that adopts five keyframes; a cheaper story-only sample
remains available as a secondary range option.

### R3 Budget and time before action

The composer shows the selected range, credit cost, estimated time, and the
fact that this single confirmation authorizes only that range.

### R4 Progressive disclosure

Source import, example project, and the complete six-step explanation live in a
secondary disclosure below the composer. They must remain reachable without
occupying the first action.

### R5 Keyboard and state behavior

- Ctrl/Cmd + Enter starts the selected sample.
- Empty, too-short, loading, unavailable-range, and generation-error states are
  explicit.
- The primary button is disabled while the range quote is unavailable.

### R6 Results continue the same project

After the story or first keyframe is ready, the user can continue to the first
frame, view the first episode, or enter precise production. The sample never
creates a second project or a parallel set of facts.

### R7 Responsive

At 390px the composer, range selector, budget, and primary action remain a
single readable column with no horizontal overflow. At 1440px the composer is
the dominant element; supporting explanation is secondary.

## Non-goals

- Generate an unattended 30-90 second final episode in this iteration.
- Add new model providers.
- Replace the six-step production workflow.

## Acceptance

- Source-level tests lock the new hierarchy and progressive disclosure.
- Existing quick-trial execution tests remain green.
- Real screenshots at 1440px and 390px verify hierarchy, focus, and overflow.
- Production build and full test suite pass.
