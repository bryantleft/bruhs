# outside-site

The landing page and waitlist for [Outside](../steps), served at `outside.bruhs.app`. A static Astro site: no client JavaScript beyond a small enhancement of the waitlist form.

The page imports the game directly through the `@steps` alias in `astro.config.mjs`:
- sprites and scenes from `src/pixel/`,
- counts, places, skills and outfits from `src/game/content.ts`,
- the patched pixel fonts from `assets/fonts/`.

So the page always matches the app, and its numbers come from the game:
- **"a real first day"** (`src/lib/sample-day.ts`) runs a new save through the game's rules at build time: walk to pandan woods, chop, sync 8,000 steps. The report shows that run's numbers. The build fails if the day stops spending steps or ends somewhere else.
- **The fruitlands strip** orders places by road distance from the starting town (`route`), and shows lock text from `locationBlocker`.
- **The hero** draws the town on a double-width canvas (`sceneShapes({ width })`). The bruh's hop and the drifting clouds are CSS only, and both stay still under reduced motion. The 1200×630 link-preview image (`/og.png`) is drawn at build time from the same scene and fonts. The game's web build links to it too.

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

The form posts a urlencoded body to `POST /waitlist` on the Convex site URL. Handling lives in `apps/api/convex/waitlist.ts`:
- **Without JavaScript,** Convex answers with a 303 redirect to `/waitlist/joined/` or `/waitlist/invalid/`.
- **With JavaScript,** the form sends the same body with `Accept: application/json` and shows the reply in place.

Emails are trimmed and lowercased, and stored once. Repeats get the same reply, so the form can't reveal who signed up. A hidden honeypot field drops simple bots. There is no rate limit yet.

## Deploy

Live at https://outside.bruhs.app: Vercel project `bnle/bruhs-outside`, linked in `.vercel/`. `PUBLIC_WAITLIST_URL` is set for production and preview. The waitlist route runs on the hosted Convex beta (`earnest-wren-707`), with `WAITLIST_ORIGINS=https://outside.bruhs.app`.

Deploys are prebuilt here and upload only the static output. A remote build would need the whole monorepo, including the Expo app's local native build folders.

```sh
npx vercel@latest pull --yes --environment=production
# pull resets the local settings: keep the Astro preset and Node 22 (the project defaults to 26.x)
python3 -c "import json;p='.vercel/project.json';d=json.load(open(p));d['settings'].update(framework='astro',nodeVersion='22.x');json.dump(d,open(p,'w'),indent=2)"
npx vercel@latest build --prod
npx vercel@latest deploy --prebuilt --prod --scope bnle
```

The deploy endpoint needs Vercel CLI 47.2.2 or later.

To deploy from git later, connect the repository in Vercel and set the root directory to `apps/outside-site`, the Astro preset and Node 22.x, as `bruhs-www` does.

After changing `apps/api/convex/waitlist.ts`, deploy the API with `CONVEX_DEPLOYMENT=prod:earnest-wren-707 pnpm --filter bruhs-api deploy`.
