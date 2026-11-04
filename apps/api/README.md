# bruhs-api

The shared bruhs backend lives in this monorepo and uses Convex. Outside's private weekly step races are its first domain. Convex Auth's anonymous provider keeps the existing device-bound guest experience; shared accounts across future apps remain future work. Guest sessions currently inherit the SDK's 30-day total lifetime and cannot be recovered after expiry or reinstall.

## Local development

From the repository root, install dependencies and start a local backend:

```sh
pnpm install
CONVEX_AGENT_MODE=anonymous pnpm dev:api
```

Keep that process running. In another terminal:

```sh
pnpm --filter bruhs-api auth:setup
pnpm check:api
```

The first command creates the deployment's signing keys without printing them. Reruns preserve existing values, reject partial settings or malformed JWKS, and refuse conflicting writes. They do not validate that existing private and public keys form a cryptographic pair; the Auth smoke flow checks that behavior. Local deployment state stays in ignored `apps/api/.convex/`; its selector and public URLs stay in ignored `apps/api/.env.local`. The backend stops when `convex dev` stops.

Set Outside's ignored `apps/steps/.env.local` to the public client URL printed by Convex (normally the URL below), then reload Expo:

```dotenv
EXPO_PUBLIC_CONVEX_URL=http://127.0.0.1:3210
```

A phone needs a reachable LAN or hosted deployment URL. Convex deploy keys, refresh tokens and signing keys must never be bundled in Expo public variables.

## Hosted beta

The hosted beta belongs to the plain **bryantleft** team (`left`): [bruhs-api dashboard](https://dashboard.convex.dev/t/left/bruhs-api/earnest-wren-707). Its `beta` reference is the default production deployment in US East (N. Virginia). The public client URL is `https://earnest-wren-707.convex.cloud`.

From the repository root, target this deployment explicitly:

```sh
CONVEX_DEPLOYMENT=prod:earnest-wren-707 pnpm --filter bruhs-api auth:setup --prod
CONVEX_DEPLOYMENT=prod:earnest-wren-707 pnpm --filter bruhs-api deploy
```

The API's ignored `.env.local` continues to select the separate local backend. The explicit selector above targets the hosted beta. Auth keys are configured server-side; setup reruns preserve the existing pair. Outside's preview and production build profiles include the public hosted URL and URL guard. Development can use a local URL in its ignored `.env.local`.

The hosted Auth/API smoke flow passed using synthetic daily totals. Independent production-browser review verified the core two-guest flow, with documented test-harness qualifications. See [the verification note](../steps/docs/convex-migration.md#hosted-beta-verification) for scope and remaining device checks.

Local Supabase data and sessions are not imported. The migration does not remove the earlier local database volumes; the active SQL service, CLI dependency and client SDK have been replaced. This does not erase Outside's local game or GPS saves. Existing testers will create a Convex guest and a new party.

## Data and access

- `convex/auth.ts`, `auth.config.ts` and `http.ts` configure guest authentication. Convex Auth is currently beta.
- `convex/schema.ts` defines Auth records and the `outsideProfiles`, `outsideParties` and `outsideScores` domain tables. Weekly score rows contain at most seven daily totals.
- Every protected function validates the live user and session. Signed tokens from deleted or expired sessions cannot read or recreate a party profile.
- `outside.enter` creates or joins one party per guest, with a server-generated 128-bit invite. Only party members receive its invite, member list and scores.
- Step submissions pin the expected guest, validate the complete batch and keep the highest total per date. GPS geometry and local game state are absent from the API. Health uploads use an abortable HTTP request instead of the WebSocket mutation replay queue; cancellation cannot roll back a request already accepted by the server.
- Leaving deletes all the member's shared weekly rows. Account deletion additionally removes the profile, guest, sessions, refresh tokens, accounts and their verification records. The last departure deletes the party and invalidates its invite in the same transaction. Use the signed-in application flow for deletion; directly deleting database documents bypasses its cleanup.

- `convex/waitlist.ts` serves `POST /waitlist` for Outside's landing page. It stores one row per trimmed, lowercased email in `waitlist`, and replies the same way for repeats. A filled honeypot gets a normal reply but no row. CORS and form-post redirects only go to origins listed in `WAITLIST_ORIGINS`. Without that variable the route answers 500 `waitlist_not_configured` and logs which variable to set. There is no rate limit yet.

Board reads use two party-scoped indexed queries and return twenty rows per page. Sorting and ranking currently read the private party's full membership and requested weekly scores; very large parties will need a different ranking index before expanding the product's scope. Dates retain the current phone-local daily-bucket semantics, with a common Monday 00:00 UTC week label.

## Checks

`pnpm check:api` runs formatting/lint, TypeScript and Convex-test cases. Convex-test uses an in-memory backend. Real local and hosted Auth/API checks and browser flows are recorded separately in [Outside's migration note](../steps/docs/convex-migration.md); these do not establish physical-device behavior. Generated client references are exported as `bruhs-api/api`; regenerate them with `pnpm --filter bruhs-api codegen` after changing functions.

Session expiry or reinstall does not erase already shared records. Guest recovery and expired-guest retention need a release policy. Native Health/GPS/session checks and production abuse controls remain release work. Client-reported totals are not device-attested. See [Outside's release limits](../steps/README.md#private-parties-optional).
