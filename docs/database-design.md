# Festora database design v1

Status: designed and committed to the staging branch; migration is additive and awaits isolated Neon validation and main-branch approval.

## Architecture

The database uses two complementary layers:
- **Immutable operation history:** every accepted festival change is stored in `operation_log`, with a per-festival sequence and unique client operation ID (`cid`). This preserves the existing frontend's pull/push synchronization contract and enables replay/audit.
- **Normalized projections:** dedicated relational tables store teams, categories, stages, candidates, programmes, enrolments, judge assignments, marks, schedules, appeals, announcements, notifications, gallery metadata and links. These make permission checks, reporting and queries reliable.

The existing `users`, `festivals`, `festival_memberships`, `sessions` and `operation_log` foundation is retained. The migration only adds columns, indexes and tables. Festival-local IDs remain text because the existing UI creates opaque string IDs; global account/festival identities remain UUIDs.

## Tables by responsibility

### Accounts and authentication
- `users`: global account, username/email, password hash, active/locked state and profile fields.
- `organiser_profiles`: institution, contact phone and place.
- `festival_memberships`: role and optional team scope for a user in one festival.
- `sessions`: hashed opaque tokens, expiry and revocation.
- `email_otp_challenges`: OTP hash, purpose, expiry, attempts and one-time use.

### Festival configuration and sync
- `festivals`: name/owner plus timezone, public mode, access-code hash, registration/result/team locks, brand and settings.
- `festival_teams`, `festival_categories`, `festival_stages`, `festival_subfestivals`: per-festival dictionaries.
- `festival_counters`: atomic per-festival sequence allocator.
- `operation_log`: append-only operation payload, client ID, operation type, sequence and server-derived actor fields.
- `platform_audit_log`: separate audit trail for platform-wide privileged changes.

### Competition and judging
- `candidates`: participant identity, team/category, skills and photo reference.
- `programmes`: programme metadata and lifecycle state.
- `programme_participants`: candidate enrolment and participant topic.
- `programme_judges`: judge assignment.
- `judge_submissions`: submission marker/revision per judge and programme.
- `judge_marks`: score, criteria JSON and remarks per candidate/judge.
- `programme_schedule`: stage/day/start time.
- `programme_appeals`: team appeal and admin decision.

### Festival content
- `festival_announcements`, `festival_notifications`, `festival_gallery_assets`, `festival_links`.
- Gallery data stores a storage key/URL and metadata, not large base64 image blobs.

### Plans, coupons and payments
- `plans`: plan catalogue with amount in minor currency units.
- `coupons`, `coupon_redemptions`: coupon rules and redemption ledger.
- `subscriptions`: trial/paid entitlement timeline.
- `payments`, `payment_events`: gateway checkout, UPI UTR claim, manual review and verified provider event record.
- `platform_settings`: global signup switch.
- `analytics_visits`: privacy-minimized page visit counts.
- `assistant_usage`: minimal FESTIQ request/usage metadata, not full chat transcripts.

## Mandatory transaction patterns

### Push one festival operation
1. Validate the token by hashing it and finding a non-expired, non-revoked session; confirm the user is active.
2. Load the user's active membership for the requested festival; derive role/team/name from the database.
3. Start a transaction and lock the festival's `festival_counters` row.
4. Check `(festival_id, client_id)`. If already present, return the original acknowledgement and do not apply twice.
5. Validate operation type, payload, state transition, locks, team/judge scope and all referenced IDs.
6. Update normalized projection rows.
7. Increment the festival-local sequence and append the operation with server-derived actor/time.
8. Commit. Any validation or database failure rolls back both projection and operation log.

### Pull and public data
- `pull` returns operations with `festival_seq > since`, ascending, plus current sequence and optional plan summary.
- `public` enforces `public_mode` and verifies the supplied code against `public_code_hash` before exposing any operations.
- Keep legacy `festivals.data` intact while backfill and compatibility readers are developed. Do not delete it during this migration.

### Judging and results
- A judge can mark only an assigned programme and enrolled candidates.
- A marks submission and submission marker are atomic.
- Scores are constrained to 0–100 with one decimal.
- State transitions are server guarded: pending → scored → verified → published, with unpublish and appeal transitions implemented from the audited reducer rules.
- Ranking and team totals are calculated by one server-owned scoring module. Never accept client-calculated winners or totals.

### Payment integrity
- Browser redirects do not prove payment.
- Gateway payments become paid only after trusted provider webhook/status verification.
- UPI UTR submission creates a pending claim; an authorized owner confirms/rejects it after bank-side checking.
- Payment status and subscription entitlement changes commit together.
- Coupon redemption is transactional and unique per coupon/account.

## Known assumptions and items not yet proven by frontend source
- Exact legacy score payload/criteria, payment gateway, OTP email provider, plan prices, notification recipient expansion and full trial enforcement rules remain to be confirmed before their APIs are enabled.
- UI copy mentions a 299-hour trial, one trial festival and 40 students; these are compatibility clues, not verified server rules.
- The legacy Apps Script source is unavailable. This is a replacement design, not a claim that its old Google Sheet had identical structures.
- Object storage provider and retention policy remain a deployment choice.
- Some flexible configuration and criteria are JSONB until the exact legacy payload shape is mapped.

## Migration boundary
- This migration does not drop or truncate anything and imports no external data.
- It must first pass on a temporary Neon branch.
- Applying it to the main Neon branch is a separate approval step after the test report is reviewed.
- The live frontend URL and Apps Script deployment remain untouched.


## Isolated migration validation (2026-10-31)

- The 66 SQL statements in `drizzle/0001_festora_domain.sql` were executed together in one transaction on a disposable Neon branch cloned from the current main branch.
- Neon returned success for all statements.
- The branch contains 29 new domain tables in addition to the five original application tables (plus the Drizzle migration metadata table).
- Inspected `operation_log`, `judge_marks`, `payments` and `festival_memberships`: expected columns, primary/unique indexes, role/team references and score/payment checks were present.
- The new schema contains no imported user/festival/payment records. The original main branch was not changed.
- A provider-payment-ID unique index was intentionally not added in this pass; payment idempotency is covered by the unique payment idempotency key and unique provider event ID. Add provider-specific constraints once the gateway contract is confirmed.
- TypeScript compilation and full API integration tests have not yet been run. The Drizzle schema is a typed table map; the SQL migration remains authoritative for the full set of composite foreign keys and check constraints.


## Tooling note

The SQL migration is the source of truth for database constraints and indexes. The TypeScript Drizzle file provides table/column typing but does not yet mirror every foreign key and index one-for-one. Do not run `drizzle-kit generate` against this intermediate metadata; it could propose unwanted constraint changes. Before enabling schema generation, complete the Drizzle metadata parity pass and verify it against a fresh database introspection.


## Main-branch rollout completed (2026-10-31)

- User approved applying the additive domain migration to the main Neon branch.
- All 66 migration statements completed successfully in one transaction on `main`.
- Verification confirms 34 public tables total: the original five plus 29 domain tables.
- Verified the added `users.phone` and `festivals.public_mode` columns and key domain tables.
- Verified current row counts remain zero for users, festivals and operation log; no external data was imported or deleted.
- Recorded the exact SHA-256 migration hash in `drizzle.__drizzle_migrations` so Drizzle's migration ledger reflects the applied SQL.
- Deleted both temporary branches created for schema testing/migration preview. Neon now lists only the main branch.
- The staging Vercel deployment and frontend/Apps Script integration were not changed by this rollout.


## Live relational projection

Every accepted festival operation is applied to the canonical festival snapshot and operation log inside one database transaction. Before commit, the resulting state is projected into the normalized domain tables:
- Configuration: teams (including colour), categories, stages and sub-festivals.
- Participants: candidate identity, team, category, chest number, skills and legacy photo data.
- Programmes: participant enrolments, topics, judge assignments, judge submissions, marks and schedule.
- Operations: appeals, announcements, notifications, gallery assets and links.
- Festival-level settings: public mode, registration/results locks, team access, branding and site configuration.

The JSONB snapshot and ordered operation log remain the compatibility/sync source of truth for the current frontend contract. The normalized tables are now updated transactionally from each accepted state, so application data is queryable relationally without breaking the existing replay protocol.

Images are currently persisted in the existing legacy data fields / gallery source URL as data URIs. This keeps the current frontend working but is not the final scalable media architecture; moving these assets to object storage and storing object keys is a separate production-readiness task.

Migration `0004_candidate_team_projection.sql` adds the candidate chest number and team colour columns used by the relational projection.
