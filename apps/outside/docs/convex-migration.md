# Convex migration verification

Outside targets the shared `bruhs-api` Convex workspace, now hosted under the plain bryantleft team (`left`). The migration replaces the Supabase SDK, SQL service and environment variables while retaining private weekly invite-code races and the existing Health-sharing consent flow. Local game and GPS storage have separate lifecycles and are not uploaded.

## Implemented boundaries

- Protected functions validate both the live Auth user and session; membership is derived on the server.
- Creating or joining is transactional and retry-safe. Shared daily totals keep their maximum; ties, unread totals and twenty-row pages retain their previous meaning.
- Leaving deletes the guest's shared weekly totals. Profile deletion also removes the guest's Auth records. The last departure removes the party and its invite.
- Canceled reads unsubscribe. Health uploads bind one JWT and AbortSignal to one HTTP request, avoiding the WebSocket mutation queue's reconnect replay. A write already accepted by the server may finish.
- A failed initial credential read remains pending for retry rather than creating a replacement guest. The EAS preview and production profiles enable the hosted-URL app-config guard; direct native builds and unmarked export/update paths remain outside that guarded path.

## Local verification

Both workspaces pass lint and TypeScript. The API's nine in-memory tests cover authorization, score validation, ties/pagination, leave/delete cleanup and auth-key formatting. Outside's 127 tests include the existing game, walk, Health and party cases plus the new transport and session checks.

Eight real local API scenario groups passed using five disposable guests, including an actual app HTTP upload, anonymous sign-in and token refresh, party isolation, concurrent creates, join versus last-account deletion, stale-token rejection and exact cleanup. Synthetic totals were used; no native Health or GPS API was called.

Fresh local Auth setup published valid JWKS JSON, and a second setup preserved both keys. The initial double-encoding failure is retained in the local evidence; the corrected script and regression test address it. Unrelated app dependency importers and their 1,274 dependency snapshots were restored to baseline; Supabase packages are absent from the final lock graph.

All-platform exports produced two Hermes bundles and thirteen HTML routes using a synthetic public Convex URL. This verifies JavaScript export, not native compilation, signing or device behavior.

Independent source reviews approved the corrected setup/domain code, abortable uploads, authenticated-guest cleanup and Metro changes. The first independent browser review (R1) recorded a raw result of 21 passed and 1 failed check (P2: failed-first-join cleanup). The follow-up closed that P2 across 320px, 390px and compact 3× CSS text/reduced-motion samples: an authenticated guest can delete immediately after a rejected join, without reloading. It also covered same-guest create/save/reload, confirmation cancellation and held-key guards.

The follow-up (R2) recorded a raw result of 29 passed and 1 failed check (P3). At the migration handoff, Back/reopen cleared the draft while retaining the old invite error; immediate failure and Delete cancellation preserved the draft. That navigation issue was still open at handoff. A later bounded correction, [feedback polish](ui-ux-research.md#2026-10-28--fresh-party-invite-feedback), cleared stale invite feedback in sampled browser flows. These sampled browser checks do not verify the interface at every paint. Local evidence is under `apps/outside/.playwright-mcp/convex-migration-20261027/`; those artifacts are ignored and do not accompany a clean checkout.

## Hosted beta verification

On October 28, 2026, `left/bruhs-api` was provisioned with the default production reference `beta` in US East (N. Virginia). The deployed client endpoint is `https://earnest-wren-707.convex.cloud`; [the dashboard](https://dashboard.convex.dev/t/left/bruhs-api/earnest-wren-707) manages this target. No plan upgrade or app-store submission was performed.

Fresh Auth setup and deployment succeeded. A second setup preserved its signing keys. Nine hosted API scenario groups passed with five disposable guests, covering OpenID discovery, actual app HTTP submission of synthetic totals, sign-in/refresh, isolation, validation, concurrent creates, join versus last deletion, and stale-token rejection. All five guests were deleted; a subsequent read-only query returned zero rows across the nine inspected Auth and party tables.

API lint/typecheck and nine tests passed; Outside lint/typecheck and 127 tests passed. An all-platform export with the real URL and production guard produced two Hermes bundles and thirteen HTML routes. Both native JavaScript bundles and the browser entry contain the hosted URL rather than the local backend URL. These exports do not produce or validate installable native apps.

Independent review exercised two guest sessions at 390×844 and 320×568 with reduced motion. Party controls and rows were sampled with a single 3× CSS font-size and line-height override. Create, rejected/valid join, reload, leave/rejoin, deletion cancellation/confirmation, last-invite invalidation and settled unexpired-JWT rejection were verified. Both guests were deleted through the UI and their original empty browser storage was restored.

The review records 49 passed assertions out of 53. Four raw failures and their adjudications remain in its report. Full 3× adventure typography remains unverified. An early query before a reliable deletion-settled wait returned success without a retained payload; later explicit empty-form and cleared-auth-storage checks rejected the same unexpired JWT for query and mutation. These samples do not establish behavior at every paint.

Outside's ignored local environment and served preview bundle now use the hosted URL. The first reload still served the old local URL; a restart of the parent-owned Expo process resolved that sampled mismatch, with document and bundle HTTP 200. The API's local selector remains separate. Preview and production EAS profiles contain the public hosted URL and production guard; the exact profile candidate received source/config approval, and five root app-config probes covered hosted acceptance, local URL rejection and optional development configuration. EAS builds, signing and device distribution were not run.

Evidence is under `apps/outside/.playwright-mcp/hosted-convex-beta-20261028/`, including `live-api-result.json`, `build-verification.json` and `independent-browser-r1/report.txt`. These local artifacts are ignored and absent from a clean checkout.

## Remaining release work

Native Health/GPS, guest persistence, battery use, OS text scaling and assistive technology remain unverified.

Convex Auth currently inherits its 30-day total session default. Guests cannot recover after expiry or reinstall; this does not automatically erase shared records. Recovery and retention policy must be resolved before public release. Scores remain client-reported and production abuse controls remain outstanding.

The browser reviewer inadvertently printed a local instance secret during a process check. The local instance secret and administrator credential were rotated in place; the previous administrator credential attempt failed, and its replacement succeeded. Auth/API smoke checks passed afterward, and the private recovery copy was removed. No hosted credentials were involved. Subsequent checks used no process argument listings.

Metro now excludes the backend `.convex` state directory alongside QA artifacts. A synthetic normal module entry returned 200 after file discovery; a matching entry inside `.convex` returned 404. No real backend config was requested.

The earlier development SSR invalidation race is still open. The migration preview returned an HTTP 500 from stale dev state and recovered after a clean Expo restart; that observation does not establish a universal fix.
