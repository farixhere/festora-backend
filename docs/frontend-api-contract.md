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
