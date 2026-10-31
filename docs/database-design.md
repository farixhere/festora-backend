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
