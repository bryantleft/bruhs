# bruhs / outside

A native iPhone and Android pixel-art step MMO built with Expo SDK 58, in the spirit of RuneScape and WalkScape. Real steps are the only input: they move your bruh around the fruitlands, pay for skilling actions, and level eight skills from 1 to 99. Gear, food buffs, chests and a 28-slot bag add WalkScape-style depth. The web version uses clearly labeled sample step history.

The world tab shows a pixel diorama of your location, the current action and what you can do there. The map, skills, bag (inventory, gear, bank, store) and quests tabs cover travel, progression, items and story. Tap the bruh in the HUD for your character: outfits, stats, daily goal, step sync, party races and the optional GPS walk. The design is recorded in [`docs/superpowers/specs/2026-11-02-steps-mmo-design.md`](../../docs/superpowers/specs/2026-11-02-steps-mmo-design.md).

From the monorepo root:

```sh
pnpm install
pnpm dev:steps
```

Health connections and native maps require a **native development build**. Expo Go cannot load these native modules; the browser cannot access HealthKit or Health Connect. From this app directory:

```sh
pnpm ios      # build and launch the iOS development app
pnpm android  # build and launch the Android development app
pnpm web      # sample steps with optional real browser GPS
```

`expo prebuild` generates ignored `ios/` and `android/` folders from app configuration. After changing native dependencies or config plugins, regenerate and rebuild the development app. `eas.json` also provides cloud development, preview, and production profiles.

## Game rules

- **Step pouch.** Every synced step lands in your pouch. Your bruh spends pouch steps on travel first, then on repeated actions of its current activity. While idle, steps wait in the pouch and are never lost.
- **Skills.** Woodcutting, mining, fishing, foraging, smithing, cooking, crafting and agility use RuneScape's XP curve (level 99 = 13,034,431 XP). Agility trains on every step (1 point per 4 travelled steps and per 12 working steps, worth 8% more per agility level), shortens travel, and opens dragonfruit peak at level 40.
- **Action math.** As in WalkScape, work efficiency adds work per step: steps = base ÷ (1 + efficiency), never below half the base. Efficiency comes from tools (bronze +5% through mithril +40% and moonsteel +55% to sunsteel +70%), gear, food and levels (1.25% per level above the requirement, up to 25%).
- **Stats.** Gear, tools and food carry work efficiency, double action (xp and loot twice), double result (loot twice), save materials, bonus xp, find chance, chest find, travel speed and inventory slots. Many apply to one skill only. The bag's gear tab totals them, and each activity sheet shows the resulting steps, chances and drop table.
- **Inventory and bank.** The bag holds 28 slots (materials stack 25, other items 10). Backpacks add slots, and six backpack upgrades bought at a bank add two slots each (500 to 60,000 coins). A full bag stops gathering and keeps the steps in the pouch. Banks exist only in bruhbridge and blueberry bay. There, recipes can also draw on the bank and you can deposit, withdraw, sell and buy.
- **Gear.** Ten slots: head, cape, neck, back, chest, hands, legs, feet and two rings, plus a toolbelt. Crafted gear rolls a quality (normal, good, great, excellent, perfect) that multiplies its stats by up to ×2. Better crafters roll better.
- **Tiers.** Every gathering skill has resources at levels 1, 15, 30, 50, 70 and 85, with matching cooking and smelting recipes. Moonwood, moonstone, moonray, persimmon and silkweed grow in the moonlit grove. Starwood, sunstone, sunfish and lychee are found in starfall crater, which also has a forge and a range. Crafted gear runs from level 1 to 92.
- **Food.** Cooked fish and fruit give one buff at a time, lasting 30–200 actions.
- **Chests and finds.** Every action can find a skill chest (1 in 300) or an adventurer's chest (1 in 2,000), scaled by chest find. Mining finds gems and foraging finds golden seeds. Chests sit in the treasury without taking slots and open into coins plus loot-table rolls, including chest-only gear.
- **Randomness.** All rolls use a seeded generator stored in the save, so results replay deterministically.
- **World and quests.** Ten locations are linked by roads, and travel follows the shortest road. Twenty quests run from day one to the legend of the fruitlands (every skill 80). Each has requirements, item hand-ins at the giver's location, rewards and quest points. Mangosteen marsh, the moonlit grove and starfall crater open through quests, and dragonfruit peak needs agility 40. `pnpm balance` checks that each quest's reward is worth about 2.5–8.5 times the steps it costs.
- **Missions, outfits and the collection log.** Each day, week and month brings three missions: a walk scaled to your daily goal, plus two drawn from that period's pool (skill actions, road steps, chests or a quest). The draw depends only on the period, so it stays fixed and everyone shares it. Missions pay coins, and the weekly and monthly walks also pay chests. The six bruh outfits unlock with total level. The character screen tracks every item you have found and lifetime counters.
- **Saves.** Saves use format v3. Version 2 saves keep their items in the bank. Version 1 saves keep their step history, and today's steps become the starting pouch. The browser demo uses a separate storage key and adds 500 steps per walk button press.

## Real-world walks

Open **walk map** from Play, then **Start**. Your equipped bruh marks your location on real streets. GPS distance earns three stamps at 250 m, 500 m, and 1 km; Health steps continue earning XP separately.

- Location starts only after your action. The previous recap stays until a GPS fix arrives; Cancel stops a pending request.
- Keep the app in the foreground. Switching apps pauses recording. Resume starts a new segment and never counts the unrecorded gap. The timer shows recorded session time, not a motion-sensor estimate of time spent moving.
- Finish saves a recap. Only the latest walk is retained; a new walk replaces it. **Delete saved walk** removes its route and stamps while preserving step progress. Resetting the demo also removes its GPS walk.
- Routes stay in local app storage and are not shared with parties. Map tiles load over the internet through [OpenFreeMap](https://openfreemap.org/quick_start/); tile requests reveal the viewed map area to the map service. Attribution remains visible.

[MapLibre React Native](https://maplibre.org/maplibre-react-native/docs/setup/expo/) renders native maps; MapLibre GL renders the web preview. No map API key is required. Browser GPS needs HTTPS or localhost and site permission. The native build requests foreground location only, with no background location service.

`pnpm install` runs `scripts/sync-map-assets.mjs` to copy the installed web worker and CSS to `public/maplibre/<version>/`. Run `pnpm sync:map` after changing MapLibre. Actual native GPS accuracy, permission recovery, rendering, and battery use still require phone testing. This first mode does not record with the screen locked or import Strava routes.

## Private parties (optional)

Private weekly step races with invite codes lead friend competition in the first release. Play’s **party** shortcut opens the race when Convex is configured. Each guest belongs to one party. Joining requires explicit consent to share their name, bruh and daily step totals with anyone who joins through the invite. The login stays on that device, in the iOS keychain or Android's encrypted SecureStore (web keeps it in browser storage); logins saved by earlier builds move there on first launch. It has no recovery after session expiry. On Android a reinstall removes it. On iOS the keychain usually keeps it, so a reinstall can come back signed in to the same party with a fresh local adventure, though this is not guaranteed. A kept login whose profile was deleted or expired is signed out on launch, and the party screen offers create and join again. Convex Auth currently uses its default 30-day total session lifetime; recoverable accounts remain future work. Expiry or reinstall does not erase previously shared records.

- Races reset Monday at 00:00 UTC. Scores sum phone-local daily buckets whose date falls in that UTC-named week; this is not a timestamp-exact UTC activity window.
- Ties share a rank. Unread steps remain **not synced**, distinct from a recorded zero. Per-day scores keep the highest submitted total, so retries cannot add it twice.
- Enabled native Health connections share the current week when the app opens, the week changes or the user refreshes. Party reads request no new OS permission and award no game XP. Browser demo steps never upload.
- Pausing step sync stops new uploads and discards pending reader results. An upload already accepted by the server may still finish. Previously shared totals stay. Leaving removes membership and shared totals; **delete party profile** also deletes that guest login and profile. Local journey erasure preserves party data.
- GPS routes and game saves are not uploaded. Scores are client-reported; device attestation and hard anti-cheat are not implemented.

The shared backend is [`bruhs-api`](../api/README.md) in this monorepo. Its Convex functions enforce membership and validate live guest sessions on the server. Follow that workspace's local and hosted setup, then set this app's ignored `.env.local` or EAS environment:

```dotenv
EXPO_PUBLIC_CONVEX_URL=https://earnest-wren-707.convex.cloud
```

Only this public deployment URL belongs in the app. Signing keys and Convex deploy keys stay server-side. Without the URL, single-player play remains available and its party shortcut is hidden. A loopback deployment works in the browser; physical phones need a reachable LAN or hosted endpoint.

The Convex migration replaces the earlier Supabase client and SQL backend. Earlier test sessions and parties are not transferred; local game and GPS saves stay on the device. In-memory tests, real local Auth/API checks and browser flows are separate evidence. Sampled hosted Auth/API and production-browser checks are recorded in [the migration note](docs/convex-migration.md#hosted-beta-verification). Physical Health sharing, guest/session behavior on devices and production abuse controls still require validation before distribution.

## Health step syncing

The native app reads **step totals only** from Apple Health / HealthKit on iOS and Health Connect on Android. Both adapters use platform aggregation, including source prioritization for overlapping phone/watch data. The health connection never writes records and requests no heart rate, workout, location, or background health-read access. GPS walks request foreground location separately, only after Start.

- Tap **connect** to open the system step-permission flow. Previously connected apps sync when opened, when the local day changes, and when **sync** is tapped.
- The first connection imports today. Later syncs catch up from the saved cursor, including days recorded while the app was closed. Yesterday is also re-read for watch records that arrive after midnight. Reads start no earlier than this connection's start day.
- Permission and step data must be available in the device's health store. A phone or compatible fitness/watch app must record steps there; Health Connect is not a guarantee that a provider has written data.
- Apple intentionally does not reveal read denial. A completed authorization sheet is not treated as permission granted. Empty reads show **no readable steps yet**, with a way to open Apple Health and retry.
- **Pause step sync** stops reads immediately, ignores pending results, and persists the pause. Resuming begins with today. Manage access in the system health app to revoke OS permissions.
- **Erase saved journey** requires confirmation, stops step sync and GPS recording, deletes the saved route, and replaces this app's saved game data. If route deletion fails, the walk stays paused, game progress stays, and the screen offers a retry through the same action. Health-store records and already-shared party totals are untouched. Leave the party or delete its profile separately to remove shared totals. Android OS backup is disabled for app storage.
- Daily game steps use the highest imported total for that day. Re-reading is idempotent; deleting health samples or changing read access does not remove earned XP, claimed bonuses, or companions.
- Of imported health data, only daily totals and connection metadata are persisted in app storage. Joining a configured party additionally shares current-week daily totals; single-player play does not upload them.

Health Connect's Android permission-rationale and permission-usage actions route to the app's health explanation screen through `plugins/with-health-rationale.cjs`. HealthKit capability and read-purpose text are configured through the package's Expo config plugin. Native folders must not be edited by hand.

See [the integration and device verification notes](docs/health-integration.md). Actual health records, source deduplication, permission revocation, and watch synchronization still require physical-device testing.

## Checks and builds

```sh
pnpm check
pnpm balance  # optional: pacing report at 7,000 steps a day, or pass another daily total
pnpm build
pnpm exec expo export --platform all
```

`check` runs Biome, TypeScript, and Node’s test runner. `balance` (`scripts/balance.ts`) runs the real rules: days to each level per skill, xp and coins per step for every gathering spot, store prices, quest gates, and two weeks at one spot with bank trips, chests and rare finds. Run it after changing numbers in `src/game/content.ts`. `build` exports the browser demo to `dist/`. The all-platform export also validates native JavaScript bundles; it does not produce signed installable apps. `eas.json` provides development, internal preview, and production build profiles for later device distribution.

The EAS `preview` and `production` profiles include `EXPO_PUBLIC_CONVEX_URL=https://earnest-wren-707.convex.cloud` and `BRUHS_BUILD_ENV=production`. This public value is available during app-config resolution and bundling; keep deploy keys and Auth signing keys out of the app. These settings prepare future builds; this setup did not run EAS Build or Submit.

The profile sets `BRUHS_BUILD_ENV=production`. `app.config.ts` rejects missing or nonstandard hosted Convex URLs before configuration resolves, including loopback, HTTP, `.convex.site`, credentials, paths, queries and fragments. It also checks when `EAS_BUILD_PROFILE=production` is available. Development retains optional backend configuration. Set `BRUHS_BUILD_ENV=production` for manual Expo commands that should enforce the guard. URL validation does not verify deployment identity, Auth configuration or access rules; those require target-specific checks. Direct native builds and unmarked export/update paths remain outside this guarded build path.

## Brand assets

The palette is generated from `packages/ui/src/styles/index.css`; run `pnpm sync:brand` after changing shared tokens. All art is pixel art drawn as palette grids in `src/pixel/art.ts` and rendered as one SVG path per colour. The 16×16 bruh keeps the logo's face, with fruit colours and accessories for each outfit. Pixelify Sans and Silkscreen (both SIL OFL, licenses in `assets/fonts/`) are bundled locally. The Pixelify files are a modified version, renamed "Pixelify Sans Outside", and built by `scripts/patch-fonts.py` from the upstream variable font. The stock 5, 2 and S look nearly alike at small sizes and its fi/fl ligatures read as "A", so the script redraws the digits and % as 5×7 pixel numerals on Pixelify's grid and turns the ligatures off. It also redraws Silkscreen Bold's %, whose solid dots read as "Z", and renames that file "Silkscreen Outside". `scripts/render-icon.py` renders platform icon assets from the same logo geometry.
