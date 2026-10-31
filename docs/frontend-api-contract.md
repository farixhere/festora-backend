# Frontend API Contract Inventory

Status: initial source audit, not yet a complete response-schema specification.

Source audited: `farixhere/festora` `main` branch, `index.html`.
Compatibility target: preserve the existing frontend's action-based POST protocol. Do not change the frontend during backend implementation.

## Transport contract confirmed from the frontend

- Method: `POST`
- Body: JSON object created as `{ action, token: TOKEN, ...data }`
- The action-specific `data` fields are listed below where directly observed.
- The frontend parses JSON and treats a truthy top-level `error` property as a failure.
- Special error values: `AUTH` ends the local session; `LOCKED:<message>` ends the local session and displays the supplied message.
- Successful responses are consumed as action-specific JSON objects. Response fields below are only recorded where the frontend source explicitly reads them.
- The API base URL is currently a Google Apps Script deployment embedded in the frontend. This replacement backend must not be switched into the frontend until staging workflows are tested and the user explicitly approves cutover.

## Confirmed action inventory (33)

| Action | Observed request data | Response fields directly observed / notes |
|---|---|---|
| `accounts` | none | `accounts`, `payments` |
| `addCoupon` | `code`, `label`, `months` | refreshed coupon/account data; inspect caller before implementation |
| `addUser` | `fest`, `u`, `p`, `role`, `name`, `team` | not yet fully specified |
| `ask` | `q`, `h`, `ctx: { view, role, page }`, `cid` | not yet fully specified |
| `buy` | `plan` | `ref`, `url` |
| `checkPay` | `ref` | `status`; observed values include `paid`, `cancelled`, `expired` |
| `claimPay` | `plan`, `utr` | `plan` |
| `couponLogin` | `code` | not yet fully specified |
| `coupons` | none | coupon list/data; inspect caller before implementation |
| `createFest` | `name` | festival creation result; inspect caller before implementation |
| `deleteFest` | `fest` | not yet fully specified |
| `deleteUser` | `u` | not yet fully specified |
| `festInfo` | `fest` | festival information; inspect caller before implementation |
| `fests` | none | `user`, `fests`, `plan` |
| `hit` | `k`, `v`, `f` (public hit includes current public festival ID) | not yet fully specified |
| `login` | `u`, `p`, `fest` | login result is consumed as `token`, `user` |
| `logout` | none | not yet fully specified |
| `myPlan` | none | `plan` |
| `organisers` | none | organiser data; inspect caller before implementation |
| `ownerStats` | none | owner statistics; inspect caller before implementation |
| `public` | `fest`, `since`, `code` | public state/operations; inspect caller before implementation |
| `pull` | `fest`, `since`, optional `plan` | `plan`, `ops`, `seq`, `name`, `code` |
| `push` | `fest`, `op: { type, a, cid }`, `since` | sync acknowledgement; inspect caller before implementation |
| `redeem` | `code` | `plan` |
| `reviewPay` | `ref`, `ok`, `lock` | refreshed accounts/payments data |
| `sendOtp` | `email` | `off` is checked; success otherwise signals OTP was sent |
| `setAccount` | `id` plus update object (call sites include lock/unlock and add-months updates) | refreshed account data |
| `setCode` | `fest`, `code` | not yet fully specified |
| `setCoupon` | `code`, `active` | refreshed coupon data |
| `setPassword` | `u`, `p`; another call includes `u`, `old`, `p` | not yet fully specified |
| `setSignup` | `open` | not yet fully specified |
| `signup` | `name`, `inst`, `phone`, `place`, `email`, `u`, `p`, `otp` | `token`, `user` |
| `users` | `fest` | `users` |

## Operation-sync protocol

The frontend sync layer:
- Loads a festival using `pull({ fest, since: 0 })`.
- Applies returned operations in ascending sequence order and tracks `seq`.
- Sends local operations using `push({ fest, op: { type, a, cid }, since })`.
- Polls using `pull({ fest, since, plan? })`.
- Each locally created operation includes `type`, argument object `a`, client ID `cid`, and local metadata `m: { u, role, team, name, t }`. The push request transmits `type`, `a`, and `cid`; server-side actor metadata must be derived from the authenticated session, not trusted from the client.
- The reducer ignores operations with unknown types and blocks writes when the festival lock is active, except the festival-unlock operation.
- The reducer applies operation functions with arguments `a`, actor metadata `m`, and the full operation record.

### Reducer operation types confirmed in source (35)

`cfg`, `reg`, `bulk`, `editCand`, `delCand`, `enroll`, `sub`, `topics`, `addProg`, `editProg`, `delProg`, `autoSched`, `setTime`, `marks`, `verify`, `rescore`, `publish`, `unpublish`, `appeal`, `decide`, `news`, `delNews`, `notify`, `photo`, `delPhoto`, `link`, `delLink`, `site`, `lock`, `regDate`, `pub`, `teamLock`, `candPhoto`, `brand`, `tpl`.

These names are confirmed, but the complete argument schemas and validation rules for all 35 reducers still need to be documented before implementation. Do not invent operation semantics or use a generic last-write-wins JSON blob. Preserve operation ordering, idempotency/client IDs, conflict behavior and authorization after the reducer is fully audited.

## State model visible in the frontend

A blank festival state contains:
- `cfg`: teams, categories, stages, sub-fests, scheduling constraints and scoring points.
- `cands`: registered candidates.
- `progs`: programmes, participants, judge assignments, marks and result state.
- `sched`: programme/stage/day/time assignments.
- `appeals`, `news`, `notifs`, `gallery`, `links`, `log`.
- `tpl`, `brand`, `locks`, and public `site` configuration.

The initial state defaults and reducer code are in the frontend source. Database normalization and JSON storage boundaries must be decided after the full reducer audit, not assumed from this summary.

## Known role-sensitive behavior visible in the frontend

The UI distinguishes roles including `owner`, `org`, `admin`, `team` and `judge`. The frontend helper treats `owner`, `org` and `admin` as admin-capable for reducer operations; team users are scoped to their team for registration operations. This is a frontend observation, not yet a complete server authorization policy. The server must enforce permissions independently.

## Remaining audit work before implementation

1. Record complete response shapes for all 33 actions by tracing every caller and every property read.
2. Extract signup/login validation, session expiry, role and festival-membership behavior.
3. Document argument schemas and authorization/validation rules for all 35 reducer operations.
4. Identify public API access rules, public-code handling and visibility states.
5. Document payment provider integration and distinguish verified payment from user-submitted UTR claims.
6. Convert the confirmed contract into request/response schemas and integration tests.

## Safety / migration boundary

- Backend work is staging-only.
- Do not change the frontend API URL.
- Do not modify or disable the existing Apps Script deployment.
- Do not migrate or overwrite production data without a verified export and explicit user approval.
- Keep unimplemented actions fail-closed; never report a successful write when no write occurred.


# API call-site audit (frontend source)

Audit date: 2026-10-31.
Source inspected: `farixhere/festora` / `main` / `index.html`.
Method: traced the shared `api(action, data)` transport helper and every observed action call site. This records the frontend's actual requests and the response fields it reads. It does not claim access to the old Apps Script implementation or its hidden validation/database behavior.

## Transport and error contract

The helper sends:
- HTTP method: `POST`
- Body: JSON object formed from `{ action, token: TOKEN }` merged with action-specific data.
- It does not set an explicit `Content-Type` header in the inspected helper.
- It parses the response as JSON regardless of HTTP status; frontend error handling is driven by top-level `j.error`, not by an explicit `response.ok` check.
- `error === "AUTH"` clears the browser session and returns the user to login.
- `error` beginning with `LOCKED:` also ends the session and shows the text after the prefix.
- Other `error` values are shown as errors.
- Network failures and invalid JSON are treated as retryable/offline errors.

Compatibility implication: return JSON for every response, preserve top-level `error` behavior, and decide deliberately whether to preserve the missing content-type header or safely add it after verifying the endpoint. The new backend should still return appropriate HTTP status codes; the frontend currently does not inspect them directly.

## Complete action inventory

Legend:
- **Observed request** means fields are sent by a concrete frontend call site.
- **Observed response reads** means fields directly consumed by frontend code.
- **Unknown** means the frontend does not reveal the complete server response or hidden server rules. Do not invent these.

| Action | Observed request fields | Observed response fields / behavior | Caller context |
|---|---|---|---|
| `accounts` | none | `payments[]`, account records. UI reads account `id`, `name`, `inst`, `phone`, `email`, `u`, `fests[]` (each `name`, `tier`, `ends`, `logins`), `paid`, `trial`, `locked`; payment fields `ref`, `paidAt` or `created`, `account`, `plan`, `amount`, `utr`, `status`. | Owner account administration. |
| `addCoupon` | `code`, `label`, `months` | `coupons[]` (same shape as `coupons` below). | Owner creates coupon. |
| `addUser` | `fest`, `u`, `p`, `role`, `name`, `team` | `users[]`; UI replaces current users list. | Fest admin creates team/judge/admin login. |
| `ask` | `q`, `h[]` (history entries `{r,t}`), `ctx` (`view`, `role`, `page`), `cid` | Reads `a`; if absent may read `offline` and `busy`. Local assistant fallback is used when no answer is returned. | FESTIQ assistant; visitor or logged-in role context. |
| `buy` | `plan` | Reads `ref` and `url`; saves reference then redirects browser to URL. | Starts online payment checkout. |
| `checkPay` | `ref` | Reads `status`; paid path refreshes `fests` and plan; cancelled/expired clears local payment reference. | Payment return and owner payment recheck. |
| `claimPay` | `plan`, `utr` | Reads `plan` from returned object; displays success message saying payment will be confirmed. Exact payment state semantics are not visible in frontend. | UPI/manual payment claim. |
| `couponLogin` | `code` | Reads `token`, `user`; then loads `fests`. | Coupon-based login. |
| `coupons` | none | Reads `coupons[]`; coupon row fields include `code`, `label`, `months`, `usedBy`, `firstUsed`, `until`, `fests`, `active`. | Owner coupon management. |
| `createFest` | `name` | Reads `fest`; UI expects `fest.id` and `fest.name`. | Organiser creates festival. |
| `deleteFest` | `fest` (festival ID) | No response fields read; success is inferred if no `error`. | Owner/organiser deletes festival after client-side name confirmation. |
| `deleteUser` | `u` | Reads `users[]`. | Deletes login from currently selected fest. |
| `festInfo` | `fest` | Reads `name`, `color`, `logo`, `teamlock`. | Pre-login festival-specific login screen. |
| `fests` | none | Reads `user`, `fests[]`, `db`, `plan`. Festival rows consumed for `id`, `name`, `created`, and owner-only `by`. | Post-login bootstrap and payment refresh. |
| `hit` | `k`, `v`, `f` | No response fields read. `k` is home/app/public page category; `v` is browser visitor ID; `f` is festival ID for public page, otherwise empty. | Non-blocking analytics. |
| `login` | `u`, `p`, `fest` (empty string when not festival-scoped) | Reads `token`, `user`; then loads `fests`. | Username/password login. |
| `logout` | no action-specific fields | No response fields read; fire-and-forget. | Session logout. |
| `myPlan` | none | Reads `plan` and stores the full returned object as current plan view data. Plan view reads `locked`, `paid`, `trialFest`, `plans`, `coupon`, `online`, `upi`, `payments[]`, `paidUntil` and plan fields such as `name`, `price`, `months`. | Organiser plan page. |
| `organisers` | none | Reads `organisers[]` and `signup`. Organiser fields rendered: `name`, `inst`, `phone`, `place`, `u`, `fests`, `created`. | Owner account/coupon administration. |
| `ownerStats` | none | Reads `visits.today.visitors`, `visits.today.home`, `visits.today.pub`, `visits.today.app`, `visits.d7`, `visits.d30`, `visits.total`, `visits.days[]` (`date`, `home`, `pub`), `orgs`, `coupons`, `fests`, `users.admin`, `users.team`, `users.judge`, `festList[]` (`name`, `by`, `created`, `users`, `views`). | Owner dashboard statistics. |
| `public` | `fest`, `since`, `code` | Reads `need`, `bad`, `name`, `ops[]`, `seq`, `pub`. Special `need === "closed"` means public site is closed; other truthy `need` means access code required/invalid. Poll reloads if `need` or `pub` changes. | Public festival results/site and big screen. |
| `pull` | `fest`, `since`, optional `plan` boolean | Reads `name`, `ops[]`, `seq`, optional `plan`, optional `code`. `ops` are replayed in sequence order. | Initial festival load, sync polling and plan refresh. |
| `push` | `fest`, `op:{type,a,cid}`, `since` | Reads `ops[]`, `seq`; integrates server-returned operations and removes matching pending operation by `cid`. | Writes one festival operation. |
| `redeem` | `code` | Reads `plan`; UI uses `plan.paidUntil`; then refreshes `pull` with `plan:true`. | Redeems organiser coupon. |
| `reviewPay` | `ref`, `ok`, `lock` (lock is inverse of ok) | Reads returned account/payment administration object as full `accounts` response. | Owner confirms or rejects a manual payment. |
| `sendOtp` | `email` | Reads `off`. When `off` is falsy, frontend shows six-digit email-code step. If action returns an error, signup flow may treat “Unknown action” specially and continue legacy behavior. | Email verification before organiser signup. |
| `setAccount` | `id` plus exactly one observed mutation: `addMonths` (1, 3, 6, 12), `endPlan:true`, `resetTrial:true`, or `locked:boolean` | Reads full updated accounts response. | Owner account management. |
| `setCode` | `fest`, `code` | No response fields read. | Saves festival public access code. |
| `setCoupon` | `code`, `active` | Reads `coupons[]`. | Enables/disables coupon. |
| `setPassword` | `u`, `p`; optional `old` for changing own password | No response fields read. | Admin resets another user's password, or user changes own password. |
| `setSignup` | `open` boolean | Reads `signup`. | Owner opens/closes organiser self-signup. |
| `signup` | `name`, `inst`, `phone`, `place`, `email`, `u`, `p`, optional `otp` | Reads `token`, `user`; then loads `fests`. | Creates organiser account. |
| `users` | `fest` | Reads `users[]`; each row rendered with `u`, `role`, `name`, `team`. | Loads festival login list. |

## Authentication/session observations

- Browser session storage uses key `mf_session` and stores `{token,user,lfest}`. This is a client-side convenience, not proof of server authorization.
- On boot, a saved token/user is restored and `fests` is called. For a festival-specific login URL, the stored `lfest` must match the URL festival.
- `login` can be festival-scoped with `fest`; `couponLogin` sends only a coupon code.
- `signup` is for organisers and sends the fields above. The UI requests an email OTP first unless `sendOtp` returns `off` truthy or an unknown-action compatibility branch is triggered. Signup includes `otp` only after the user enters the six-digit code.
- `logout` is fire-and-forget; local token and session are cleared immediately.
- `AUTH` and `LOCKED:` errors terminate the local session. Backend should return these exact error strings where compatibility requires.
- The UI does not reveal token format, expiry, refresh behavior, password hashing, OTP storage/expiry/attempt limits, or server-side role checks. These must be designed securely; they are not recoverable from this frontend file alone.

## Operation synchronization observations

- Initial load: `pull({fest, since:0})`, creates blank festival state and replays `ops`; sequence defaults to 0.
- Push: `push({fest, op:{type,a,cid}, since:SY.seq})`.
- Poll: `pull({fest, since:SY.seq, plan:boolean})`; `plan` is requested every 15th poll.
- Poll interval is 8 seconds while the festival app is active.
- Server response operations are ignored when `o.seq <= current sequence`; new operations are applied in order.
- Pending client operations are matched/removed by `cid`.
- Network errors retry pending operations with backoff; non-network API errors discard the pending operation and rebuild local state.
- Public site uses `public({fest,since,code})`, initially since 0 and then incremental sequence polling every 20 seconds (screen mode 15 seconds).
- Public responses can signal `need:"closed"` or another truthy `need` for a code gate. A change in `pub` triggers a full reload.
- Exact server-side duplicate handling, gap detection, transaction boundaries, conflict resolution and operation acknowledgement semantics remain unknown. These are mandatory backend design decisions; client behavior alone does not specify them fully.

## Important unknowns / items requiring source beyond the frontend

The old Google Apps Script source is not available in the current project context. Therefore this audit cannot establish:
1. Exact server-side request validation and authorization for any action.
2. Exact response schemas for fields the UI does not read.
3. Password hashing, OTP delivery provider, OTP expiry and rate limits.
4. Payment gateway provider, signed webhook flow, UPI reconciliation and refund/cancellation behavior.
5. Exact plan catalogue/prices and account entitlement rules beyond what the frontend renders.
6. Whether `claimPay` activates a plan immediately or records a pending claim (the UI copy says it will be confirmed, so do not assume immediate activation).
7. Exact public code storage/verification and visibility filtering rules.
8. Exact `push`/ `pull` server concurrency and idempotency semantics.
9. Whether `db` from `fests` is a public link, private link or legacy database location; it is only used as a link in the owner UI.

## Implementation guardrails

- Treat this document as a compatibility contract for observable frontend behavior, not as permission to blindly copy unsafe client assumptions.
- Validate every field and authorize every action server-side.
- Never trust `role`, `team`, `name`, `u` or timestamp from operation metadata; derive actor context from the session.
- Enforce `cid` idempotency and atomic festival sequence assignment in the database.
- Payment status must only be finalized from trusted server-side verification or an explicitly audited owner action, not from a browser redirect alone.
- Return structured JSON errors; retain `AUTH` and `LOCKED:` compatibility semantics.
- Do not switch the live frontend URL, alter the old Apps Script deployment, or import production data as part of this audit.
