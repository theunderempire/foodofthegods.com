# Sliding sessions: cause and fix

Status: **implemented.** The defects below are historical; the "Proposed fix"
section describes the current design, and the decisions at the end record the
values chosen.

The session mechanism kept the user's plaintext password in memory for the whole
session in order to silently re-authenticate them. That mechanism did not survive
a page reload, so the sliding session it existed to provide did not actually work.
The fix removed the cached credential rather than repairing it.

---

## Behaviour before the fix

`web/src/contexts/AuthContext.tsx`, with the API side in `api/src/routes/token.js`.

| Clock                | Value  | Set where                                       |
| -------------------- | ------ | ----------------------------------------------- |
| Access token TTL     | 1 day  | `token.js` — `jwt.sign(..., {expiresIn: "1d"})` |
| Auth cookie lifetime | 59 min | `AuthContext` — `COOKIE_DAYS`                   |
| Re-login timer       | 60 min | `AuthContext` — `SESSION_MS`                    |

On `login()`:

1. The raw username and password are stored in `credRef` (a `useRef`, so
   process memory for as long as the tab lives).
2. The returned JWT goes into a cookie, and the username into `localStorage`.
3. `startActivityTimer()` starts a 60-minute `setInterval`.

`mousemove` and `keydown` listeners set `activityRef.current = true`. When the
interval fires:

- **activity seen AND `credRef` populated** → silently call `login()` again with the
  cached credentials, install the new token, reset the activity flag.
- **otherwise** → `logout()`.

On mount, a separate effect reads the cookie and `localStorage.username`; if both
are present it restores the session and starts the timer.

## Three defects

### 1. A reload turns the sliding session into a hard 60-minute logout

`credRef` is populated **only** by `login()` and is never persisted — correctly, see
defect 2. After a page reload the resume-from-cookie effect starts the interval, but
`credRef.current` is `null`, so the tick can only ever take the `else` branch. The
user is logged out exactly 60 minutes after mount **no matter how much activity
there was**, and the silent re-login can never fire.

So the feature works only for a tab that has been open, untouched by a refresh,
since the moment of login. Any reload silently downgrades it to a fixed timeout.

Was pinned by `"a restored session cannot silently re-login, since credentials are
not persisted"` in `web/src/contexts/__tests__/AuthContext.test.tsx` (added in
PR #9); now rewritten as `"a reload refreshes the saved token and continues the
session"`.

### 2. Holding the password escalates any script-execution foothold

While `credRef` is populated, a successful XSS or a malicious dependency does not
steal a 1-day token — it steals the permanent credential. That is a categorical
difference in blast radius, and it exists purely to serve the re-login trick in
defect 1.

**Do not fix defect 1 by persisting the password.** Writing it to `localStorage` or
a cookie would make it readable by any script on the origin, forever, and would
turn the least-bad version of this problem into the worst one.

### 3. A cookie without `localStorage.username` yields a session with no expiry

`isAuthenticated` derived from the token, whose `useState` initialiser read the
cookie alone. But `startActivityTimer()` only ran when the cookie **and**
`localStorage.username` were both present. Clearing `localStorage`, or landing
midway through a partial logout, left the app authenticated with no client-side
expiry at all. Deliberately left untested at the time so as not to enshrine it;
the fix removes `localStorage` from the session entirely, pinned by `"the cookie
alone restores the session — localStorage is not consulted"`.

### Also: the three clocks disagree

The cookie expires at 59 minutes but the timer fires at 60, so for one minute the
session is live in memory while the cookie is already gone — a reload in that window
loses a session the timer was about to renew. And the token remains valid for a full
day after the cookie holding it was discarded, so a leaked token outlives its own
session by 23 hours.

---

## The fix: a refresh endpoint with an absolute cap

Replace "re-authenticate with cached credentials" with "exchange a valid token for a
fresh one." The client then needs no credentials after login, and the exchange works
identically before and after a reload because it depends only on the token.

### API

Add `POST /token/refresh`, mounted **behind** `tokenCheck` so only a currently valid
token can be exchanged:

- Returns a new token for `req.decoded.username`.
- Carries forward a `sessionStart` claim from the presented token. Tokens issued by
  `handleLogin` set `sessionStart` to issue time.
- **Refuses** if `now - sessionStart > SESSION_MAX_MS` (propose 12 hours,
  configurable). Without this cap a stolen token could be refreshed forever, which
  would be strictly worse than today's 1-day ceiling.
- Reduce the access token TTL from `1d` to `1h`, matching the intended session
  granularity, so a leaked token expires with the session rather than a day later.

`/token` is behind `authLimiter`. Refresh is called far more often than login, so
give it its own limit or exclude it — otherwise it will reproduce the lockout
described in `api/src/rateLimits.js`.

### Client

- Delete `credRef` and the silent-re-login branch entirely.
- On activity, call refresh, throttled to at most once per ~5 minutes (a
  `lastRefresh` timestamp, not an interval). Sliding then depends on real activity
  rather than a coincidence of interval timing.
- Refresh once on mount when a token is present, which is what makes a reload
  continue the session instead of starting a doomed 60-minute countdown.
- When refresh fails, `logout()`. The existing 403 interceptor in
  `web/src/api/client.ts` already preserves `returnTo` and redirects, so expiry
  lands the user back where they were after re-login.
- Derive the cookie lifetime from the token's `exp` rather than a separate
  `COOKIE_DAYS`, so the two clocks cannot drift apart.
- Take `username` from the token via `getUserIdFromToken` instead of `localStorage`.
  That removes the second source of truth and fixes defect 3 by construction.

### Tests

API (`api/test/routes/token.test.js`):

- a valid token is exchanged for one with a later `exp` and the same `username`
- `sessionStart` is carried forward, not reset — otherwise the cap never triggers
- refresh past `SESSION_MAX_MS` is refused
- an expired or absent token is refused (`tokenCheck` covers the mechanics; assert
  the endpoint inherits them)
- a token predating this change, with no `sessionStart`, is handled (see migration)

Web (`web/src/contexts/__tests__/AuthContext.test.tsx`) — the existing suite already
has the fake-timer scaffolding:

- activity triggers at most one refresh per throttle window
- a mounted session with a cookie refreshes and stays authenticated, **the assertion
  that fails today**
- idle past the token lifetime logs out
- a failed refresh logs out
- no password is retained anywhere after `login()` resolves
- the two tests currently documenting defects 1 and 3 must be rewritten, not deleted

E2E (`web/e2e/`, `chromium-dev`): reload mid-session with activity and confirm the
session continues; and session expiry redirects to login preserving `returnTo`.

### Migration

Tokens already in the wild have no `sessionStart` and a 1-day TTL. Treat a missing
`sessionStart` as `iat`, so existing sessions get a cap measured from issue time and
expire naturally. No forced logout is required, and nothing needs coordinating
between the API and frontend deploys.

---

## Alternatives considered

**Refresh token in an httpOnly cookie, with a short access token.** The textbook
answer, and the right one if this app grows real multi-user or revocation
requirements. Rejected for now: it needs server-side refresh-token storage and
revocation, the API to start reading cookies (today it is stateless header auth, and
the client reads the cookie in JS to set `X-Access-Token`), and CORS credentials
handling. That is a much larger change than the problem currently justifies. The
proposed design does not block it later.

**Drop sliding sessions; accept a hard 1-hour session.** Delete `credRef` and let
the token expire, relying on the `returnTo` redirect to soften it. This is the
smallest and most secure option and fixes all three defects. Rejected because it
makes the UX strictly worse than what the code is trying to provide, and the refresh
endpoint is not much more work. Worth reconsidering if the refresh work stalls —
it is a strict improvement over the status quo on its own.

**Persist the credentials so re-login survives reload.** Rejected. See defect 2.

---

## Decisions taken

1. `SESSION_MAX_MS` — **12 hours**, a constant in `api/src/routes/token.js`. The
   absolute ceiling before re-authentication is required; revisit as a product
   call if it bites.
2. Access token TTL — **1 hour** (`TOKEN_TTL`, same file). Shorter means more
   refresh calls; longer means a leaked token is useful for longer.
3. Refresh throttle — **5 minutes** (`REFRESH_THROTTLE_MS` in
   `web/src/contexts/AuthContext.tsx`), comfortably shorter than the token TTL so
   an active user never lapses.
4. Rate limiting — refresh stays on the `/token` mount but gets its own limiter
   (`refreshLimiter` in `api/src/rateLimits.js`: 120/15min in production,
   `REFRESH_RATE_LIMIT` to override) so it cannot drain login's
   credential-guessing budget and lock out everyone behind one IP.
