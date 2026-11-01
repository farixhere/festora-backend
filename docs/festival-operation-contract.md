# Festival Operation Contract Audit

Status: reducer-level audit completed for all 35 operation types.
Source: `farixhere/festora`, `main`, `index.html`, reducer object `R`.
Scope: this document records what the current frontend reducer actually reads and enforces. It is not a substitute for server-side validation. The reducer runs in the browser; the replacement backend must independently enforce every rule.

## Common operation envelope

The frontend creates operations with:
- `type`: one of the 35 reducer names below.
- `a`: operation-specific argument object.
- `cid`: client-generated operation ID used for notifications/idempotency.
- Local actor metadata `m: { u, role, team, name, t }`. The push request sends `type`, `a`, `cid`; the server must derive actor identity, role, team and timestamp from the authenticated session and server clock. Never trust client-supplied actor metadata.

The frontend applies operations in sequence order. A server implementation should persist immutable operation records with a unique sequence per festival and unique `(festival_id, client_id)` idempotency key. Duplicate client IDs must not apply twice. Exact retry/acknowledgement behavior still needs to be traced in the sync caller before implementation.

## Operation catalogue

| Type | Arguments read from `a` | Reducer behavior and observed constraints |
|---|---|---|
| `cfg` | `key`, `val` | Admin only. Updates `teams`, `cats`, `stages`, `subs`, `sched`, `pts`, or `limit`. Lists require IDs and names; referenced teams/categories/stages/sub-fests cannot be removed while used. Schedule days 1–7; minutes within a day; slot must be 10, 15, 20, 30, 45, 60 or 90. Point and grade values are bounded 0–100 with ordered grade cutoffs. Programme limit 1–20. |
| `reg` | `id`, `name`, `team`, `cat`, `skills` | Creates one candidate. Name required, max 60 chars; ID unique; team/category must exist. Team-role actor is forced to their own team. Skills max 8. Registration permission/lock checked. |
| `bulk` | `rows[]` with `id`, `name`, `team`, `cat` | Admin only. Creates valid non-duplicate candidates; invalid rows are skipped. Names max 60. |
| `editCand` | `id`, `name`, `skills` | Updates candidate name (max 60) and/or skills (max 8); candidate must be in actor's permitted team scope. |
| `delCand` | `id` | Deletes candidate only when team scope allows it and candidate is not in a non-pending or marked programme. Removes candidate from pending programme participant lists and topic maps. |
| `enroll` | `cid`, `pids[]` | Adds/removes candidate from eligible programmes. Candidate must be in actor's team scope; programme category must match candidate category; only pending, unmarked programmes can change. Full duplicate/capacity checks are delegated to frontend helper `enrollError` and need a further exact helper audit. |
| `sub` | `pid`, `out`, `in` | Replaces one participant in a pending, unmarked programme. Replacement must be same category and same team as outgoing participant, not already present, permitted by team scope, and not double-booked in the same schedule slot. |
| `topics` | `list[]` with `pid`, `cid`, `topic` | Sets/removes participant-specific topic (max 120 chars) only if programme enables topics, candidate participates, and actor can manage that candidate's team. |
| `addProg` | `id`, `n`, `cat`, `stage`, `sf`, `topic`, `judges[]` | Admin only. Creates programme with valid category/stage/sub-fest references; name max 60; up to 7 judge IDs; starts pending with empty parts/marks/submissions/topics; auto-places a schedule slot. |
| `editProg` | `id`, `n`, `stage`, `sf`, `topic`, `judges[]` | Admin only. Updates programme name, valid stage/sub-fest, topic flag and judges while pending. Up to 7 judges; removing a judge clears their marks/submission. |
| `delProg` | `id` | Admin only. Deletes only a pending, unmarked programme; also removes schedule slots and related appeals. |
| `autoSched` | none | Admin only. Runs automatic placement for all programmes. Exact placement algorithm is implemented in frontend helper `autoPlace`; port it only after separately auditing helper constraints. |
| `setTime` | `pid`, `t`, `day` | Admin only. Updates existing schedule slot. Time is integer minute-of-day 0–1439; day is clamped to configured 1–days. |
| `marks` | `pid`, `j`, `marks` object keyed by candidate ID | Pending programme with participants only. Judge can submit only their own assigned marks; admin-capable actor may submit for an assigned judge or special `adm` judge. Every participant requires score 0–100, rounded to 1 decimal. A judge can submit only once until rescored. All judges submitted moves programme to scored. |
| `verify` | `pid` | Admin only. Moves scored programme to verified. |
| `rescore` | `pid` | Admin only. Cannot rescore published programme; clears submission flags and returns programme to pending for new marks. Existing marks object is not explicitly cleared in this reducer, so preserve observed behavior only after confirming downstream calculation semantics. |
| `publish` | `pids[]` | Admin only. Publishes only verified programmes; records publish timestamp from server-derived actor metadata/time; winner notification is generated from the scoring helper. |
| `unpublish` | `pid` | Admin only and blocked when results lock is active. Published programme returns to verified. |
| `appeal` | `pid`, `id`, `reason` | Team role only. Programme must be published and include at least one candidate from actor's team. Unique appeal ID; non-empty reason max 500 chars; starts pending. |
| `decide` | `id`, `ok` | Admin only. Pending appeal becomes accepted/rejected. Accepted appeal moves a published programme back to scored for review. |
| `news` | `id`, `txt` | Admin only. Adds non-empty announcement, max 300 chars, with actor/server timestamp. |
| `delNews` | `id` | Admin only. Deletes matching announcement. |
| `notify` | `txt`, `to` | Admin only. Adds notification for target `to` (defaults to `all`); text max 300 chars. Recipient semantics need the notification helper audit. |
| `photo` | `id`, `src`, `cap` | Admin only. Adds gallery image, max 40 entries; source must be JPEG/PNG/WebP base64 data URL and max 420,000 chars; caption max 80. Backend should store binary/object storage rather than repeatedly copying large base64 blobs into operation rows. |
| `delPhoto` | `id` | Admin only. Removes gallery photo by ID. |
| `link` | `id`, `url`, `t` | Admin only. URL must be HTTP(S), no whitespace/quotes/angle brackets; title max 80; URL max 500. |
| `delLink` | `id` | Admin only. Removes link by ID. |
| `site` | `title`, `tag`, `color`, `sec` | Admin only. Title max 80, tag max 120; color must be a known frontend color key; section visibility flags are updated only for known section keys. |
| `lock` | `k`, `v` | Admin only. `k` is `reg`, `results` or `fest`; sets boolean lock. Festival lock makes festival read-only; registration lock closes registration. |
| `regDate` | `d` | Admin only. Sets empty or YYYY-MM-DD registration closing date. |
| `pub` | `mode` | Admin only. Sets public-site mode only when mode is in frontend `PUBNAME` map. Exact accepted values should be extracted from that constant before server implementation. |
| `teamLock` | `v` | Admin only. Sets whether team leader login is locked. |
| `candPhoto` | `id`, `img` | Candidate/team scope checked. Empty string removes photo; otherwise JPEG base64 data URL only, max 20,000 chars. |
| `brand` | `inst`, `color`, `logo` | Admin only. Institution label max 80; color empty or six-digit hex; logo empty or accepted by frontend `safeLogo` helper. Audit `safeLogo` before implementation. |
| `tpl` | `cert`, `poster` | Admin only. Certificate template index normalized modulo 4; poster template index modulo 3. |

## Authorization observations

The frontend helper considers `owner`, `org`, and `admin` admin-capable. Team users are restricted to their own team for registration/candidate operations. Judges may submit marks only for programmes to which they are assigned. Appeals are team-role only. These are observations of the client reducer, not a complete trusted authorization policy.

The backend must:
1. Resolve the user and active festival membership from a server-validated session.
2. Derive `u`, `role`, `team`, `name`, and event timestamp server-side.
3. Check festival membership and role permissions for every operation.
4. Enforce festival, registration, result and team-login locks server-side.
5. Validate referenced IDs and state transitions transactionally.
6. Persist an operation only if the state mutation succeeds; return a structured error if it is rejected.
7. Ensure client operation IDs are idempotent and sequence assignment is atomic.

## State transitions observed

Programme status transitions:
- Create: `pending`.
- All assigned judges submit marks: `scored`.
- Admin verifies: `verified`.
- Admin publishes: `published`.
- Admin unpublishes: `verified` (unless results lock).
- Admin requests rescore: `pending` (not allowed after publication).
- Accepted appeal on published result: `scored` for review.

Appeal status transitions:
- Team submits: `pending`.
- Admin decision: `accepted` or `rejected`.

## Important gaps still to audit

The 35 reducer bodies are now catalogued, but some called helper functions determine important business rules and remain to be traced:
- `ADM`, `canReg`, `enrollError`, `marked`, `calcS`, `autoPlace`, `placeOne`, `slotOfS`, `safeLogo`, `PUBNAME`, `COLORS`, `addNote`, `addLog`, `nextChest`.
- Exact accepted public-site modes, section keys, colour keys and logo URL/data handling.
- Exact sync duplicate handling, server acknowledgement and conflict behavior.
- Full request/response shapes for the 33 API actions.

Do not design the final domain schema until these helper rules and the action response contracts are reconciled. This audit does not authorize any frontend changes, production changes or data migration.


## Helper-rule audit (supporting reducer behavior)

The following helper implementations were also inspected in the current frontend source.

### Roles and registration scope
- `ADM(m)` is true for roles `owner`, `org`, and `admin`.
- `canReg(S,m,team)` allows admin-capable roles, or a `team` role whose `m.team` equals the candidate's team, provided registration is not closed.
- Registration is closed when the global registration lock is true or when a configured closing date is earlier than the current date used by the frontend.
- `marked(p)` means at least one judge submission exists in `p.subm`.
- Backend should calculate the date using a consistent festival timezone. The frontend helper's date-only comparison is not a sufficient timezone specification.

### Programme enrollment constraints
- A candidate may only enroll in programmes matching their category.
- Pending programmes with no marks are editable; any programme already marked or not pending is treated as fixed.
- The frontend counts fixed programmes plus newly selected editable programmes against the configured per-candidate limit.
- It rejects two selected/fixed programmes for the same candidate in the same schedule slot.
- Schedule-slot identity is based on day and minute-of-day.
- The exact error text is UI feedback, not a required backend response string.

### Scoring and result calculation
- Only judges whose `subm[judgeId]` is true are included in calculation.
- For each candidate in the programme, the frontend calculates the arithmetic mean of submitted judge marks and rounds to one decimal place.
- Rows are sorted by average descending. Equal averages share the same rank (competition ranking: e.g. 1, 1, 3).
- Grade is determined from configured cutoffs A, B and C; default thresholds are A=80, B=65, C=50.
- Points equal the configured rank points for the first three places plus the grade points.
- Team points are accumulated only from published programme results.
- This scoring rule should be covered by deterministic tests before implementation. Do not treat browser-computed scores as authoritative.

### Scheduling helpers
- Slot duration is configured in minutes; slots per day are calculated from (end - start) / slot duration, with a minimum of one.
- `placeOne` finds the first slot not already used by another programme on the same stage.
- `autoPlace` processes programmes in configured category order, then finds a slot with no same-stage collision and no shared participant collision.
- The current helper clamps the displayed day to the configured maximum but continues increasing the minute value when it runs beyond the configured total slot capacity. This can produce an out-of-range minute on the final configured day if no valid slot remains. Treat this as a frontend edge-case/bug to guard against in the backend; do not reproduce invalid times.
- The frontend has a separate conflict detector that reports same-stage or shared-participant collisions at a slot.

### Identifier, media and public-site constants
- IDs are normalized by stripping characters other than letters, digits, underscore and hyphen, then truncating to 24 characters. Some reducers further truncate IDs to 12 characters.
- Allowed public modes are `open`, `results`, `code`, and `closed`.
- The frontend colour palette currently contains `#1F78D1`, `#0B7A55`, `#6D2E8E`, and `#B3471D`; `site.color` stores the selected palette index.
- Brand logo accepts PNG/JPEG/WebP base64 data URLs up to 46,000 characters. Candidate photo accepts JPEG base64 data URL up to 20,000 characters. Gallery photo accepts JPEG/PNG/WebP base64 data URL up to 420,000 characters.
- These base64 limits are legacy frontend constraints. For the replacement backend, prefer object storage and persist a validated asset URL/reference, but retain the existing frontend's input/output contract during compatibility mode.

### Audit boundary
These helper rules complete the reducer-level business-rule extraction for the 35 operation types. Remaining contract work is now focused on the 33 top-level API actions: complete request/response fields, authentication/session lifecycle, payment-provider behavior, public read rules and sync acknowledgements. A further API caller audit is required before schema finalization.
