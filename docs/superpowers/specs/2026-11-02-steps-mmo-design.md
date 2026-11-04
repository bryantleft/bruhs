# Outside → a pixel step-MMO ("the fruitlands")

Date: 2026-11-02. Owner direction: "match RuneScape but for mobile and steps", "mmorpg-ish, all
pixelated with bruhs theme", "step count only matters for now", "plan and implement, feel free to
redo the entire app". Everything below that is not a quote is the builder's call.

## Intent

Walking is the only input. Opening the app after a walk should feel like logging back into an MMO:
your bruh kept working while you walked, and a loot report shows the logs, ore, fish, XP and level-ups
your steps paid for. Long-term goals come from RuneScape-style skills (1–99), gear tiers, a world map
and quests.

## Core loop

- Lifetime steps come from daily totals (Health sync on device, a +500 button in the web demo).
- `spent` tracks steps already consumed. `unspent = lifetime − spent` is the **step pouch**.
- The bruh is at one **location** and is either idle, doing one **activity**, or **travelling**.
- Every state change runs `advance()`: pouch steps pay for travel first, then for repeated actions of the
  current activity. Idle steps stay in the pouch (never lost).
- Each action costs N steps, grants skill XP, produces items (with seeded, deterministic RNG for rare
  drops and cooking burns), and may consume inputs. Missing inputs stop the activity with a reason.

## Skills (7, RuneScape XP curve, level 1–99)

Gathering: woodcutting, mining, fishing, foraging. Production: smithing (smelt bars, forge tools),
cooking (fish, with burn chance falling as level rises). Agility: 1 XP per 10 travelled steps and per
40 working steps; reduces travel cost up to ~30%.

Step cost per action = base × tool multiplier (bronze 1.0 / iron 0.9 / steel 0.8 / mithril 0.7) ×
level bonus (−0.5% per level above requirement, max −25%).

## World

8 locations on a pixel tile map, connected by step-cost roads (shortest path travel):
bruhbridge (town: forge, range, store), pandan woods, pebble hills, longan lake, durian dunes,
mangosteen marsh (quest-gated), dragonfruit peak (agility 40; was 25 before the 2026-11-03 balance pass), blueberry bay (range, store).

## Items, gear, coins

Logs, ores, bars, raw/cooked/burnt fish, fruits, 4 rare drops, 16 tools (4 metals × axe, pickaxe,
harpoon, shears), coins. Start with bronze tools equipped. Tools need a skill level to equip. Stores
(towns only) buy everything at item value and sell bronze/iron tools.

## Quests and dailies

5 RuneScape-style quests (requirements, item hand-ins, XP/coin/item rewards, quest points; one unlocks
the marsh). Daily step milestones (1k/5k/8k) stay as claimable daily tasks paying coins. Daily goal and
streak stay on the character screen.

## Cosmetics and social

The six bruh skins remain, unlocked by total level (7, 25, 50, 100, 150, 250). Private step-race parties and the GPS walk map
remain as secondary screens reached from the character screen (unchanged behaviour, restyled).

## Look

Pixel art everywhere: Pixelify Sans (body/headings) and Silkscreen (labels/numbers), both OFL,
square corners, bevelled stone/wood panels in longan browns, RS-gold headings with 1px black text
shadow, sprites drawn as run-length SVG rects with crisp edges. Bruh mascot redrawn as a 16×16 sprite.

## Navigation

Tabs: world (scene + current action + activities here), map, skills, bank (bank, tools, store),
quests. Character screen (outfit, stats, goal/week, health, party, gps walk, erase) from the HUD.

## Saves

Save v2 under a new storage key. A v1 save is migrated once: step history, goal and health connection
are kept; today's steps become the starting pouch; skills start fresh.

## Non-goals (for now)

Combat, trading, guilds, GPS-driven progress, server-side game state.

## Update 2026-11-03: WalkScape-style depth

Owner direction: "more interactive with a bunch of items and stats and inventory. inspired by walkscape".
Mechanics follow WalkScape's published action math (portal.walkscape.app/post/221): work efficiency
(steps = base ÷ (1 + WE), floored at half the base), 1.25% efficiency per level over the requirement
(capped at 25%), double action, double result, a 28-slot inventory with 25/10 stacks, and banks only in
some towns.

- Save v3 adds an inventory, ten gear slots, a food buff, a collection log and lifetime counters.
- An 8th skill, crafting, adds flax → linen, reeds → wicker, sewn gear and gold-and-gem jewellery, all
  quality-rolled. Smithing also forges armour.
- 84 items: 25 gear pieces with stats, 4 chests with loot tables, gems, fibres and cloth.
- A full bag stops work and keeps the steps; the world screen offers to bank or walk to the nearest bank.
- Quest hand-ins happen at the giver's location.
- UI: the activity sheet (stats, inputs, drop odds, quality odds), the item sheet (equip, eat, open, bank,
  withdraw, sell, drop), the bag tab (inventory grid, treasury, paper-doll gear, toolbelt, stat totals,
  bank, store), and a collection log on the character screen.

Non-goals are unchanged: combat, trading, guilds, server-side game state.

## 2026-11-03 update: late game, missions and coin sinks

- **Tiers 70 and 85** for every gathering skill:
  - Woodcutting: moonwood, then starwood.
  - Mining: moonstone, then sunstone.
  - Fishing: moonray, then sunfish.
  - Foraging: persimmon, then lychee, plus silkweed at 60.
  - Smithing gains moonsteel (70) and sunsteel (85) bars. Their tools are wielded at 60 and 80, with +55% and +70% efficiency.
  - Crafting spins moonsilk at 60. Its late gear runs to the sun amulet at 92, and recipes past 50 pay extra xp.
- **Places:**
  - The moonlit grove is always night and opens with the moonlit path quest.
  - Starfall crater sits on an island south of the peak, with a forge and a range. It opens with the fallen star quest.
  - Dragonfruit peak now needs agility 40.
- **Quests:** 20 in all, in a chain from day one to the legend of the fruitlands (every skill 80), which gives the legend cape. Sunforged gives the bruh crown. Rewards are tuned with `pnpm balance` to about 2.5–8.5× the steps the hand-in costs.
- **Missions** replace the daily step tasks:
  - Each of daily, weekly and monthly brings a walk scaled to the player's goal (×1, ×5, ×20), plus two pool draws.
  - Draws are seeded by period and save, and fixed for the period.
  - Counters snapshot when the period opens.
  - Rewards: about 1,150 coins a day on average; the weekly walk adds a bird nest and the monthly walk an adventurer's chest.
- **Coin sinks:**
  - Six backpack upgrades (+2 slots each, 101,000 coins in total).
  - Steel and mithril tools in the store, at six times their value.
- **Not done:** late-game outfits. Outfit ids are validated by the hosted Convex API (`apps/api/convex/validators.ts`), so new outfits need a schema change and a deploy first.
