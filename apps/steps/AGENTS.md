This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Ongoing product goal: keep polishing

Outside is a pixel-art step MMO in the spirit of RuneScape and WalkScape: steps are the only input, and they pay for travel and skilling. Every session should leave it a little more polished, alongside any feature work. Preserve the bruhs brand (fruit palette, the bruh mascot, pixel chrome) and the feeling that walking moves an adventure forward: the step pouch, loot reports, gear, chests, quests and the collection log.

- Treat spacing, typography, alignment, safe areas, readable states, touch targets and purposeful motion as product requirements. Keep the pixel look consistent: square corners, bevelled panels, `pixel/chrome.tsx` primitives, sprites from `pixel/art.ts`, and the Pixelify Sans / Silkscreen type scale in `theme/theme.ts`.
- Inspect the running app before choosing a polish change. Fix concrete issues and verify the result at compact phone (320), regular phone (390) and desktop preview sizes.
- Exercise the affected interaction, including empty, ready, active, full-bag, stopped, error, larger-text and reduced-motion states, and the loot report and sheets. Distinguish browser checks from native-device checks.
- Game numbers live in `src/game/content.ts` and rules in `src/game/game.ts`, which re-exports its split-out parts: `save.ts` (decoding saves), `missions.ts`, `guidance.ts` (next step, item sources, unlocks) and `dice.ts`. Import game code from `game.ts`; `apps/outside-site` relies on it. Keep `pnpm check` green, and add a test when a polish change touches game rules.
- Keep a short dated record of verified improvements and remaining issues in `docs/ui-ux-research.md`. Do not replace useful game behaviour with decoration or expand into unrelated features during a polish pass.

## UI copy

- Lowercase game voice, short and active: "banked 4 pandan logs.", "equipped straw hat.", not "Inventory banked" or "X has been equipped". Proper nouns keep their case (Apple Health, Health Connect, Steps as a Health data type).
- Write item counts with `itemCount(qty, key)` from `src/game/items.ts` so plurals stay right ("1 raw minnow", "98 raw minnows", "40 coal"). Never build `${qty} ${name}` by hand.
- Errors say what failed and how to fix it: "couldn't save your progress. free up space on this device, then retry."
- Buttons name the action and its target: "hand in quest", "walk to longan lake · fishing", not "ok" or "continue" where a verb fits.
- Explain a mechanic once, in body text, where it is used. Long sentences never go in the Silkscreen label style.
- Avoid "~", "−" and arrows inside numbers. The pixel fonts draw them poorly; write "about", "fewer" or "to".
- Use one term per concept:

| Concept | Term |
|---|---|
| carried items | bag (never inventory or backpack) |
| fewer steps per action | work speed |
| an action repeating for free | extra action chance |
| an action's loot doubling | double loot chance |
| eaten food's effect | food bonus (never buff) |
| unspent synced steps | pouch, or "waiting steps" |
| experience | xp (lowercase) |
| rare drops | rare find chance, chest chance |

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
