# Project Access Spec

## Capability

Anonymous browser sessions isolate projects, snapshots, exports, references, and quota usage.

## Scenarios

### S1 Anonymous session

Given a request without a valid anonymous session cookie
When middleware handles the request
Then it sets a high-entropy HttpOnly session cookie
And the cookie is Secure only on HTTPS.

### S2 Project creation and listing

Given two different anonymous sessions
When each session creates a project
Then each project lists only the project created by that session.

### S3 Project mutation ownership

Given a project owned by session A
When session B renames or deletes it
Then the operation is rejected and the project remains unchanged.

### S4 Artifact ownership

Given a project owned by session A
When session B reads or writes snapshots, references, export data, or impact data for that project
Then access is rejected.

### S5 Generation ownership

Given a project owned by session A
When session B submits a generation request with that project ID
Then the request is rejected before charging quota or calling the model.

### S6 Quota identity

Given a valid anonymous session
When the session uses a generation or assistant endpoint
Then quota identity is derived from the session, not spoofable forwarding headers.

### S7 Legacy local projects

Given an existing project with no owner on localhost
When the first local session lists projects
Then unowned projects are claimed by that session.
On non-local deployments, legacy projects are not auto-claimed unless `CHENGJU_CLAIM_LEGACY_PROJECTS=1`.

## Acceptance

- Cross-session requests cannot list, read, mutate, delete, export, or append artifacts to another session's projects.
- A valid session cookie takes precedence over `X-Forwarded-For` for quota identity.
- Existing local workflows continue after legacy claim.
- All tests pass with no regressions.
