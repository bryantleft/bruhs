# outside-site

The landing page and waitlist for [Outside](../steps), served at `outside.bruhs.app`. A static Astro site: no client JavaScript beyond a small enhancement of the waitlist form.

The page imports the game directly through the `@steps` alias in `astro.config.mjs`:
- sprites and scenes from `src/pixel/`,
- counts, places, skills and outfits from `src/game/content.ts`,
- the patched pixel fonts from `assets/fonts/`.

So the page always matches the app, and its numbers come from the game:
- **"a real first day"** (`src/lib/sample-day.ts`) runs a new save through the game's rules at build time: walk to pandan woods, chop, sync 8,000 steps. The report shows that run's numbers. The build fails if the day stops spending steps or ends somewhere else.
- **The fruitlands** draws the app's world map (`src/pixel/world.ts`, shared with the map tab) beside the places, ordered by road distance from the starting town (`route`), with lock text and grey pins from `locationBlocker`.
- **The hero** draws the town on a double-width canvas (`sceneShapes({ width })`). The bruh's hop and the drifting clouds are CSS only, and both stay still under reduced motion. The 1200×630 link-preview image (`/og.png`) is the same hero, rendered at build time by resvg from the game's own font files with system fonts off, so it never depends on the build machine. The game's web build links to it too.

## Develop

```sh
pnpm dev:api                 # local Convex backend, from the repo root
pnpm dev:outside-site        # https://outside-bruhs.localhost
```

Copy `.env.example` to `.env`. `PUBLIC_WAITLIST_URL` must point at the Convex waitlist route, and the build fails without it. On Vercel it must also be https. The local backend must list the page's origin:

```sh
CONVEX_AGENT_MODE=anonymous npx convex env set WAITLIST_ORIGINS "https://outside-bruhs.localhost,http://localhost:4321"
```

## Waitlist

The signup form posts a urlencoded body to `POST /waitlist` on the Convex site URL. The privacy page's removal form posts to `POST /waitlist/leave`. Handling lives in `apps/api/convex/waitlist.ts`:
- **Without JavaScript,** Convex answers with a 303 redirect to a static result page: `/waitlist/joined/`, `/waitlist/left/`, `/waitlist/invalid/` or `/waitlist/busy/`.
- **With JavaScript,** the form sends the same body with `Accept: application/json` and shows the reply in place.

Emails are trimmed and lowercased, and stored once. Replies are the same whether or not an email was listed, so the forms can't reveal who signed up. A hidden honeypot field drops simple bots. A global rate limit (20 a minute, bursts of 40) caps floods; past it, the forms say to try again in a minute.

Signups are double opt-in. Joining stores the email as pending and sends a confirmation link through Resend (`apps/api/convex/emails.ts`, from `send.bruhs.app`). The link opens `/waitlist/confirm/`, whose button posts the token to `POST /waitlist/confirm`. It's a button rather than an automatic confirm, because mail scanners open links but don't press buttons. Links last 7 days, and unconfirmed rows are deleted after that. The confirm page needs JavaScript to read the token from the link.

`/privacy/` says what the list keeps and why. Update it, and its `UPDATED` date, whenever that changes.

## Deploy

Live at https://outside.bruhs.app: Vercel project `bnle/bruhs-outside`, linked in `.vercel/`. `PUBLIC_WAITLIST_URL` is set for production and preview. The waitlist route runs on the hosted Convex beta (`earnest-wren-707`), with `WAITLIST_ORIGINS=https://outside.bruhs.app`.

Vercel deploys from git: the project is connected to `bryantleft/bruhs`, with root directory `apps/outside-site`, the Astro preset and Node 22.x (also pinned in `package.json` `engines`).
- **Production:** every push to `main`. `scripts/vercel-build.sh` first deploys the shared Convex API (`apps/api`) to `earnest-wren-707` with the Production-only `CONVEX_DEPLOY_KEY`, then builds the page. So the waitlist route is live before the page that posts to it. The build fails if the key is missing.
- **Preview:** every other branch. Previews build the page only and never touch the API.

`vercel.json` skips the build unless the push changes this app, `apps/api`, the game sources and fonts it imports (`apps/steps/src`, `apps/steps/assets`), `packages/` or the lockfile. Vercel clones the repo, so ignored local folders such as the Expo app's native builds never reach it.

To deploy by hand, without git, use Vercel CLI 47.2.2 or later:

```sh
npx vercel@latest pull --yes --environment=production
npx vercel@latest build --prod
npx vercel@latest deploy --prebuilt --prod --scope bnle
```

To deploy the API by hand: `CONVEX_DEPLOYMENT=prod:earnest-wren-707 pnpm --filter bruhs-api deploy`. To replace the Vercel deploy key, create one with `npx convex deployment token create <name> --deployment earnest-wren-707`, then set it as the sensitive Production variable `CONVEX_DEPLOY_KEY`.
