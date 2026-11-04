# A walking adventure for bruhs / outside

## Research and direction

The aim is a small, companion-led walking game. The map, character movement, and reward cadence are our design inference from the guidance below; they have not been validated by a retention experiment.

- [Apple: game controls](https://developer.apple.com/design/human-interface-guidelines/game-controls) emphasizes comfortable reach, safe areas, clear feedback, and controls sized for touch. The primary action sits above bottom navigation when space allows and remains reachable in the main scroll content on constrained layouts.
- [Android: accessible app views](https://developer.android.com/guide/topics/ui/accessibility/views/apps-views) recommends at least 48dp touch targets. This app uses 48 logical pixels for small controls and 56 for its main action; physical-device testing is still needed.
- [Xbox Accessibility Guideline 109: object clarity](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/109) supports a clear current objective and visible progress. The play screen names the next stop and shows the exact remaining steps. Daily trail progress and lifetime level XP have separate labels.
- [Xbox Accessibility Guideline 103: additional cues](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/103) recommends multiple ways to communicate meaningful game information. Quest states use text, icons, progress bars, and action labels. Native success haptics supplement the visible reward.
- [Duolingo: the redesigned home screen](https://blog.duolingo.com/new-duolingo-home-screen-design/) describes a guided path and a dedicated quest destination. This is a design precedent for making the next action legible, not proof that a path improves this app’s engagement.
- [Expo SDK 58: haptics](https://docs.expo.dev/versions/v58.0.0/sdk/haptics/) supplies native success feedback. Android uses its confirmation haptic; iOS uses a success notification. The reward remains understandable if haptics are unavailable.

## Design decisions

| Before | After | Why |
| --- | --- | --- |
| Oversized greeting and static companion | Compact player HUD and a small illustrated overworld | Put the character and the current adventure first. |
| Steps presented mainly as a dashboard metric | Steps move the bruh between four destinations | Give walking a visible consequence. |
| Quests below the main action, easy to miss | Quest log tab and a ready-reward shortcut on the play screen | Make rewards discoverable without crowding the map. |
| Small inline XP claim | A clear collect action followed by a reward moment | Connect the action, earned XP, and level progression. |
| Level feedback tied to the browser demo | Reducer derives feedback from any valid step or claim update | Imported health steps can celebrate too. |
| Inconsistent gaps and small collection captions | Shared spacing tokens and short inventory states | Improve rhythm and scanning at compact widths. |

## Spacing and interaction contract

- Page margins: 20. Within a group: 8 or 12. Card padding: 12 or 16. Between major sections: 24. All dimensions are React Native logical pixels.
- Primary actions: minimum height 56. Small buttons and goal controls: minimum 48. Bottom navigation: minimum 80 plus the device’s bottom inset; full labels can use additional height or rows.
- Main text: 14–16. Labels: 12 with an 18 line height. Headings use the existing Monaspace brand fonts.
- The play screen has one action area. It stays docked when there is room and joins the main scroll content when docking would crowd the adventure. Content cannot sit underneath it or navigation.
- Screens apply top and side safe-area insets. The standalone health screen also includes the bottom inset, keeping its sync action above the home indicator or system navigation. Tab screens use their navigation bar's bottom inset.
- Reward content is bounded to the available safe area and scrolls on smaller screens; the 48px close control remains fixed.
- Short transitions default to 250ms ease-out and animate opacity or transforms. Reduced motion removes animated travel and scaling. There are no looping decorative animations.
- Ready, in-progress, and collected quests are distinguishable without color. Locked companions expose their required level.

## Continuous polish

Keep inspecting, fixing, and verifying the existing experience alongside feature work. This is an ongoing product goal, recorded in `AGENTS.md`; a pass should improve a demonstrated issue while preserving the companion-led game and shared brand tokens.

The first ongoing polish pass improved five interactions:

- Reward dialogs expose their visible title as an accessible name.
- Closing a claimed reward returns browser keyboard focus to its collected state, then the next available action.
- Daily-goal radios have one tab stop, arrow cycling, Home/End, Space/Enter activation, and visible focus. Touch selection and saved goals are preserved.
- The health card uses neutral connection copy in demo, idle, and paused states.
- Reward navigation carries an explicit focus-restoration intent. Inactive web screens are inert during transitions, so both quest-earned and walk-earned unlocks lead into the visible collection rather than a hidden screen.

Verification covered all five routes at 320×568, 390×844, and 1280×800; reward dismissal by Escape, close, and primary action; both companion-unlock paths; keyboard goal selection and reload persistence; and return navigation from health. There was no normal horizontal overflow, controls remained at least 48px, and the final browser session had no console errors or warnings. Biome, TypeScript, all 29 tests, and iOS/Android/web JavaScript exports passed.

Native Dynamic Type, native screen readers, and physical-device feedback remain separate checks. Browser stress tests do not establish native behavior.

The next pass improves the handoff from earning a milestone to meeting a companion:

- A level-up keeps the quest name or completed daily trail in the same celebration. A larger import names every newly unlocked companion. The XP shown is the actual gain from that action.
- The unlock action reveals the new companion in its original collection position. The card scrolls fully into view where it fits; taller cards retain reachable content. A transient `NEW` marker identifies it, and web keyboard focus follows it. Equipping remains a separate choice.
- Reveal links are checked against the earned level. The one-time parameter is removed after use, and leaving the collection clears the marker so ordinary tab visits do not repeat the jump.
- Regression coverage checks simultaneous milestones, all companions unlocked by a large import, and historical health backfill that earns levels without completing today's trail. Repeated imports and claims do not award XP twice.

This pass was verified at 320×568, 390×844, and 1280×800. Both walk-earned and quest-earned unlocks retain their milestone details. The revealed card is fully visible, focused on the web, and not automatically equipped. Checks also covered an already-mounted collection, resizing while it was inactive, explicit equip and reload persistence, leaving and returning without a repeated reveal, and valid, unknown, locked, empty, and repeated query parameters after storage hydration. Ordinary quest dismissal still returns focus to the collected quest.

At 150% temporary browser text size, compact reward content scrolls to the full action while its fixed close control stays reachable; there was no horizontal overflow. Actual browser reduced-motion emulation removes reward travel and scaling and makes the reveal scroll immediate. Final fresh browser flows recorded no page errors, console warnings/errors, or failed requests. Biome, TypeScript, all 32 tests, and iOS/Android/web JavaScript exports passed.

The multi-companion health-import payload is covered by reducer tests. The supported browser demo cannot perform a native health batch, so that modal path and native scroll, screen-reader, text-size, and haptic behavior still need device verification.

The interaction-state pass addresses four demonstrated gaps:

| Before | After | Why |
| --- | --- | --- |
| Cancelling reset removes the focused control; confirmation stays armed across tab visits. | Shared confirmation actions return web focus to the original button and clear confirmation on route blur. | Cancellation and returning to a screen leave a clear starting point. |
| Selecting the current companion or goal repeats feedback and writes unchanged progress. | Existing choices are no-ops; real changes still save and keep their feedback. | An unchanged choice should not create another event. |
| Persistent notices cover the HUD and its focused profile control. | A single notice uses space above the active scroll area. Routine messages expire after a reading window and pause on hover or backgrounding. | Feedback stays readable without covering controls. |
| A save failure offers no direct retry. | Save errors keep priority until dismissed or a write succeeds. Retry queues the current game snapshot without changing progress. | Storage recovery is possible without earning more steps or changing a choice. |

When a notice resizes the web scroll area, the focused control stays visible with an 8px inset. Error actions keep focus on stable, visibly outlined content through dismissal or retry. Android uses its [recommended accessibility timeout](https://reactnative.dev/docs/accessibilityinfo#getrecommendedtimeoutmillis); iOS receives [queued accessibility announcements](https://reactnative.dev/docs/accessibilityinfo#announceforaccessibilitywithoptions). Those native paths still require device checks.

Browser verification covered compact and regular phones, with representative desktop notice/HUD/focus checks at 1280×800. Selected-choice pointer and Enter actions produced zero writes; real goal and companion changes each saved once. Status timing and hover pause passed. Injected storage failures stayed concise and persistent, while Retry saved the exact current snapshot and preserved it after reload. Retry, Close, reset cancellation, reward dismissal, and companion reveals kept visible focus. At 150% browser text size, notice actions remained reachable with no horizontal overflow. The final normal browser scope had no console warnings or errors; deliberate failure warnings were recorded separately. Biome, TypeScript, all 35 tests, independent source review, and iOS/Android/web JavaScript exports passed.

The first-day and larger-text pass fixes three data and layout issues:

| Before | After | Why |
| --- | --- | --- |
| Missing dates appear as zero steps and count toward a seven-day goal denominator. | Missing dates say “no entry”; a saved zero stays zero. Goal summaries count the saved days and use each day's original goal. | Unknown history should not imply missed goals. |
| Seven narrow chart columns make larger step labels collide. | Compact horizontal day rows show exact step totals, dates, and completion checkmarks. Labels wrap when needed. | Every day's result stays readable without relying on color or rounded totals. |
| Four goal choices overflow on a compact screen with larger text. | Goal cards wrap into roomy rows, sharing the same intrinsic number width so their column edges align. Larger content can use a full row. | Keep full values, comfortable touch targets, and consistent spacing as text grows. |

The history calculation preserves missing entries without creating synthetic game days or changing saved progress, XP, or rewards. Its regression tests cover recorded zeroes, sparse history, historical goals, calendar boundaries, and exact full-week totals. The chart's accessible description includes full dates, exact values, each recorded day's goal, and explicit missing entries. Native screen-reader behavior still needs device verification.

Browser checks covered fresh, sparse, and dense weeks at 320×568, 390×844, and 1280×800 with normal and 150% temporary text size and line height. Dates and exact values stayed separate and contained. Final goal cards share equal widths and aligned column edges at all three sizes, including the text used to establish their intrinsic width. Keyboard radio navigation still has one tab stop; real changes save once, unchanged selections save nothing, and reload preserves the goal without changing historical goals or other progress. At 200% and 300%, compact goal cards use a single column. The week also keeps full values inside its rows at 300%, wrapping the unit when needed. Biome, TypeScript, all 38 tests, independent source review, and iOS/Android/web JavaScript exports passed.

The final normal browser reload restored the original demo JSON, removed all test patches, and recorded no console warnings or errors. The document and all seven same-origin app/font resources returned HTTP 200.

This pass also identified navigation clipping under a blanket 300% text override. The following navigation pass addresses that finding; browser text overrides do not establish native Dynamic Type behavior.

The navigation and constrained-height pass improves how the game uses available space:

| Before | After | Why |
| --- | --- | --- |
| Fixed-height navigation clips or truncates larger labels. | The bar measures full labels and chooses four, two, or one column, reporting its actual height to the navigator. | Preserve the complete names and comfortable touch targets. |
| At compact 300% text, the docked action leaves an 11px adventure viewport. | The action joins the main scroll content when docking would leave less than 192px. The viewport becomes 359px, with the full action reachable. | Keep the adventure usable alongside its action. |
| A 480px frame cap wastes width in short landscape layouts. | Non-desktop landscape uses the available width. At 568×320 with 300% text, four tabs fit in one row and the full action fits a 205px scroll viewport. | Use horizontal room to preserve vertical room. |
| Web tab relationships can point at unmounted panels. | Web panels preload, inactive screens stay inert, and tabs name their actual panels. Native screens retain lazy loading. | Keep navigation and its content connected for assistive technology. |

The web bar has one Tab stop, Left/Right cycling, Home/End, Space activation, and native link handling for Enter and modified clicks. A visible underline supplements the selected color. Footer reflow preserves web focus on the moved action and does not write game progress. Screens and navigation apply side safe-area padding independently through [Expo's safe-area API](https://docs.expo.dev/versions/v58.0.0/sdk/safe-area-context/); native rotation, insets, and screen-reader behavior still need device checks.

Browser verification covered navigation at 320×568 and 390×844 with normal, 150%, 200%, and 300% temporary text size, plus normal and 300% comparisons at 1280×800 and 568×320 landscape. Full tab labels stayed inside their touch targets. The focused walk action remained visible through text-size changes and footer reflow; those layout changes produced zero progress writes. One Enter activation added exactly 500 demo steps and saved once. A fresh web load exposed all four correctly named panel relationships while keeping inactive screens inert. A walk-earned unlock still revealed and focused the full new companion card when the collection had never been visited. Biome, TypeScript, all 38 tests, independent source review, and iOS/Android/web JavaScript exports passed.

Real modified-click navigation opened Quests in a separate tab without changing the original route. Health Back returned to Camp when opened there and fell back to Play on a direct visit. Actual browser reduced-motion emulation made the companion reveal scroll immediate while preserving its focus and one-time query handling.

The final clean browser reload restored the original demo JSON byte-for-byte and removed all QA overrides. It recorded no new console warnings or errors; the document and all ten same-origin app/font resources returned HTTP 200.

The navigation pass identified a separate map-header clipping issue at 300% text. The following pass addresses that finding; the navigation checks alone did not establish whole-interface support at that size.

The map-copy and XP-feedback pass fixes three demonstrated issues:

| Before | After | Why |
| --- | --- | --- |
| At compact 300% text, the map header clips 56px of copy and the stop count clips 13px. | Both caption rows wrap within the card, and each text group is bounded to the available width. | Keep the world name, trail label, location, and stop count readable. |
| The HUD's remaining-XP text extends 23px outside its assigned row. | Level and XP labels wrap into separate lines when they need more room. | Keep full values inside their own space without reducing type size. |
| The floating XP pulse covers part of the level number at larger text. | Earned XP briefly replaces the visual XP-to-go label inside the same slot. Its 150ms opacity entrance has no upward travel. | Preserve the feedback without obscuring the level or moving the map. |

The normal XP text continues sizing its slot during the pulse and keeps the current value available to assistive technology. The duplicate visual gain is noninteractive and excluded from the accessibility tree. The existing 750ms gain lifetime is unchanged. Reduced motion displays the gain immediately. Map caption height stays in normal flow, while the artwork retains its 3:2 aspect ratio and the traveler retains its own 80px target.

Browser caption and HUD checks covered 320×568 and 390×844 at normal, 150%, and 300% text, plus 1280×800 and 568×320 landscape at normal and 300%. All checked non-whitespace glyphs stayed inside their assigned containers without paired-label collisions. Scaling and resizing produced zero game saves. Daily-step labels and adjacent objective copy were already contained and required no changes.

Valid zero-step, halfway, and complete fixtures showed 0/4, 2/4, and 4/4 stops with corresponding progress and traveler positions. Each fixture restored the original saved JSON afterward.

An actual walk at 390×844 with 300% text recorded the complete gain pulse inside its XP slot, with no intersection with level text or the progress bar. HUD, map, progress, and slot geometry changed by zero pixels through appearance and dismissal; the updated XP-to-go text returned afterward. The action added exactly 500 demo steps, earned 50 XP, and saved once. Biome, TypeScript, all 38 tests, independent source review, and iOS/Android/web JavaScript exports passed.

Real keyboard navigation through the avatar and traveler still reached Camp and Bruhs with visible focus and no focus retained in hidden content. Actual reduced-motion browser emulation showed an immediate traveler update and full gain opacity on every sampled frame, with no gain transform.

The original demo JSON was restored byte-for-byte and all QA patches were removed. A final fresh load recorded no console warnings or errors, page errors, or failed requests; its document and ten app/font resources returned HTTP 200.

These checks establish the affected browser layouts and interactions. Native text scaling, screen readers, and safe-area behavior still require device verification.

The accessible-progress and graphic-grouping pass improves how the existing game describes its state:

| Before | After | Why |
| --- | --- | --- |
| Determinate bars have names but expose no current numeric value in the browser. | Standalone bars expose a bounded 0–100 value through shared ARIA aliases and explicitly enable native accessibility discovery. | Make progress available alongside its name. |
| A quest at 999 of 1,000 steps reports 100% beside “1 to go.” | Incomplete progress stays at most 99%; 100% requires reaching the target. | Keep percentage feedback consistent with completion. |
| The streak is a named generic container plus a separate numeric descendant. | A named composite image describes the daily-goal streak, with singular/plural day wording and no duplicate visual numeral in the tree. | Give the badge one clear meaning. |
| The weekly image has a complete dated label and 14 extra date/value text descendants. | Its label retains all dates, exact steps, historical goals, and reached states; visual rows are excluded from accessibility. | Preserve the summary without exposing the same rows twice. |
| Keyboard focus brings Camp's walk button exactly to the scroll edge, clipping its outer ring. | Web focus and layout changes both keep the focused control inside the existing 8px scroll inset. | Keep the complete focus indicator visible above navigation. |

The daily trail bar is decorative inside its goal button. That button already names the exact steps, goal, and change-goal action; standalone HUD and quest bars keep their accessible values. No controls or layout dimensions were added. Collection cards already convey equipped state through their names and locked state through disabled properties, so they required no changes.

The range aliases and explicit native grouping follow [React Native's accessibility API](https://reactnative.dev/docs/accessibility). The installed SDK maps those aliases into native values and forwards them on the web. Browser checks inspect actual Chromium accessibility-tree nodes and rendered attributes; they do not establish VoiceOver or TalkBack speech. The original streak label was present in Chromium, so this pass addresses its grouping and duplicate tree exposure rather than claiming a lost label.

Chromium checks across all four tabs found one active panel, named controls, one streak image with no exposed numeric descendants, and a weekly image retaining its full summary without the 14 visual text descendants. Valid zero, partial, and completed fixtures exposed bounded values and “0 days,” “1 day,” and “4 days” streak names. At 999 steps the first quest exposes 99% and stays unavailable to claim; at 1,000 it becomes collectable. The daily bar's DOM value changes from 99 at 7,999 steps to 100 at 8,000, while its enclosing button remains the accessible action.

A real walk added 500 steps and 50 XP with one save; a quest claim added its 50 XP with one further save and left steps unchanged. Reward dismissal returned visible focus to the collected quest. Biome, TypeScript, all 38 tests, independent source review, and iOS/Android/web JavaScript exports passed.

Visual checks at 320×568, 390×844, and 1280×800, plus compact 150% text, kept the visible weekly rows and HUD contained. Reselecting the current goal or companion produced no saves or notices. Camp's focused walk button now has its complete outer ring inside the scroll viewport; normal and compact 150% samples settled without a scroll loop or any game write.

The final focus checks preserved Play's Tab order, Health return navigation, reset cancellation, reward dismissal, and the full focused companion reveal. The reveal consumed its query and left equipment unchanged. Focus-flow recording found no console or page errors. Original JSON and all temporary browser methods and font overrides were restored.

The tap, keyboard, and quest completion pass fixes missed presses and gives daily quests a clear finish:

| Before | After | Why |
| --- | --- | --- |
| Focusing Camp's walk button during a lower-edge pointer press scrolls it upward before release, cancelling the action. | The focus callback only scrolls for visible focus outside an active press; layout correction remains. | Keep the pressed target under the pointer while preserving the keyboard inset. |
| After a pointer press, Space can reveal a keyboard ring on the same focused button without another focus event. | Keyboard activation and goal navigation restore the existing inset without changing focus or preventing default. | Keep the ring visible when switching input methods. |
| Alt+Left on a daily-goal radio selects and saves the previous goal. | Modified Alt, Ctrl, and Meta shortcuts return before the radio handler changes state or prevents default. | Keep browser and operating-system shortcuts separate from ordinary goal selection. |
| Play's completed quest shortcut has a generic accessible name. | Its name includes “All daily quests complete” and the quest-log action. | Make the earned state available with the action. |
| The fully collected quest log keeps its instructional footer and generic daily summary. | A green completion count, “fresh quests tomorrow,” and a short message confirm the finish and explain that extra steps still earn XP. | Give the daily run a clear stopping point without changing rewards. |

Before the fix, real browser mouse presses reproduced the missed action at both 390×844 and 320×568. Camp's fully visible walk button moved upward by 8px between pointerdown and pointerup; the release landed on its surrounding container and recorded no walk or save. Center clicks still worked. A separate fast right-edge click did not reproduce a pressed-scale issue, so press feedback was preserved.

The focus check follows [Selectors Level 4's visible-focus and active-press semantics](https://drafts.csswg.org/selectors/#the-focus-visible-pseudo). Keyboard correction runs during capture for enabled button activation and the goal radio's handled keys. Other keys and content keep their browser scrolling behavior. Both callbacks run on the web; explicit companion reveals, layout correction, and game rules are preserved. Biome, TypeScript, all 38 tests, independent source review, and iOS/Android/web JavaScript exports passed.

After the fix, normal 320px and 390px edge and center clicks keep the walk button stationary and add exactly 500 steps and 50 XP with one save. Switching from pointer to Space and Enter on the same focused button restores the full ring; each key activates once, and Tab adds no save. Compact 320×568 at 150% text also passes this sequence. PageDown and arrow scrolling can pass a focused walk button or collected quest without pulling the page back.

Alt, Ctrl, and Meta shortcuts leave the goal unchanged and do not prevent default. Ordinary goal keys save once per change; selected choices and selected Home/End actions add no writes. Keyboard navigation keeps complete rings at regular and compact phone sizes, compact 150% text, and the checked desktop layout. Goal and companion changes persist after reload; reset cancellation, reward dismissal, and the full companion reveal retain visible focus. The reveal consumes its query and preserves the equipped bruh.

Fresh, partial, and completed quest states pass at 320×568, 390×844, and 1280×800, plus compact 150% text, with no text overflow or layout writes. Recorded reward and reveal interactions had no runtime warnings or errors. The final T3 reload returned HTTP 200 for its document and ten resources; startup console history was not independently captured. Original JSON was restored exactly, and all temporary browser methods, listeners, and font overrides were removed. These checks use browser mouse and keyboard input; native touch and accessibility still need device verification.

The compact text pass preserves labels, totals, and icons when text grows:

| Before | After | Why |
| --- | --- | --- |
| At 320×568 with 300% browser text, Health's “along.” title clips on both sides; its navigation title also pushes the opposite spacer outside the row. | The hero is bounded by its container, and the centered navigation title can shrink between two fixed 48px sides. Shorter “Health sync” and “walk on. game on.” copy avoids fragmented words. | Keep the full title and balanced Back layout. |
| Camp's section headings and the quest/collection summary labels extend beyond their containers. | Paired labels wrap into additional rows, and each text box stays within its parent. Camp's shorter “a demo walk” heading keeps whole words at compact 300% text. | Keep every heading, ready count, and unlock level readable. |
| The weekly “60,290” headline clips at compact 300% text. | A measured compact headline appears only when the full numeral needs more width; the exact “60,290 steps” remains below it. | Preserve the exact count while keeping the headline readable. |
| Walk and claim icons shrink to roughly 9–14px wide at larger text sizes. | Shared icons retain their 20×20 grid; adjacent button labels can wrap, with vertical padding on claim buttons. | Preserve recognizable icons and breathing room around multiline actions. |
| After a claim at compact 300% text, “reward collected” crosses its focus outline. Shrinking alone leaves the final letter on a line by itself. | The collected row reflows when needed, giving the label the full width and preserving both words inside its complete focus ring. | Keep earned feedback readable and keyboard focus clear. |

The weekly measurement keeps the original full numeral independent of the displayed mode, avoiding a compact/full feedback loop. Its measuring copy is hidden from accessibility; in compact mode the exact visible caption supplies the total without exposing an approximate duplicate. These are local layout rules: [React Native's flex defaults](https://reactnative.dev/docs/flexbox) differ from the browser, so browser containment alone does not establish native rendering.

Browser checks cover 320×568, 390×844, and 1280×800 at normal, 150%, and 300% text, including hidden measurement text. The initial 36-case matrix and affected rechecks contain the targeted text and preserve 20×20 icons. Final Health headings keep whole words on both phone sizes; completed quest and collection summaries fit. Zero, sparse, and 1,234,567-step weekly fixtures pass 12 scoped cases. Five 60-frame resize samples settle into a stable display mode with no saves.

At compact 300% text, a demo Walk button interaction adds 500 steps and 50 XP with one save; the week updates from 60,290 to 60,790 with the exact count visible beneath “~61K.” A claim saves once, and Escape returns to the collected group with whole words and a complete ring. Equip saves once; reselecting it saves nothing. Walk and equipment persist after reload, and Health Back returns to Camp without a write. Recorded Walk and claim scopes have no runtime warnings or errors; startup console history was not independently captured. The final clean reload returned HTTP 200 for its document and ten resources. Exact original JSON, storage methods, and browser font settings were restored. Biome, TypeScript, all 38 tests, independent source review, and iOS/Android/web JavaScript exports pass. Native touch, Dynamic Type, and screen-reader checks remain pending on devices.

The reward card pass keeps earned moments readable and preserves the player's place:

| Before | After | Why |
| --- | --- | --- |
| At compact 300% text, the reward heading expands beyond the card and the real +200 award clips on both sides. | Heading, description, and award stay bounded. Compact awards use 32px display type, with full user text scaling; 4/4 stays together. | Keep the completed task and exact reward visible. |
| Scrolled text passes beneath the floating Close button, whose outer focus ring also clips. | A separate fixed header reserves space for Close, with a 48px target and 8px padding. | Keep dismissal available without covering the reward. |
| Tab brings the action button flush to the scroll edge, cutting its focus ring. | Reward scrolling shares the existing 8px keyboard-focus inset and pointer/key guards with Screen. | Preserve full rings, stationary pointer targets, and ordinary scrolling. |
| Pointer dismissal restores a collected quest only 1px below the scroll edge, clipping its custom outline. | After focus returns, the collected group receives the same 8px inset. Close and the reward CTA both return a full ring, including when browser focus-visible is false. | Keep collected feedback visible after either input method. |
| Changing text size while a trail reward is open remounts Walk. Escape leaves focus on the document body. | Footer placement waits while the reward owns focus, then resumes after modal cleanup and restores the current footer control. | Return the player to the live action after a layout change. |
| Long category, title, and action words fragment at large sizes. | Shorter reward copy keeps whole words and names the exact completed step target; full quest names also label the visible heading for native accessibility. | Preserve meaning and keep the game's tone. |

Forty browser layout cases cover quest, trail, level, and companion-plus-trail rewards: 320×568, 390×844, and 1280×800 at normal, 150%, and 300% text, plus 568×320 at 300%. Targeted text stays within its container and keeps whole words. Real scrolling leaves Close unobstructed; keyboard actions retain their complete rings. Settled normal-phone screenshots show full opacity and the final card position.

All four text-resize dismissal cases pass: 150%→300% and 300%→150%, each with Escape and Close. Walk stays mounted while the reward is open, and dismissal restores the current live action after footer placement resumes. The companion CTA also reaches and focuses the full NEW card after deferred reflow, consumes the reveal query, and keeps the player's equipped bruh. A real quest-triggered level-up retains its named quest, exact +125 award, and 5,000-step milestone at compact 300% text. Demo Walk button interaction, keyboard activation, and goal selection checks preserve single awards and writes; selecting the current goal writes nothing, and modified arrow keys remain available to the browser.

Recorded affected flows have no runtime warnings, errors, unhandled rejections, or resource failures. The final clean reload returned HTTP 200 for its document and ten resources. Exact original JSON, storage methods, and browser font settings were restored, with Play at 390×844. Startup console history was not independently captured.

Biome, TypeScript, all 38 tests, independent source review, and iOS/Android/web JavaScript exports pass. Reduced-motion source now skips redundant timing. The browser used for the reward card pass exposed no reduced-motion emulation; its revised rendering remains unverified. Multiple simultaneous companion unlocks have unit and source coverage, without a supported browser action to exercise their reward UI. An additional source finding was carried into the reading-continuity pass below: foreground health sync can replace an already-open reward. Native touch, Dynamic Type, VoiceOver/TalkBack, and haptic checks still require devices.

The reading-continuity pass keeps quest text intact and restarts updated rewards where they can be read:

| Before | After | Why |
| --- | --- | --- |
| “professional wanderer” fragments at 300% text, and compact “quest” splits in the page title. | “trail legend” and “the loot log.” keep whole words with the existing typography and full user scaling. | Preserve the game's voice and readable quest identity. |
| The armed demo reset is 356px tall in a 359px viewport, cutting its bottom focus ring. | “yes, reset demo” is 224px tall; the full action and outline fit. | Keep confirmation visible before the player acts. |
| Camp's long privacy wording fragments at 300%. | Shorter account/location copy stays whole across the checked sizes. | Keep the same explanation readable. |
| Replacing an open reward retains an old scroll offset and focus on the relabeled action; the new heading is above the viewport. | Committed reward identity changes reset scroll and request title focus while retaining the Modal and original opener. | Present the new milestone in context. |
| A press started on “keep going” can release on the same button's new companion callback. | The action is keyed by reward identity, canceling the old pending press when its button unmounts. | Keep an old gesture from choosing a new reward's action. |

Seven actual-app layout cases cover 320×568 at normal/150%/300%, plus 390×844 and 1280×800 at normal/300%. Quest ready, collected, and incomplete states retain whole words. Keyboard and pointer Cancel return safely; route blur clears confirmation. The renamed quest preserves its existing wander ID, 8,000-step target, exact 200 XP, single save, and collected state after reload. No reset was accepted. Final ordinary reward, text-reflow dismissal, and companion-reveal checks pass; first opening retains its normal entrance, and reveal keeps the equipped bruh without extra writes.

An isolated component harness uses the actual RewardOverlay, UI, MotionProvider, reducer, RNW components, and fonts with a controlled game context and router observation. It reproduces in-place replacement without claiming an app or native health event. At controlled compact 300% text, the same Modal now brings the full new heading into view; duplicate and ordinary same-identity updates preserve reading position. The 8,000→17,000-step fixture earns 900 new XP, 1,700 total, and keeps equipment. A trusted-click probe with a controlled commit during mousedown cancels the old action with zero dismissal/navigation. The forced browser sequence leaves focus on BODY after release: stale activation is prevented, but focus continuity does not pass in this probe. Behavior during native foreground-health updates remains unverified. Ordinary in-place replacement separately passes heading focus.

Native code requests title focus through the installed RN0.88 host-ref API, [sendAccessibilityEvent](https://reactnative.dev/docs/next/accessibilityinfo#sendaccessibilityevent); this is source and bundle evidence, not a VoiceOver/TalkBack result. Device access is disabled in this environment. Reduced-motion rendering and native health-triggered replacement still need device verification. Biome, TypeScript, all 38 tests, and iOS/Android/web JavaScript exports pass. Actual-app scoped runtime recorders are clean; startup console history was not independently captured. Exact original progress, browser fonts, and storage methods were restored.

The collection and Camp pass gives larger text enough room to reflow:

| Before | After | Why |
| --- | --- | --- |
| At compact 300% text, two 134px cards fragment companion names and footer words. "original" also fragments on the wider previews. | Cards use the measured widest name word to choose one or two equal columns. All checked names and footers retain whole words; normal and 150% collection layouts keep two columns. | Preserve each bruh's identity and readable equipment state. |
| The real NEW badge extends 12.92px beyond its compact card, touching the card number. | Headers grow with their text and allow wrapping with an 8px gap. | Keep earned status inside the card and clear of the portrait. |
| Camp reserves only 164px beside its art at compact 300%, splitting "level" across lines. | The profile stacks when the full heading needs more width. Copy receives the full 280px; profile height falls from 815px to 613px with whole words. | Give the player's level and companion room to read. |
| Reveal uses cached vertical positions without checking the displayed column width. | Reveal waits for positive text/grid measurements and a card width matching the current columns. | Avoid consuming a reveal while its retained panel is hidden or its columns are changing. |

The hidden name probe uses the same monospaced type, independent of column count. Camp measures its full heading, intentionally stacking at compact 150%. Probes are marked hidden from accessibility and ignore pointer input; user text scaling remains enabled.

Sixteen actual-app layout cases cover collection and Camp at 320×568 and 390×844 with normal/150%/300% browser text, plus 1280×800 at normal/300%. All six cards contain their glyphs and retain whole words. Portrait sizes stay unchanged. Layout checks make no saves. Pointer and keyboard equip each save once; reselect and locked-card taps save nothing. Equipment persists after reload, and normal-phone keyboard focus retains a full ring distinct from the equipped border.

Four demo Walk button presses earn Night at compact 300%, with one save each. The CTA focuses the newly revealed card, consumes its query, and keeps grass bruh equipped. Reflow through 300%/150%/normal/300% preserves the same focused card without extra saves or reveal replay. The 489px card still needs scrolling in its 359px viewport; its footer remains reachable, and Space equips Night once.

Normal-phone earned reveal keeps the full card visible. Unknown and locked reveal queries are consumed safely; an all-unlocked fixture preserves the last equipped card and whole footer words. Scoped runtime recorders are clean; startup console history was not independently captured. The final document and ten resources returned HTTP 200. Exact original JSON, browser fonts, and storage methods were restored, with Play at 390×844.

Biome, TypeScript, all 38 tests, independent source review, and iOS/Android/web JavaScript exports pass. Browser font/line-height stress does not establish native Dynamic Type rendering. The browser used for this pass provides no reduced-motion emulation. Native touch, screen-reader, and health-update timing checks remain pending because device access is disabled. A source-only follow-up remains: preceding content moving without a layout-size event could leave reveal at a stale vertical position. No such failure was reproduced in this pass.

## Collection recovery and real-world walks

The collection action pass resolves the reproduced notice and reveal failures:

| Before | After | Why |
| --- | --- | --- |
| Compact 300% "choose bruh ↗" leaves an arrow-only line. | "equip" and "equipped" keep whole action words. | Describe the in-place action and saved choice. |
| A large-text notice leaves almost no game viewport. Landscape Retry and its ring extend below an 82 px notice. | Notices scroll within a preferred 40% cap. The measured Retry height sets a 102 px minimum at landscape 300%; its full ring fits and 87 px of game content remains. | Keep recovery reachable and preserve game context. |
| Independent status scroll keys fail despite receiving trusted input. | Six focused-root keys scroll immediately using measured line/page distances. | Keep long feedback readable by keyboard. |
| Night's earned reveal settles 54 px below its intended inset. | Current card/viewport geometry places Night at 16 px after the width guard. | Avoid stale positions after preceding content moves. |

A fresh browser regression verifies all six keys independently, child Enter activation, latest-snapshot Retry recovery, and the full landscape ring. Alt/Ctrl/Meta remain unprevented; Alt+arrows can still invoke browser scrolling. Four real demo Walks add 2,000 steps and 200 XP, unlock Night, focus its NEW card at the settled 16 px inset, consume the query, and preserve Pandan. Returning through navigation does not replay the reveal. The [earlier measurements](../../../../.playwright-mcp/collection-action-after.json) record the failures. The [corrected measurements](../.playwright-mcp/notice-regression-r4.json) record the independent keys, settled reveal, and Retry recovery.

The first real-map mode adds an optional GPS walk from Play:

| Before | After | Why |
| --- | --- | --- |
| The walking world is an illustration driven by daily steps. | Explore draws a real GPS route with the equipped bruh and 250/500/1,000 m stamps. | Add a location-based game loop while Health steps keep their XP rules. |
| Expo's web watcher drops errors and can clear the wrong browser watch ID. | A browser adapter requests high accuracy, reports permission/signal errors, and clears the exact returned ID. | Make denial and cancellation reliable. |
| Recenter can resend identical native camera props; a new walk can retain old centering state. | Imperative recentering tracks both the walk identity and the recenter action. | Keep manual panning and make each new walk's first fix visible. |
| "Erase saved journey" leaves GPS data and its watcher behind. | Reset stops Health and GPS, drains queued route writes, deletes the route, then resets game progress. Failed deletion keeps paused data and shows a retryable error. | Match the erasure promise. |
| Compact 300% titles, a distance numeral, and the map heading split words. | A 24/32 px title, 32/40 px distance, and shorter copy preserve whole words with full user scaling. | Keep route details readable. |

Recording starts after explicit Start and a GPS fix. Switching apps pauses it; Resume begins a separate segment. "Walk time" counts the active session, including stationary time. Only the latest route is stored locally. GPS stamps grant no step XP. The [MapLibre setup](https://maplibre.org/maplibre-react-native/docs/setup/expo/) requires a native development build; [OpenFreeMap](https://openfreemap.org/quick_start/) supplies internet map tiles with visible attribution. Requests expose the viewed map area to the tile service.

Browser checks cover empty 320×568 at 150%/300%, 390×844 at normal text, and desktop 1280×800 at 300%; completed routes pass compact 300% and regular phone checks. Target text stays within its boxes and retains whole words. Synthetic browser GPS checks confirm exact cancellation, denial guidance, weak-fix rejection, three stamps, zero distance across a pause gap, and one successful Retry of the latest completed walk, with no game writes. A completed fixture followed by a new first fix centers the marker exactly in the map. Actual UI reset failure stops GPS and preserves progress; retry removes the route. Exact original storage, native methods, and fonts are restored afterward.

Biome, TypeScript, 54 tests, source review, and iOS/Android/web JavaScript exports pass. Chrome supplies a fresh regular-phone screenshot after T3 screenshot timeouts; no fresh T3 PNG is claimed. Development hot reload produced provider-context errors during the provider-order change; a clean reload recovers. An OpenFreeMap missing wood-pattern warning appeared for the park fixture. Actual native GPS, permissions, accuracy, battery, Dynamic Type, and screen readers still need devices. There is no background/locked-screen recording, Strava import, or connected friend competition in this slice.

## Quiet equipment changes

| Before | After | Why |
| --- | --- | --- |
| Equipping a bruh adds an "is in your party" status banner above the collection. | The card updates its checkmark and "equipped" label without an equip banner. Save errors remain visible. | The selected card already confirms the choice. |

Browser pointer checks pass at 320×568, 390×844, and 1280×800 without an equip banner or horizontal overflow. Keyboard equip and reselect pass at 390×844. In these browser checks, each changed choice saves once; reselecting saves nothing. Temporary save-count instrumentation was removed and the exact original demo storage restored. Biome, TypeScript, and all 54 existing tests pass; save-error priority is covered by the existing unit tests. T3 screenshot capture timed out, so no fresh PNG is claimed.

## Whole-walk recap

| Before | After | Why |
| --- | --- | --- |
| A completed walk stays at zoom 16 on its final GPS fix. | Completion frames every recorded segment, with room for the companion and map attribution. "Show your whole walk" restores that framing after panning; resizing refits the recap. | Let the player see the trail they made. |
| At compact 300% text, the distance numeral splits across lines. | An unconstrained horizontal measurement selects a shorter headline when needed. The full formatted distance remains in a smaller caption; user text scaling stays enabled. | Keep the full total readable when the headline needs less room. |
| Date-line bounds describe a short crossing, but raw route geometry draws across the world. | Display geometry splits at ±180 within each original segment. Saved fixes, measured distance, and pause gaps stay intact. | Keep the drawn trail consistent with its distance and framing. |
| The installed iOS wrapper fits bounds before applying requested rotation changes. | The native fitting request omits orientation overrides. | Keep bounds and marker padding consistent with the current orientation. |

Biome, TypeScript, all 60 tests, and iOS/Android/web JavaScript exports pass. Independent source review approves the reviewed map and distance changes. The installed GeoJSON tiler confirms that corrected date-line geometry avoids Greenwich-spanning lines in both directions.

[Browser DOM/projection checks on synthetic routes](../.playwright-mcp/walk-recap-qa-r2.json) pass at 320×568, 390×844, and 1280×900. In those fixtures, route points fit the padded area and the complete 52px marker stays inside the map. Recenter and resize restore the recap without saves. At compact 300% browser text, "~12" and the full "12.26 km" caption each stay on one line. Restoring width or text size restores the full headline. DOM attributes hide the probe and approximate headline from accessibility in compact mode.

Browser recording and recovery checks preserve pause gaps and saved routes, with zero step-XP writes. New fixes preserve manual panning; a new walk resets centering and padding. A [clean follow-up](../.playwright-mcp/walk-recap-qa-r3.json) passes both keyboard pan/recenter cycles after map reload. The earlier combined reload/reduced-motion sequence's stopped arrow panning remains unexplained. Original storage, methods, and styles were restored; temporary listeners were removed.

No fresh PNG or pixel-level sign-off is claimed because screenshot capture timed out. Reduced motion used a simulated app setting; native GPS, rendering, Dynamic Type, and screen-reader behavior still require physical devices. The earlier held-press reward-replacement focus issue remains open.


## Finished-walk content

| Before | After | Why |
| --- | --- | --- |
| A completed 180 m walk offers "69 m to your next stamp," although the next walk starts at zero. | Completed walks go directly from distance and time to all three stamp results. The next target and progress bar remain on empty, recording, and paused walks. | Keep future goals on walks the player can continue. |
| Unearned stamps on a finished walk say "waiting on your next steps." | They say "not reached this walk." The footer explains the existing behavior: each new walk starts at 0 m and only the latest walk is kept. | Make the recap's result and the next walk's reset clear. |
| At 249.2 m, the unfinished walk says "0 m to your next stamp" before the 250 m stamp unlocks. | Remaining meters round up for display, so this walk says "1 m." | Keep the remaining-distance cue consistent with the unlock threshold. |

Biome, TypeScript, all 60 existing tests, and iOS/Android/web JavaScript exports pass. Source changes are limited to recap rendering and formatting the remaining-distance cue.

[DOM layout checks](../.playwright-mcp/walk-content-layout.json) cover completed 180 m and paused 249.2 m fixtures at actual 320×568, 390×844, and 1280×900 viewports, at normal text and with computed CSS font sizes and line heights multiplied by three. All 12 settled samples keep the affected words within their text boxes, without horizontal page overflow or application saves. A timed-out desktop sequence was discarded; the desktop samples were collected again after a clean navigation.

[Functional checks](../.playwright-mcp/walk-content-qa-r1.json) at 1280×800 cover zero through three earned stamps, Start/Pause/Resume/Finish, and save-error Retry. These interactions produce walk-save attempts, with zero game/XP writes. A [13-fixture follow-up](../.playwright-mcp/walk-content-qa-r2.json) confirms correct counts and remaining-distance cues below, at, and above 250/500/1000 m, plus completed-walk results; fixture loading and rendering produce zero application writes. Original browser storage and temporary instrumentation were restored after testing. The main test tab returned to `/` with "the daily trail" visible at 390×844 before closing.

Screenshot capture timed out, so no fresh PNG or pixel-level sign-off is claimed. Native rendering, Dynamic Type, GPS, Health, and screen-reader validation remain device checks.

## Daily quest content and spacing

| Before | After | Why |
| --- | --- | --- |
| Play shows a completion count when no quest reward is ready. | The entry names the next unreached step target, remaining steps, and XP bonus. Ready rewards take priority with their combined bonus. When all quests are collected, the entry shows an all-done message. | Give the player a concrete next goal or a cue to collect earned XP. |
| Quest descriptions exist in game data but never appear on their cards. | All three descriptions appear across the full card width. Existing spacing tokens give 8 px from heading to description and 16 px from description to progress or collection controls. | Give the flavor text room to wrap at larger sizes. |

Biome, TypeScript, all 60 existing tests, and iOS/Android/web JavaScript exports pass. Production edits are limited to the Play quest prompt and quest-card presentation.

[Pending-state measurements](../.playwright-mcp/quest-content-layout-pending.json) and [ready/claimed measurements](../.playwright-mcp/quest-content-layout-ready-claimed.json) cover the affected prompt and descriptions at actual 320×568, 390×844, and 1280×900 viewports. All 36 samples retain whole words within their text boxes, without horizontal page overflow. Measurements used normal text sizing and 3× CSS font-size and line-height overrides. During these sampled layout/navigation sessions, no calls to the instrumented `Storage.setItem` method occurred and saved fixture strings stayed unchanged. Fixture setup and hydration preceded that instrumentation. At larger text sizes the descriptions grow while the measured gaps remain 8/16 px.

[Keyboard activation](../.playwright-mcp/quest-content-keyboard-reduced-motion.json) opens Quests under the browser's reduced-motion setting, with all descriptions present and focus outside hidden panels. See the [separate interaction review](../.playwright-mcp/quest-content-qa-r1.json) for reward, persistence, and error-path coverage, and the [boundary follow-up](../.playwright-mcp/quest-content-qa-r2.json) for singular-step and ready-state wording.

T3 snapshots timed out twice; the Playwright fallback supplies [fresh phone-width quest imagery](../.playwright-mcp/quests-cards-after-390.png). [Cleanup](../.playwright-mcp/quest-content-cleanup.json) restored exact original test storage and methods and removed temporary instrumentation and styles. Physical text scaling, native rendering, and screen readers remain device checks.

## Copy reduction

| Before | After | Why |
| --- | --- | --- |
| Screen introductions, slogans, companion narration, and desktop promotion repeat the game. | Remove that prose; keep names, goals, XP, controls, and essential permission, error, and deletion guidance. | Let the game carry the experience. |
| Quest cards repeat counters; demo steps need a separate caption. | Show one remaining-step count and label the action “demo walk · +500 steps.” | Put useful information beside its action. |
| Enlarged text splits Play labels and stop names. | Label the GPS entry “walk map,” give stop names the full line, and reduce page-title type. | Preserve whole words in the tested browser layouts at normal and 3× CSS text sizes. |

Biome, TypeScript, all 60 tests, and iOS/Android/web JavaScript exports pass. The [DOM matrix](../.playwright-mcp/trim-text-layout-final.json) covers six screens at actual 320×568, 390×844, and 1280×900 viewports, with normal and 3× computed CSS font sizes and line heights. All 36 samples retain whole words without horizontal page overflow. [Fresh phone imagery](../.playwright-mcp/trim-quests-final.png) records the shorter quest cards.

[Interaction QA](../.playwright-mcp/trim-text-qa-r1.json) passes demo +500 steps, a 50 XP claim with dismissal focus and reload, and Finish/reload of a paused GPS fixture. [Keyboard activation](../.playwright-mcp/trim-text-keyboard.json) opens the walk map under browser reduced motion. [Cleanup](../.playwright-mcp/trim-text-cleanup.json) verifies exact original storage, native `Storage.setItem`, and removal of temporary styles and globals; only test-owned tabs were closed.

Physical Health/GPS, native rendering, Dynamic Type, and screen readers remain device checks.

## Reward focus after replacement

| Before | After | Why |
| --- | --- | --- |
| A controlled step sync during trusted mousedown replaces the reward, disconnects its old button, and leaves focus on BODY after the browser's default action. | Keep immediate heading focus and check again on the next animation frame. Restore it only when focus is on BODY and the new heading remains connected; cancel the callback on cleanup. | Restore reading focus while leaving focus moved to another control alone. The keyed button still cancels the old action. |

The [before probe](../.playwright-mcp/reward-held-press-before.json) reproduced the failure before this fix. The [corrected matrix](../.playwright-mcp/reward-held-press-matrix.json) passes 12 cases at actual 320×568, 390×844, and 1280×900 viewports, with normal/3× computed CSS font sizes and line heights and browser reduced motion on/off. After release, the new heading is focused and visible with whole words; the reward stays open and Play remains the current route. The controlled 8,000-to-17,000-step sync produces the expected level 2 reward and 900 new XP. This uses the actual reducer, without reading Health data.

Biome, TypeScript, all 60 tests, and iOS/Android/web JavaScript exports pass. A [phone-sized browser capture](../.playwright-mcp/reward-held-press-after-390.png) records the resulting reward. [Cleanup](../.playwright-mcp/reward-focus-cleanup.json) confirms exact original saved strings, native `Storage.setItem`, loaded fonts, and removal of the media override and temporary globals; only test-owned tabs were closed. Native Health-triggered replacement and screen-reader focus remain device checks.

## GPS recovery guidance

| Before | After | Why |
| --- | --- | --- |
| Every browser location error adds permission-settings instructions; signal failures also say to resume before a walk exists. | Only known permission denial shows browser-settings guidance. Signal and startup errors give a short retry instruction. | Match the recovery action to the failure. |
| A missing browser location API is described as disabled device services. | Describe missing browser location support as unsupported before any permission query or watch. | Avoid sending unsupported browsers to device settings. |
| Errors appear above the map, away from Start/Resume. At compact 3× text, “unavailable” splits inside its panel. | Put recovery copy beside the walk controls and use the equally clear “not available,” preserving font size. | Keep essential guidance near its action and preserve whole words in the tested layouts. |

The [six browser error checks](../.playwright-mcp/gps-recovery-functional.json) cover signal loss, timeout, denied/revoked permission, missing location capability, and startup exceptions using synthetic browser callbacks. In these synthetic error cases, no GPS route or step-progress writes occurred. Unsupported capability makes no permission query or watch call. See the [independent interaction review](../.playwright-mcp/gps-recovery-qa-r1.json) for recap and retry coverage.

The [36-case DOM matrix](../.playwright-mcp/gps-recovery-layout.json) covers signal, denial, and unsupported states at actual 320×568, 390×844, and 1280×900 viewports, with normal text and 3× CSS overrides of app font sizes and line heights and browser reduced motion on/off. Affected words fit their text boxes; the first and last words can be brought into view, and Start stays at least 44×44 px. Long paragraphs may require scrolling. Final font stress uses immediate CSS rules; a discarded per-node observer caused test-only footer remounts.

Biome, TypeScript, all 62 tests, and iOS/Android/web JavaScript exports pass. [Phone-sized browser imagery](../.playwright-mcp/gps-recovery-denied-390.png) records the final placement. [Cleanup](../.playwright-mcp/gps-recovery-cleanup.json) confirms exact original storage, stopped synthetic watches, original browser API properties and `Storage.setItem`, and removal of temporary styles and overrides; only test-owned tabs were closed. Fast Refresh lost provider context during editing; clean navigation recovered. Native service/settings behavior, physical GPS, OS text scaling, and screen readers remain device checks.

## Walk actions and focus (October 24, 2026)

Browser walk actions have separate identities and recover usable focus in the tested transitions.

| Before | After | Why |
| --- | --- | --- |
| Start, Cancel, and Finish reuse one button. A first GPS fix during an Enter press on Cancel can finish the new walk. | Key each action separately and prevent the in-flight default when its focused button disappears. | Keep a press tied to its original action. |
| Removing an action or completing a save retry leaves focus on BODY. | Restore the current walk action after replacement or a successful save retry; restore Retry after another save failure. | Continue keyboard navigation from a usable control. |
| GPS recovery copy pushes focused Finish below the compact viewport with 3× CSS text overrides. | Correct the inner scroll position after the controls change size. | Keep the control and its outline visible. |

Footer remounts restore the same action; replacements use the next action. In the tested transitions, both suppress the remainder of a held activation. During delayed saving, deliberate focus moves take priority.

The [120 control checkpoints](../.playwright-mcp/walk-control-matrix.json) and [180 save-retry checkpoints](../.playwright-mcp/walk-retry-focus-matrix.json) pass at actual 320×568, 390×844, and 1280×900 viewports. Coverage uses normal text, 3× CSS font-size/line-height overrides, and browser reduced motion on/off. Trusted Enter/Space and mouse checks cover first fixes, GPS errors, retry failures, and fresh activation. Recorded geometry accommodates the full outline (2 px width plus 3 px offset); targets stay at least 44×44 px.

The retry matrix preserves each fixture's exact route and records no step-progress writes. A [corrupt-walk retry](../.playwright-mcp/walk-control-load-recovery.json) retains Reload focus; restoring valid storage returns focus to Start without held Enter starting GPS. The [verification record](../.playwright-mcp/walk-control-evidence.json) separates historical failures and development-server errors from passing results.

Biome, TypeScript, 62 tests, and iOS/Android/web JavaScript exports pass. The [independent browser review](../.playwright-mcp/walk-control-qa-r1.json) passes 62 checks on the final source. [Cleanup](../.playwright-mcp/walk-retry-focus-cleanup.json) verifies original storage/APIs and listener removal. Final phone-sized captures show [normal controls](../.playwright-mcp/walk-control-recording-390.png) and [3× CSS text overrides](../.playwright-mcp/walk-control-error-320-3x.png). Synthetic GPS and browser checks leave native touch, physical GPS/Health, OS text scaling, and screen readers for device verification.

## Walking camera follow (October 24, 2026)

| Before | After | Why |
| --- | --- | --- |
| The camera stays at the first fix; a synthetic 421 m walk puts the companion outside the visible map area. | The camera follows accepted location fixes while recording. A pan or zoom suspends following; Recenter or a new walk enables it again. | Keep the companion visible while respecting exploration. |

Following or exploring persists across pause/resume. Completion and recap resizing intentionally frame the whole route. Follow updates use the existing 250 ms standard motion duration, or jump with reduced motion. Production changes affect camera behavior and add no product copy.

Eleven camera checkpoints pass in all twelve combinations of browser viewports of 320×568, 390×844, and 1280×900, normal/3× CSS font-size and line-height overrides, and browser reduced motion on/off: [132 checks total](../.playwright-mcp/map-follow-matrix.json). They cover accepted fixes, trusted keyboard/mouse exploration, recenter, pause/resume, and completion. The sampled sessions record zero game/step writes. [Four dateline cases](../.playwright-mcp/map-follow-dateline.json) and [map reload](../.playwright-mcp/map-follow-reload.json) also pass; reload adds no GPS watch.

Biome, TypeScript, 67 tests, and iOS/Android/web JavaScript exports pass. The [independent review](../.playwright-mcp/map-follow-qa-r1.json) passes 15 browser assertions; native behavior received source review only.

[Before](../.playwright-mcp/map-follow-before-390.png) and [after](../.playwright-mcp/map-follow-after-390.png) imagery shows the map region. The [verification record](../.playwright-mcp/map-follow-evidence.json) distinguishes an early, unsettled recenter sample from the passing settled matrix. [Cleanup](../.playwright-mcp/map-follow-cleanup.json) restores original storage, browser APIs, and map methods. Physical GPS/touch, native rendering, battery, Health, OS text scaling, and screen readers remain device checks.

## Reset confirmation and focus (October 24, 2026)

| Before | After | Why |
| --- | --- | --- |
| Holding Enter opens confirmation and can confirm reset through key repeat. | The shared web control blocks repeated activation keys. A fresh Enter, Space, or click still confirms. | Require a separate press to reset. |
| A failed reset leaves focus on BODY. | Return focus when the action is enabled again, while leaving deliberate focus moves alone. | Keep keyboard navigation usable. |
| The initial focus repair clips the outline after activation-key release at a compact viewport with 3× CSS text. | Correct the inner scroll position after layout and key release. | Fit the full outline around the restored action. |

Focus repairs require the active route and BODY focus. Scroll corrections follow the focused control inside this component.

Eight checkpoints pass across twelve browser viewport/text/motion combinations: [96 checks](../.playwright-mcp/confirm-action-matrix.json). Viewports are 320×568, 390×844, and 1280×900; text uses normal or 3× CSS font-size/line-height overrides; browser reduced motion is on/off. The 96-check matrix records zero game writes. [Delayed reset checks](../.playwright-mcp/confirm-action-pending.json) cover external focus, route departure, failure, and one successful demo reset that saves once.

Biome, TypeScript, 67 existing tests, and iOS/Android/web JavaScript exports pass. See the [independent review](../.playwright-mcp/confirm-action-qa-r2.json) for its separate scope.

Images show [normal controls](../.playwright-mcp/confirm-action-after-390.png) and the [focused Cancel control at 3× CSS text](../.playwright-mcp/confirm-action-after-320-3x.png); the enlarged group requires scrolling. [Cleanup](../.playwright-mcp/confirm-action-cleanup.json) restores exact local/session storage strings and the original Storage.removeItem/setItem descriptors, and removes test listeners, styles, and globals. The [verification record](../.playwright-mcp/confirm-action-evidence.json) distinguishes earlier failures and harness corrections from final results. Native Health erasure, hardware keys, OS text scaling, and screen readers remain device checks.

## Walking stamp feedback (October 24, 2026)

New distance stamps get a quiet acknowledgment in the existing counter.

| Before | After | Why |
| --- | --- | --- |
| Earning a stamp changes a muted count beside the ticking clock. | Separate the counter, add a check and green text after earning a stamp, and briefly scale it from 0.92 to 1. | Make progress visible without another banner. |
| Time and stamp text share one element. | Give the counter its own polite live region and descriptive label; leave the clock outside it. | Keep clock updates out of the stamp announcement. |

The motion uses the existing 250 ms duration and respects reduced motion. Native code requests the existing platform haptics. Stamp thresholds, route recording, and step-XP logic are unchanged in source.

Six checkpoints pass in all twelve browser viewport/text/motion combinations: [72 checks](../.playwright-mcp/discovery-feedback-matrix.json). Viewports are 320×568, 390×844, and 1280×900; text uses normal or 3× CSS font-size/line-height overrides; browser reduced motion is on/off. The counter retains whole words and can be brought fully into view by scrolling. This GPS matrix records only walk-storage writes.

[Seven follow-ups](../.playwright-mcp/discovery-feedback-extra.json) pass save retry, clock updates, batched first fixes, hidden-screen progress, reward coverage, pausing, and saved-walk reload. The reward-coverage check explicitly invokes the demo step action and records its one game-storage write. The [independent review](../.playwright-mcp/discovery-feedback-qa-r1.json) passes 49 assertions in eight focused browser checks at 1280×800; native haptics received source/API inspection only.

Biome, TypeScript, 67 existing tests, and iOS/Android/web JavaScript exports pass. Fresh imagery shows [normal phone sizing](../.playwright-mcp/discovery-feedback-after-390.png) and [3× CSS text](../.playwright-mcp/discovery-feedback-after-320-3x.png). [Cleanup](../.playwright-mcp/discovery-feedback-cleanup.json) verifies the original local/session storage strings, native browser storage methods, removed test globals/styles, and stopped synthetic watches.

The [verification record](../.playwright-mcp/discovery-feedback-evidence.json) separates source/API inspection from browser results. Physical GPS, native rendering/haptics, OS text scaling, and screen-reader announcements remain device checks.

## Map attribution control (October 24, 2026)

Web map credits now match the walk screen, with a larger info control.

| Before | After | Why |
| --- | --- | --- |
| A white panel and 24×24 px info target sit over the dark map. | Use theme tokens and a complete 48×48 px rectangular hit area with rounded decoration and an inset focus ring. | Improve contrast, spacing, and activation. |
| Credit sizing follows MapLibre’s defaults. | Bound credits to the measured map height and scroll them separately from the info control. | Keep enlarged credits and disclosure controls reachable. |

The existing MapLibre disclosure, provider names, and three link destinations remain. At 3× CSS text, long provider names wrap and the credits require scrolling.

The [12-case matrix](../.playwright-mcp/map-controls-matrix.json) covers browser viewports of 320×568, 390×844, and 1280×900, normal/3× CSS font-size and line-height overrides, and browser reduced motion on/off. Attribution text is also scaled to 36 px font size with 54 px line height. Enter/Space toggle the disclosure; Tab reaches every provider link with its full focus ring. The panel and focused summary stay inside the map in these checks.

The [corner regression](../.playwright-mcp/map-controls-corners.json) passes 96 trusted clicks, 0.5 px inside each corner in both disclosure states across those twelve combinations. The [verification record](../.playwright-mcp/map-controls-evidence.json) retains the earlier corner failures and the scrollbar diagnosis.

The [independent follow-up](../.playwright-mcp/map-controls-qa-r3.json) passes 41 assertions within its stated web/source scope.

[Interaction checks](../.playwright-mcp/map-controls-interactions.json) pass target-edge clicks, keyboard/mouse map panning, and forced-colors emulation with light/dark media preferences. [Wheel checks](../.playwright-mcp/map-controls-scroll.json) scroll enlarged credits without moving the map or outer content. These sampled interactions record zero calls to the instrumented Storage.setItem method.

Biome, TypeScript, 67 existing tests, and iOS/Android/web JavaScript exports pass. [Normal](../.playwright-mcp/map-controls-after-390.png) and [enlarged-text](../.playwright-mcp/map-controls-after-320-3x.png) images were captured after layout and scroll positions settled. [Cleanup](../.playwright-mcp/map-controls-cleanup.json) verifies that local/session storage matches its original state, restores Storage.setItem, and removes test styles/globals.

Native map code is unchanged; physical touch, OS text scaling, and screen readers remain unverified.

## Daily step labels (October 24, 2026)

Play’s step count and goal can wrap onto separate rows when enlarged text needs more space. In the sampled browser cases, both labels stayed within the button, using the existing 8 px gap. In the sampled 320×568 layout with 3× CSS font-size and line-height overrides, `0 steps` and `/ 8,000 ↗` each occupy one line instead of fragmenting across three lines.

The [verification record](../.playwright-mcp/daily-step-labels-evidence.json) covers six browser viewport/text cases: 320×568, 390×844, and 1280×900, with normal or 3× CSS text. The sampled labels fit, remain reachable by scrolling, and keep a minimum 48 px button height. Normal text keeps the count left and goal right; tapping the button opens Camp. Compare the [compact capture](../.playwright-mcp/daily-step-labels-after-320-3x.png) and [regular capture](../.playwright-mcp/daily-step-labels-after-390.png).

Biome, TypeScript, 67 existing tests, and iOS/Android/web JavaScript exports pass. The parent browser’s local/session storage matched its originals after navigation, and its temporary text stylesheet was removed. Navigation also logged retained-focus/aria-hidden warnings; those remain open.

An isolated [native build check](../.playwright-mcp/daily-step-labels-native-check.json) passed Expo iOS prebuild and CocoaPods installation. Full compilation was canceled while SwiftPM waited for macOS keychain access. Device access was disabled; no simulator or physical-device actions occurred. Native rendering, OS text scaling, touch, screen readers, GPS, and Health remain unverified by this pass.

## Daily goal shortcut (October 24, 2026)

Play’s step-progress button now targets Camp’s daily-goal setting. Web code releases the outgoing control’s focus, then focuses and reveals the selected goal if focus remains on BODY. Focus on another control prevents the shortcut from transferring focus. The request is consumed without changing the goal.

The [18-case browser matrix](../.playwright-mcp/goal-shortcut-evidence.json) covers pointer, Enter, and Space at 320×568, 390×844, and 1280×900, with normal or 3× CSS font-size and line-height overrides. These checks used the 8,000-step goal. The selected radio and its full focus ring fit inside the scroll viewport. They recorded zero calls to the instrumented Storage.setItem method, no console warnings/errors, and matching before/after storage strings.

The [delayed-layout checks](../.playwright-mcp/goal-shortcut-evidence.json) keep the tested scroll position at 100 px after wheel scrolling and at 0 px after scrolling away and back, without focusing the goal. Leaving for another screen cancels the unfinished request on Camp’s own route; returning preserves the reading position, and a fresh shortcut works. The earlier [review](../.playwright-mcp/goal-shortcut-qa-r1.json) retains the scroll-override failure that prompted this correction.

A separate held-Enter/repeat/release check at 390×844 with normal text and browser reduced motion kept the game string unchanged. An ordinary Camp tab visit kept tab focus and the test’s 0 px scroll position; the consumed request did not replay. Compare the [regular](../.playwright-mcp/goal-shortcut-after-390.png) and [enlarged-text](../.playwright-mcp/goal-shortcut-after-320-3x.png) captures.

Biome, TypeScript, 67 existing tests, and iOS/Android/web JavaScript exports pass. Native code is intended to scroll to the measured goal section and cancel a pending request when dragging begins, without moving native input focus. Native scrolling/drag cancellation, OS text scaling, touch, and screen readers remain unverified. The earlier Map/Health navigation focus warnings remain outside this shortcut change.

## Map and Health focus (October 24, 2026)

Opening the walk map or Health details now focuses the page-title heading on the web. Back restores the opener when focus is on BODY or retained hidden content. Focus on another visible control prevents that transfer. Repeated Enter on Back does not reopen the screen in the tested transitions.

Hidden routes retain their last usable tab, footer, profile, and weekly-total measurements. Pointer focus restoration preserves a visible opener’s reading position; keyboard focus can reveal its outline. This avoided those temporary layout changes in the tested transitions.

The [36-case matrix](../.playwright-mcp/navigation-focus-evidence.json) covers both screens at 320×568, 390×844, and 1280×900 with normal or 3× CSS font-size and line-height overrides, using pointer, Enter, and Space. In those cases, titles and their focus outlines fit, no horizontal overflow occurred, and returning restored both opener focus and the scroll position measured at activation. The checks recorded zero calls to the instrumented Storage.setItem method and matching before/after local/session storage strings. Text stress used declared React Native Web CSS values held constant during each round trip; an earlier test that multiplied inherited font sizes twice was discarded.

Thirty additional rows cover 12 browser Back/Forward/Back cases, six daily-goal shortcuts, six confirmation cancellations, and six unchanged-storage comparisons. These used browser reduced motion. A separate 390×844 normal-motion sample passed held Enter/repeat/release and fresh Space activation on both routes. Browser console warnings/errors were absent in these sampled sessions. See the [map](../.playwright-mcp/navigation-focus-map-settled-390.png) and [Health](../.playwright-mcp/navigation-focus-after-health-390.png) captures. Independent-review status is recorded in the evidence.

Biome, TypeScript, 67 existing tests, and iOS/Android/web JavaScript exports pass. Native rendering, touch, OS text scaling, and screen readers remain unverified; agent device access is disabled. At 320×568 with 3× CSS text, the existing Health summary card is taller than its scroll viewport. The title checks do not establish full card containment. Other avatar and quest navigation remain outside this correction.

## Compact Health card (October 24, 2026)

Long Health captions can use the card's full width below its icon and title. The visible title is now "health". The card remains one button with the same connection-management action and accessible name.

At a 320 x 568 browser viewport with 3x CSS font-size and line-height overrides, the settled demo card height decreased from 440 to 324 px in a 359 px-high scrollport. Its full focus outline fit. The title remained 42 px and the caption 36 px; the stacked caption uses an 8 px gap.

Settled browser layout checks passed six viewport/text combinations and five focused resizes. In a normal-motion sample, holding Enter on Health's Back button returned to Camp; a repeated held Enter did not reopen Health. Another 18 pointer/Enter/Space Health round trips restored focus and preserved activation-time scroll positions. The sampled post-hydration sessions recorded no storage writes or captured warnings/errors. Their localStorage and sessionStorage values remained unchanged. Storage-method test overrides were restored and CSS test overrides were removed.

The initial resize probe caught a zero-height scrollport immediately after returning from desktop to phone width. All 15 follow-up traces settled correctly; transient zero-height frames remain in the evidence. At a short landscape viewport with 3x CSS text, the entire card still exceeds the scrollport, so whole-card containment is not claimed.

Biome, typecheck, all 67 tests, and iOS/Android/web JavaScript exports passed. Native measurement, physical Health, OS text scaling, and assistive technology remain unverified. Independent-review status and the original failed sample are preserved in the [evidence](../.playwright-mcp/health-card-evidence.json).

## Daily-trail character spacing (October 24, 2026)

The traveler's square tap target now scales with the illustration on compact screens, from 48 to 80 px per side at rest. Its portrait and foot anchor scale together. A 16 px gap above the scene gives the traveler room below the caption. The SVG artwork, projection, and trail coordinates are unchanged.

Twenty-eight browser layout fixtures cover progress from zero through completion and beyond, with normal and 3x declared CSS font-size/line-height samples. The tested character outlines clear the caption and map edge; the foot anchor stays within 0.5 px of its projected path point. These fixtures preceded the final focus-handler correction, which changed no layout, artwork, or animation code.

Opening the collection releases the outgoing character's web focus. The initial interaction run recorded two aria-hidden focus warnings; all ten corrected movement/resize/tap cases pass without captured warnings or errors. The normal-motion sample records intermediate positions; the reduced-motion sample jumps directly. Each of the two tested "demo walk · +500 steps" button activations adds exactly 500 steps and 50 XP with one game save. Original localStorage/sessionStorage values and test overrides were restored afterward.

Biome, typecheck, all 67 tests, and iOS/Android/web JavaScript exports pass. Native rendering/input, OS text scaling, and assistive technology remain unverified. The [evidence](../.playwright-mcp/trail-character-evidence.json) preserves source versions, the corrected focus warning, earlier prototype reload failures, Metro recovery, and independent-review status.

## Camp header focus (October 24, 2026)

The player-header shortcut releases outgoing web focus before opening Camp. Activating it while already in Camp preserves focus and avoids another route operation. The header layout, copy, and XP animation are unchanged.

The baseline recorded seven aria-hidden focus warnings in twelve browser activations. In the 22 recorded browser navigation cases, no warnings, errors, or post-hydration storage writes were captured. Four additional probes cover held-key transitions with controlled Camp-header focus and the existing daily-goal shortcut. The goal shortcut still focuses the checked radio and consumes its query. LocalStorage/sessionStorage values remained unchanged, and Storage/History test overrides and CSS stress styles were removed or restored.

Biome, typecheck, all 67 tests, and iOS/Android/web JavaScript exports passed. The enlarged-text samples tripled both declared CSS font size and line height; native input, OS text scaling, and assistive technology remain unverified. [Evidence and independent-review status](../.playwright-mcp/header-focus-evidence.json).

## Trail character resizing (October 24, 2026)

Web character placement now uses positions relative to the illustration, removing delayed width measurements from its alignment. Native retains pixel placement and the native animation driver. The illustration and resting target size are unchanged.

Four continuous browser resize sequences cover 12 transitions between 390, 320, and 1280 px widths, crossing normal/reduced motion with normal/tripled declared CSS font size and line height. Every sampled frame retains alignment and the same focused button. Eighteen settled layout fixtures and the recorded movement, pointer, keyboard, and touch checks pass. Each of the two tested demo walk +500 actions saves once and adds 50 XP; other recorded game fields stay unchanged. In the final isolated test browser contexts, original local/session strings and temporary Storage/History overrides were restored before closing.

Biome, typecheck, 67 tests, and iOS/Android/web JavaScript exports pass. Native runtime, OS text scaling, and assistive technology remain unverified. Previously recorded zero-height scrollport frames and Health layout limits remain open. [Evidence and independent-review status](../.playwright-mcp/trail-relative-evidence.json).

## Camp totals wrapping (October 24, 2026)

Camp now lays out XP and lifetime steps as separate groups. In the default 320 px browser layout, “58,290 steps” stays on one line instead of leaving “steps” alone. The totals keep their original typography, with 12 px between groups on one row and 4 px between rows.

All 18 recorded layout fixtures, two daily-goal shortcut probes, Biome, typecheck, and 67 tests pass. The fixtures cover zero, default, and 700,000-step totals at three widths with normal and tripled declared CSS font size and line height. The largest compact text sample still wraps within its group to avoid overflow. For the checked cases, displayed values match the existing domain functions, and isolated test storage and API overrides were restored.

Native rendering, OS font scaling, and assistive technology remain unverified. The separate scrollport reflow finding remains open. [Evidence and independent-review status](../.playwright-mcp/profile-totals-evidence.json).

## Walk map status (October 24, 2026)

Move loading and failure feedback into the map heading so the compact walk screen shows a state while its map is blank. Reuse “loading map…” and show “map error” on failure. Keep connection guidance and Reload below the map. The status disappears when the map reports ready; the diff changes only status copy, placement and text style.

The parent’s browser checks recorded 24 status samples across 320×568, 390×844 and 1280×900 with normal text and 3× CSS font-size and line-height overrides. Each of six sessions held the style request, returned a synthetic HTTP 503, clicked Reload, held the retry, then returned a minimal valid style. Loading and failure labels were initially visible in all six layouts; whole words fit the heading without horizontal overflow. Scrolling to Reload does not force a return to the heading. Reduced browser motion was used in the 3× sessions.

The sampled post-hydration intervals recorded zero Storage writes. All six sessions restored their saved local/session strings, Storage descriptors and temporary styles, then returned to ready Play before closing. The six expected HTTP 503 console/resource failures remain in the raw evidence. Biome, typecheck and 67 tests passed. Compact normal and enlarged-text captures were inspected. [Parent evidence](../.playwright-mcp/map-feedback-evidence.json) is linked here. Separately, [independent review](../.playwright-mcp/map-feedback-qa-r1.md) approves the reviewed web/source patch while retaining the baseline punctuation observation and earlier findings.

These synthetic browser checks do not verify real-provider availability, native rendering, OS text scaling or assistive technology. Platform exports were not repeated. The separate transient resize clipping and prior Health observations remain open.

## Step counts and compact copy (October 24, 2026)

Play, Camp and weekly history now use “1 step” for a single step and plural labels otherwise. A shared formatter retains the existing locale number formatting; the weekly chart’s accessible description uses it too. Map recovery now says “check your internet” so its following period stays with the word in the tested compact enlarged-text case.

Camp’s measured and visible companion name use the existing 16 px font size and 25 px line height while retaining the display font and heading role. This replaces the 20/28 px name size: at 320 px with 3× CSS text, “original” previously broke into “origina” and “l.” In the 320 px browser sample with 3× CSS text, the resulting 48 px font size and 75 px line height keep both words of “the original” intact; no CSS font-scaling cap was applied. The smaller normal name also fits the existing portrait layout.

The final parent browser run checks 19 total count/profile fixtures across 320×568, 390×844 and 1280×900 with normal text and 3× declared RNW CSS font-size/line-height overrides. It covers zero, one and two steps, plus one 70,000-step compact-total case. Two goal-shortcut checks preserve the checked 8,000-step radio and consume the query. A focused synthetic map failure/reload check at 320×568 with 3× CSS text keeps all seven recovery tokens, including punctuation, inside the copy bounds. Browser reduced motion was used; these are sampled checks, not every native layout or transition.

All sampled post-hydration navigation/layout intervals recorded zero Storage writes. Saved local/session strings and temporary Storage descriptors/styles/probes were restored before owned contexts returned to ready Play and closed. Displayed values matched the domain functions in the checked cases. Biome, typecheck and 67 tests passed. The final compact normal and scrolled enlarged-text captures were inspected; the earlier wrong-target capture is retained and excluded as label proof. [Parent evidence](../.playwright-mcp/step-units-evidence.json) records the scoped checks. [Independent web/source review](../.playwright-mcp/step-units-qa-r1.md) approved the scoped patch with 40 new assertions passing and all 23 source pins unchanged. It retained one expected synthetic503 error and four headless WebGL warnings. Its five fallback contexts restored the observed storage and temporary browser changes; T3 storage was unobservable after snapshot timeouts, so no restoration claim applies to that tab.

Native rendering, OS text scaling and screen-reader behavior remain unverified. iOS, Android and web JavaScript exports were not repeated for this copy pass. The separate transient resize clipping, prior Health observations and maximum-safe-integer wrapping limit remain open.

## Shorter Health captions (October 24, 2026)

The Health card now uses shorter captions: “phone app needed” in the browser demo, “read-only steps” when connected, “step sync paused,” and “no step data.” The fallback remains “connect steps.” Provider names and permission guidance remain on the Health details screen. The source diff changes only these strings and removes an unused provider variable; card styles, actions and Health logic are unchanged.

At a 568×320 browser viewport with 3× declared RNW CSS font-size and line-height, the actual demo card measures 158 px instead of the earlier 212 px inside a 205 px scroll area. Its complete 5 px keyboard outline fits. At 320×568 with the same text override, the stacked demo card is 216 px inside a 359 px scroll area. These are settled browser samples. The other status captions have source inspection and earlier text-substitution prototypes, not native Health verification.

Eight parent layout/navigation samples covered compact portrait, regular portrait, landscape and desktop at normal and 3× CSS text. An initial assertion incorrectly required keyboard focus styling after pointer Back; the original eight false assertions are retained and explained. Four targeted trusted-keyboard Back followups pass. Monitored navigation recorded zero Storage writes, and all 12 owned fallback contexts restored observed storage and temporary browser changes before closing. [Parent evidence](../.playwright-mcp/health-caption-evidence.json) records the scope and transport limits. [Independent web/source review](../.playwright-mcp/health-caption-qa-r1.md) found no application defect and confirmed the sampled demo layouts. Its raw 30/31 assertions retain one adjudicated pointer-event probe error; the report explains that boundary.

Biome and typecheck passed. Tests and JavaScript exports were not repeated for this caption-only pass. Native rendering, OS text scaling, physical Health and assistive technology remain unverified. The separate transient resize clipping, combined DOM-hide outline observation and maximum-safe-integer wrapping limit remain open.

## Reduced-motion resize correction (October 24, 2026)

The web reduced-motion rule now sets transition duration to 0s. In the tested desktop-to-phone browser resize, the previous 0.01 ms duration was associated with layout-property transitions and a blank frame. Animation duration remains 0.01 ms. The original AppStage layout is retained.

A same-source browser counterfactual restores the old duration and reproduces a 2 px frame collapse in both resize loops. The actual 0s source records no frame/world transition events or collapse in those loops; selected compositor captures were inspected. The expanded parent run passes 28 sampled resize cases across normal text and 3× declared RNW CSS font-size/line-height, each with normal and reduced browser motion. Focus and the trail actor’s node stay intact. This does not certify every painted frame.

Health entry/history and quest collection checks pass, including reward resizing, dismissal, collected focus and persistence. One initial compact reload hit development SSR error `Requiring unknown module "841"`; its failed run is retained. The focused compact-reload repeat passed with HTTP 200 and no source/server change. The cause of that server error remains unestablished. [Parent evidence](../.playwright-mcp/reduced-motion-evidence.json) keeps these scopes separate. [Independent review](../.playwright-mcp/reduced-motion-qa-r1.md) approves the reviewed one-value correction. Its 44 recorded assertions pass; the initial optional map-locator timeout and corrected followup remain in its evidence.

Lint, typecheck, 67 tests and current iOS/Android/web exports pass. Native/device behavior, OS text scaling and assistive technology remain unverified. Footer-driven clipping and the earlier combined outline and extreme-count observations remain open.

## Earlier web footer reflow (October 24, 2026)

The web footer now measures its body and controls together during browser resize delivery. Changed dimensions update placement synchronously, using the existing 192 px minimum content area. The native `onLayout` path and modal pause remain in place.

Two sampled compact captures previously showed an enlarged, docked footer covering the focused trail character. Two captures from the applied observer change show the character and content. Placement and focus checks pass in the observed source callbacks across 26 resize cases and two normal-text followups. The original runs retain early RAF/probe-order failures and two unobserved normal-text cases; these are not presented as blanket passes. [Parent evidence](../.playwright-mcp/footer-resize-evidence.json) separates callback measurements from sampled compositor frames. Landscape/portrait navigation reflow remains open; this is not every-paint proof.

Across three Play demo-walk flows, 30 checks pass: the footer opener stays mounted while the goal reward is open, resizing preserves it, and dismissal applies placement and restores visible keyboard focus. Each case saves one expected 500-step update and reloads without replaying the reward. Fixture hydration/restoration writes are excluded from those application-write counts.

Lint, typecheck, 67 tests and iOS/Android/web exports pass. [Independent review](../.playwright-mcp/footer-resize-qa-r1.md) approves the reviewed web correction and supports sampled compact footer-occlusion closure. Its 27 evaluated assertions pass; the initial route-locator timeout and corrected followup are retained. P3 navigation reflow remains open. Native execution, OS text scaling and assistive technology remain unverified. Earlier combined outline and extreme-count observations remain open.

## Navigation column timing (October 24, 2026)

Web navigation now reads its current width and label hosts during browser resize delivery. It observes the stable label container because React can replace individual text hosts. The existing four-, two- and one-column choices remain; native uses the existing `onLayout` fallback.

Selected first phone-return captures show two rows instead of cramped four-column labels. Parent checks pass 32 combined resize rows, 24 keyboard transitions and four live CSS text-size changes. Whole labels, 48 px targets, tab identity, focus and roving tab order pass in those checks. All 52 observed source-callback returns have correct columns; four unchanged-width rows have no callback sample. Early RAF mismatches remain in the [evidence](../.playwright-mcp/navigation-columns-evidence.json); this is not every-paint proof.

One initial normal-text request returned development HTTP 500 before the app loaded. The control blocked by the initial load failure then passed without source or server changes; unknown-module 841 remains an unresolved development-server observation. Three goal-reward regressions pass 30 checks, including opener focus, one expected 500-step save per case and reload persistence. Navigation intervals record no monitored writes. A reused screenshot path overwrote the earlier footer modal PNG; the evidence identifies that limitation and saves this pass's capture separately.

Lint, typecheck, 67 tests and iOS/Android/web exports pass. [Independent review](../.playwright-mcp/navigation-columns-qa-r1.md) supports closure of the sampled navigation issue; early timing and ring observations remain recorded. Text stress used 3× declared RNW CSS font-size and line-height, not OS scaling. Native execution, assistive technology, the separate frame-orientation lag and prior outline/count observations remain unverified or open.

## Browser frame sizing (October 24, 2026)

Web frame dimensions now come from CSS media queries and viewport height, so orientation and desktop sizing do not wait for a React dimension update. The previous non-web View hierarchy, styles and dimension-based landscape choice were extracted into a native component. Desktop spacing, width, border and radius use the existing values.

The same-source browser comparison records 28 frame-size mismatches in its baseline samples and none with temporary CSS geometry. Applied-source geometry checks report no sampled frame-bound or centering mismatch across 40 expanded resize cases (2,464 target-viewport observations). Separately, 24 keyboard transitions and four live text-size changes meet their recorded checks. Text stress used 3× declared RNW CSS font-size and line-height. Fresh normal-text phone and desktop PNGs were opened. Selected trace JPEGs still include brief blank captures; early column/ring/scrollport observations remain in the [evidence](../.playwright-mcp/app-stage-evidence.json). These checks do not establish every-paint correctness.

Three goal-reward cases pass 30 checks, including one game save after adding 500 steps in each 7,500→8,000 fixture, and reload persistence. Three Health-details/map return sequences pass 30 checks with no monitored Storage writes and unchanged captured local/session strings. Their initial run stopped on an incorrect test locator; that failed evidence is retained. No Health connection, location permission or walk-start action was exercised.

Lint, typecheck, 67 existing tests and iOS/Android/web JavaScript exports pass. A later development root request returned HTTP 500; the unchanged-source five-route followup returned 200. The unknown-module 841 cause remains unresolved. [Independent review](../.playwright-mcp/app-stage-qa-r1.md) approves the bounded web sizing correction; its early layout observations and instrumentation limits remain disclosed. Native execution, OS text scaling, assistive technology, other browser engines and dynamic browser bars remain unverified.

## Capture interpretation correction (October 24, 2026)

The previous frame-sizing note incorrectly described two trace JPEGs as blank. Their bytes, the two adjacent JPEGs and the corresponding ZIP entries all share SHA-256 `1dcadf10fe2f76d2c54a8fa6fba3497a25074c97a1152d467d44844f499dacf8`. An individual view at original detail shows the centered UI in the content shared by these four JPEG files. AS-PARENT-O1 is closed only as a correction to their earlier blank-image description. The [hash receipts and corrected record](../.playwright-mcp/app-stage-evidence.json) retain the original assertion and its correction. No source change was needed for that finding, and these four images do not establish every-paint correctness.

Twelve subsequent root requests returned HTTP 200 without source or server changes. That does not explain the earlier unknown-module 841 HTTP 500; its cause remains open. Native/device, OS text scaling, assistive technology and the prior early layout observations remain outside the verified scope.

## Compact companion cards (October 24, 2026)

Single-column companion cards now place an 80 px character beside the number and NEW badge when the measured badge, character and spacing fit across the card. Narrower cards keep a stacked header. The existing text-size and scaling settings are unchanged; two-column cards retain their 104 px characters.

At a 320×568 browser viewport with 3× declared RNW CSS font-size and line-height and reduced browser motion, the newly unlocked Night card changes as follows:

| Sample | Card height | Result in the 359 px scroll area |
| --- | --- | --- |
| Before | 435 px | Equip sits below navigation. |
| After | 321 px | Character, name, Equip and 5 px focus ring fit at the tested 16 px reveal inset. |

A web follow-up addresses the observed resize/focus failure in the tested cases. The added web check runs after that card's layout and uses the existing keyboard-focus visibility helper. It leaves the initial inset to the existing reveal handler and skips active pointer presses to keep their target still. All nine parent regression checks pass on the final source, including live normal/3× CSS text changes, query consumption and one equip save with no additional save on reselect. The original failed resize samples remain in the record.

The initial-compaction review verified two actual quest claims totaling 175 XP, the Night unlock and a single equip save; reselect added none. Final-source lint, typecheck, 67 tests and iOS/Android/web JavaScript exports pass. [Evidence and independent-review status](../.playwright-mcp/compact-collection-evidence.json) distinguish the initial review from the resize follow-up and document restoration of the isolated test contexts' observed storage and temporary browser changes. An earlier cold-reveal PNG was overwritten by the final-source rerun; the failed JSON measurements remain available and the fresh PNG has a separate name.

The 240 px/3× and short-landscape/3× cards remain taller than their scroll areas and require scrolling. Native rendering, OS text scaling, assistive technology and every-paint behavior remain unverified. Earlier combined-outline, extreme-count wrapping and early layout-timing observations remain open, as does the intermittent development SSR error.

## Shorter Camp reset labels (October 24, 2026)

In the local preview, Camp uses “reset demo” and “keep my demo.” The source diff changes only those two strings; confirmation and pending labels, styles and reset logic remain unchanged.

At a 320×568 browser viewport with 3× declared RNW CSS font-size and line-height and reduced browser motion, the measured controls change as follows:

| Control | Before height / lines | After height / lines |
| --- | --- | --- |
| Reset | 290 px, four lines | 158 px, two lines |
| Cancel | 224 px, three lines | 158 px, two lines |

In all 18 recorded browser focus samples, each button and its focus outline fit within the recorded scroll area. The three cases use compact 3× CSS text, regular-phone normal text and desktop normal text, all with reduced browser motion. Held Enter leaves confirmation open; Enter, Space and pointer cancellation return focus. Monitored action intervals record zero Storage writes, and captured strings stay unchanged. No reset was accepted, so reset success/failure is outside this pass.

The three applied-source contexts restored captured local/session strings and Storage method descriptors, removed temporary styles/probes, observed Play’s companion button after an HTTP 200 reload and compared strings before closing. Lint and typecheck pass. Unit tests and JavaScript exports were not repeated for the two-string diff. [Evidence and independent-review status](../.playwright-mcp/camp-reset-copy-evidence.json) retain the prototype, source samples and earlier inspection-harness failures.

The first prototype request returned development HTTP 500; the next three unchanged-source requests returned 200. The known SSR error remains unresolved. Native rendering, OS text scaling and assistive technology remain unverified. Earlier combined-outline, extreme-count wrapping and early resize-timing observations remain open.

## Clearer walking-map labels and focus (October 24, 2026)

The local preview uses warm, lighter text for the provider's street and motorway names. The shared colors also have native layer bindings intended to preserve the existing label layout and filters; native rendering remains unverified. A separate web correction moves the canvas keyboard-focus outline inside the map, where it was previously clipped.

All 27 assertions from the parent run pass across three sampled browser configurations: 390×844 normal text, 1280×900 normal text, and 320×568 with a browser CSS stress check using 3× the declared React Native Web font size and line height, with reduced browser motion. The checks cover label colors, the synthetic saved route, marker framing, trusted keyboard panning and recentering, and zero action-interval Storage writes. Individually inspected phone captures show all four focus-outline edges. The isolated contexts restored their captured local/session strings and temporary Storage methods, probes and styles before closing.

Lint, typecheck, 67 tests and iOS/Android/web JavaScript exports pass. Independent review passed 26 focused checks across two phone-browser cases, with native review limited to installed source. The [evidence and review](../.playwright-mcp/map-labels-evidence.json) retain the original clipped-outline capture and failed inspection attempts. The existing provider image warning and intermittent development SSR error remain open. Other map-label classes, native rendering, OS text scaling, assistive technology and every-paint behavior are outside this verification.

## Earned streak color (October 24, 2026)

In the local preview, the streak flame and count are muted at 0 days and orange for an active streak. The color now distinguishes earned progress in the first-day header. The one-component diff leaves the streak calculation and accessible day label unchanged.

Three browser cases pass seven aggregate checks each (21 total) over 18 sampled states at 390×844, 320×568 and 1280×900. The compact browser CSS stress case uses 3× declared React Native Web font-size and line-height with reduced browser motion. First-goal crossing and reload pass at all three sizes; carried, broken and demo streaks were additionally checked at 390 px. Each of six demo-walk button activations saved its expected game once. Fresh zero-day streak bounds match their earlier measurements at all three sizes. Phone captures were inspected individually at original resolution.

Lint, typecheck, 67 tests and iOS/Android/web JavaScript exports pass. Independent source and browser review passed two focused cases, including first-goal saving and reload. The [evidence and review](../.playwright-mcp/streak-feedback-evidence.json) retain the earlier fixture-generator and formatting failures, preview timeouts and development page-load error. That error reported unknown module 841; the unchanged retry returned HTTP 200, and its cause remains unresolved. Earlier combined-focus-outline, extreme-count wrapping and resize-timing observations remain open. Native rendering, OS text scaling, assistive technology and every-paint behavior remain unverified.

## Shorter XP caption (October 24, 2026)

The local preview uses “XP left” in the header. In the sampled 320×568 browser CSS stress case with 3× declared React Native Web font-size and line-height and reduced browser motion, the caption for 1,500 XP takes two lines instead of three. This fixture has 0 steps. Header height drops from 240 to 186 px, recovering 54 px. The normal-text 390×844 and 1280×900 header samples for the same fixture remain 52 px high.

In three sampled browser cases, ten aggregate checks passed per case (30 total). Each case contains five caption states and one transient gain state: 15 caption states and three gain states in total. Each of the three sampled demo-walk button activations added 500 test steps and saved its expected game once. These browser checks found that +50 XP feedback fit when only 1 XP remained, “1 XP left” persisted after reload, and DOM progress labels retained the level and exact XP remaining. Compact zero-step and gain PNGs were opened individually at original resolution.

Lint and typecheck pass. Unit tests and JavaScript exports were not repeated for the single display-string diff. Independent review passed two focused browser cases, including the compact counterfactual, gain containment and persistence checks. The [evidence and review](../.playwright-mcp/xp-caption-evidence.json) retain the copy prototype and preview timeouts. The known development SSR841, provider image warning and earlier combined-outline, extreme-count wrapping and resize-timing observations remain open. Native rendering, OS text scaling, assistive technology and every-paint behavior remain unverified.

### Quest focus across the daily reset (October 24, 2026)

In the tested web flows, focus returns to the quest heading when a reward is dismissed after a browser-clock daily reset, or when that reset removes the still-focused collected marker. The heading remains available when yesterday’s collected status disappears. Same-day dismissal still returns to “collected”; moving focus to another control prevents the reset fallback. The web headings use the existing name typography and focus outline, with no additional Tab stops. The native title branch is unchanged.

Four transitions pass at each of three browser configurations: 390×844 and 1280×900 with normal text and motion, plus 320×568 with reduced motion and 3× overrides of declared CSS font sizes and line heights. The 144 sampled assertions include focus-ring containment, saved-game bytes and expected writes. Twelve quest claims and nine browser-clock midnight refreshes produced exactly 21 expected game saves. The first quest’s name and card geometry match a temporary unwrap/restore counterfactual in these samples. Captured local/session strings and instrumented Storage descriptors were restored; each owned mock clock was rebased before its context closed. No host clock was changed.

Lint, typecheck, all 67 tests and iOS/Android/web JavaScript exports pass. Independent review passed five scoped browser scenarios and 77 assertions, including companion reveal, exact saves and 150 XP after reload. The [evidence and review](../.playwright-mcp/quest-day-evidence.json) retain the original failures, intermediate checks, browser matrix, captures and preview timeouts. The baseline retains a development HTTP 500 for unknown module 841; the next unchanged request returned HTTP 200, without resolving the intermittent error’s cause. The final matrix captured no console or page diagnostics. Earlier provider-image, extreme-count wrapping, combined-outline and resize observations remain open. Native rendering, OS text scaling, assistive technology and every-paint behavior remain unverified.

### Solid woodland on the walking map (October 24, 2026)

In the tested browser forest view, a solid replacement restores woodland that was nearly blank with the provider’s missing texture. The shared source change hides the provider’s patterned woodland layer and inserts a shared solid layer immediately before it, matching the current polygon filter, minimum zoom, color, opacity and translation. The replacement has no pattern property. This avoids relying on empty-string clearing, which requested an empty image on web and did not establish the native renderer’s undefined-pattern path. Native behavior remains a device check.

The final browser matrix passes 57 assertions: an empty walk at 390×844, a paused saved-route fixture at 320×568 with reduced motion and 3× overrides of declared CSS font sizes and line heights, and a completed fixture at 1280×900. Normal text and motion were used for the other two cases. The sampled checks cover provider geometry and layer position, route geometry, marker/stroke sizes, road-label colors, keyboard pan/recenter and attribution links. No missing-image warning or monitored Storage write occurred after fixture hydration. Captured game/route strings stayed unchanged, and owned contexts restored captured storage and instrumented descriptors before closing.

Lint, typecheck, all 67 tests and final iOS/Android/web JavaScript exports pass. Independent [source/browser review](../.playwright-mcp/map-forest-independent-r1/bruhs-map-forest-qa-r1.md) found no blocking regression. The [evidence](../.playwright-mcp/map-forest-evidence.json) retains the provider response, before/after browser captures, rejected clear-value attempts, corrected collapsed-credit assertions and final checks. An intermediate cleanup request hit the known HTTP 500 for unknown module 841 and returned 200 on retry; its cause remains open. Earlier extreme-count, resize and combined-outline observations remain open. Native rendering, OS text scaling, assistive technology and every-paint behavior remain unverified.
### Shorter level-up quest subtitles (October 24, 2026)

When a quest raises the level without unlocking a companion, its reward subtitle now shows the quest name. The step target stays in the completion row. For the sampled touch grass reward at 320×568 with 3× declared CSS font-size/line-height overrides and reduced motion, scroll content fell from 1,154 to 1,028 CSS px. The normal-text 390px case kept its 476px height.

All 225 assertions in 15 browser cases pass across 390×844, 320×568 and 1280×900. CSS enlargement and reduced motion apply only to the 320px cases. The checks cover all three quest names, the quest-only and companion-unlock branches, exact claim saves and reward actions. Captured local/session strings and instrumented Storage descriptors were restored. Lint and typecheck pass; unit tests and platform JavaScript exports were not rerun for this copy conditional. Independent [browser QA](../.playwright-mcp/reward-reading-independent-r1/bruhs-reward-subtitle-qa-r1.md) passed nine final grass-quest samples. The [evidence](../.playwright-mcp/reward-reading-evidence.json) retains the fixtures, captures, measurements and checks. Native rendering, OS text scaling, assistive technology and every-paint behavior remain unverified.

### Quiet daily-goal choices (October 24, 2026)

Changing the daily goal now uses the option’s existing selected state as confirmation. The redundant success banner is removed; save errors and Retry remain. In the before samples, the banner reduced the scrollport by 63 CSS px at 390×844 and about 160 CSS px at 320×568 with enlarged CSS text. Successful changes keep the scrollport height unchanged in the final sampled configurations.

All 186 assertions in nine browser cases pass across 390×844, 320×568 and 1280×900. Only the 320×568 cases use 3× overrides of declared CSS font sizes and line heights and reduced motion. Successful pointer and keyboard changes each save once; reselecting adds no write. In the synthetic failure cases, two failed choices retain the save error, and Retry saves the latest choice once. Stored snapshots match the expected goal changes while retaining XP, previous dates’ goals, steps, claims and equipped companion. Captured local/session strings and instrumented Storage descriptors were restored. Independent [source/browser QA](../.playwright-mcp/quiet-goal-independent-r1/bruhs-quiet-goal-qa-r1.md) approves the scoped correction. Lint, typecheck and all 67 tests pass; platform JavaScript exports were not rerun. The [evidence](../.playwright-mcp/quiet-goal-evidence.json) retains captures, measurements, initial harness corrections and preview failures. The intermittent module 841/HTTP 500 issue and earlier extreme-count, resize and combined-outline observations remain open. Native rendering, OS text scaling, assistive technology and every-paint behavior remain unverified.

### Save errors lead with the failure (October 24, 2026)

The save-error notice now puts its message first and groups Retry and dismissal below it. Shorter copy starts with “unsaved progress.” In the sampled 320×568 and 568×320 browser layouts with enlarged CSS text, that phrase is visible without scrolling in those sampled layouts; the storage guidance and controls remain reachable by scrolling the notice. The normal-text 390×844 notice shrank from 180 to 103 CSS px. The pending button reads “saving” to retain horizontal padding in the compact sample.

All 128 assertions in four final browser cases pass: 390×844 and 1280×900 with normal text and motion, plus 320×568 and 568×320 with reduced motion and 3× overrides of declared CSS font sizes and line heights. The checks cover initial failure visibility, notice scroll keys, Tab order, focused-control containment, dismissal, repeated save failures and deferred Retry recovery. Each final case records four deliberate failed attempts and one successful underlying browser Storage write of the expected latest game; duplicate busy clicks and reselection add no attempted Storage writes. Captured local/session strings and instrumented Storage descriptors were restored. Lint and typecheck pass; unit tests and platform JavaScript exports were not rerun for this layout/copy change. Independent [source/browser QA](../.playwright-mcp/save-error-independent-r1/bruhs-save-error-layout-qa-r1.md) passed all four viewport flows with no blocking findings. The [evidence](../.playwright-mcp/save-error-evidence.json) retains before/final captures, a rejected copy-only prototype, the deferred-release harness correction and preview failures. The intermittent module 841/HTTP 500 issue and earlier extreme-count, resize and combined-outline observations remain open. Native rendering, OS text scaling, assistive technology and every-paint behavior remain unverified.

### Shorter walking time with hours (October 24, 2026)

Walking time now shows hours at one hour and above, so 75 minutes reads “time 1:15:00.” Below an hour, the clock keeps minutes and seconds; durations beyond a day retain their hours. The visible label is shorter, and its DOM accessibility label spells out units. In the sampled 320×568 browser layout with 3× declared CSS font-size/line-height overrides and reduced motion, the 75-minute timer fell from 108 to 54 CSS px high. The normal-text 390×844 and 1280×900 samples remained one line.

Across those three configurations, the seven final browser fixture cases pass 112 assertions in total. The samples cover empty, paused and completed walks, including 75 minutes of active time over a 135-minute period with a pause gap. Expected clock text, DOM accessibility labels, glyph containment and stopped-time stability match; monitored post-hydration Storage writes are zero, and raw game/route strings remain unchanged. Captured local/session strings and instrumented Storage descriptors were restored. Lint, typecheck and all 69 tests pass, including second/hour boundaries and duration beyond a day. Platform JavaScript exports were not rerun. Independent [source/browser QA](../.playwright-mcp/walk-time-independent-r1/bruhs-walk-time-qa-r1.md) passed the fixtures and a synthetic resume/pause/resume/finish flow across an hour. The [evidence](../.playwright-mcp/walk-time-evidence.json) retains captures, prototypes and checks. Earlier inspection requests hit a module 841/HTTP 500 error and recovered on unchanged retries; its cause remains open. Earlier extreme-count, resize and combined-outline observations remain open and are outside this timer review. Native rendering, OS text scaling, assistive technology and every-paint behavior remain unverified.

### A shorter walking stamp counter (October 24, 2026)

For zero stamps, the shorter walking caption pairs its icon with “0 / 3,” retaining the full DOM accessibility label and polite live-region attribute. In the sampled 320×568 browser layouts with 3× declared CSS font-size/line-height overrides and reduced motion, its text fell from 108 to 54 CSS px high; the section with time and stamps fell from 174 to 120 CSS px. Normal text samples at 390×844 and 1280×900 kept their 18 CSS px counter height.

Five final fixture cases pass 90 assertions in total, covering zero and three earned stamps, colors, alignment, labels and containment. Sampled game/route strings stayed exact with zero monitored post-hydration Storage writes. Captured local and session storage strings and instrumented Storage descriptors were restored. Lint and typecheck pass; unit tests and platform JavaScript exports were not rerun for this caption trim. The [independent review](../.playwright-mcp/stamp-counter-independent-r1/bruhs-stamp-counter-qa-r1.md) passes 118 assertions across four complementary count fixtures and a synthetic first-stamp flow. The final flow preserves the stamp after pause/reload, with four expected route writes, zero other post-hydration writes and unchanged game bytes/XP. Earlier locator and clock-harness failures, including an aborted owned context whose restored storage changed during navigation, remain in the evidence; the final flow stops recording before restoring its captured state. The [evidence](../.playwright-mcp/stamp-counter-evidence.json) retains before/final captures and the temporary suffix-removal DOM prototype, whose text was restored after sampling.

Native rendering, OS scaling, assistive technology and every-paint behavior remain unverified. The module 841/HTTP 500 issue and earlier extreme-count, resize and combined-outline observations remain open.

### Useful distance decimals (October 24, 2026)

Kilometre captions show “1 km” and “1.2 km,” retaining meaningful hundredths such as “1.01 km.” The source change removes trailing zeroes after the existing two-decimal rounding; the metre branch is unchanged. Before-source browser samples at 320×568 with 3× overrides of declared CSS font sizes and line heights and reduced motion had 191 CSS px rows for “1.00” and “1.20,” with the unit below. Temporary DOM prototypes reduced those rows to 120 CSS px; their original text was restored. Final-source fixtures confirm 120 CSS px rows with the shorter values beside “km.” Normal 390×844 and 1280×900 samples keep their 40 CSS px row.

Seven selected final-source fixture cases pass 175 scoped layout, saved-byte and cleanup assertions in total, including meaningful hundredths, the “123.46 km” fallback caption and the “1 km” stamp threshold. Monitored post-hydration Storage writes are zero. Four earlier cleanup navigations returned module 841/HTTP 500; their pre-navigation strings were restored, but home readiness and post-navigation strings were unverified before those owned contexts closed. Four unchanged-source follow-ups address that verification gap. Every selected final case verifies captured local/session strings before and after home readiness and restored instrumented Storage descriptors. The [evidence](../.playwright-mcp/distance-zero-evidence.json) retains those failures and a “circle-11” map-icon warning; no clean overall console pass is claimed. Distance captures do not verify map tile completion.

Lint, typecheck and all 69 tests pass. Platform JavaScript exports were not rerun. Independent [source/browser QA](../.playwright-mcp/distance-zero-independent-r1/bruhs-distance-zero-qa-r1.md) passed seven layout samples and a synthetic live 1 km crossing: five expected route writes, zero extra game/XP writes after hydration, and exact route bytes after pause/reload. Its two corrected locator failures remain archived. Native rendering, OS scaling, assistive technology and every-paint behavior remain unverified; the development-server, map-icon and earlier extreme-count, resize and combined-outline observations remain open.

### Town markers at wider zooms (October 24, 2026)

The town and city layers now reference “circle_11,” matching the current provider’s 1× and 2× sprite indexes. Those indexes lack the style’s previous “circle-11” key. The shared override keeps the existing zoom-9 cutoff. Web applies it on style loading; native registers existing-layer overrides through the installed wrapper’s style-loading path. Native rendering and startup image requests remain unverified.

Before the source edit, an in-memory browser prototype restored dots beside nine place labels without changing their feature data, camera or route. Its original expressions and camera were restored. Three final-source browser samples pass 75 assertions in total at 390×844, 320×568 and 1280×900, covering the empty, paused and completed states. Only the compact case uses 3× declared CSS font-size/line-height overrides and browser reduced motion; its credits also use 36 px font size/54 px line height and are collapsed for the capture through the actual disclosure control, then restored. Fresh final-source loads show the corrected sprite with no missing-image warning. In the checked browser samples, labels, filters, paint, layer order, roads, woodland, route geometry and credits remain intact. In those final-source checks, trusted keyboard pan, route recenter and credits toggles pass; all nine document requests return 200 with zero captured diagnostics or monitored post-hydration Storage writes.

Captured local/session strings match before and after home readiness; Storage descriptors, camera, CSS and probes were restored, and owned contexts closed. Lint, typecheck and iOS/Android/web JavaScript exports pass. Unit tests were not repeated for this visual style change. The [evidence](../.playwright-mcp/map-place-evidence.json) retains the initial probe-helper failure and a module 841/HTTP 500 cleanup response followed by an unchanged successful retry. Independent source/browser QA gives a bounded pass across three browser samples and a separate woodland/remount check, with zero monitored post-hydration writes. It retains negligible floating-point camera-equality failures as harness precision limits; all checked route projections stay within one device pixel. The server error’s cause, earlier extreme-count/resize/combined-outline observations, native rendering, OS scaling, assistive technology and every-paint behavior remain unverified.

### Clearer town and city labels (October 24, 2026)

The three town/city map layers use the existing muted warm text color. The shared paint override changes only their text color; the previous marker correction, provider fonts, sizes, halos, filters and zoom ranges remain in source. Web applies the color during style loading, and native supplies it through the existing Layer paint prop.

Before the source edit, two in-memory browser comparisons at 390×844 showed clearer labels at zooms 7.5 and 9.5, with the same nine rendered place features and positions. Original paint and camera were restored. Full raw comparison output is retained only in the parent tool history. Three sampled final-source browser configurations pass 78 assertions in total, without a full state × viewport matrix: 390×844 empty/normal, 320×568 paused/3× declared CSS font-size and line-height with browser reduced motion, and 1280×900 completed/normal. In the compact sample, credits were separately set to 36 px font size/54 px line height; they were collapsed through the disclosure control for capture, then restored. The checked layers retain the intended color and marker cutoff; pan, recenter, route, road colors, woodland and credits checks pass. The nine final-source document requests return 200 with zero captured diagnostics or monitored post-hydration Storage writes.

In those sampled contexts, captured local/session strings match before and after home readiness; instrumented Storage methods, camera, CSS and probes were restored, and owned contexts closed. Lint, typecheck and current iOS/Android/web JavaScript/Hermes export checks pass. Unit tests were not repeated for this visual paint change. Installed native source supports text-color forwarding; native rendering remains unverified. The [evidence](../.playwright-mcp/place-label-evidence.json) distinguishes the restored prototypes, final browser checks and source/export evidence. Independent source/browser QA passes within the reviewed paint scope: three browser samples plus a compact credits follow-up, with zero monitored post-hydration writes. The module 841/HTTP 500 cause remains open. Earlier extreme-count/resize/combined-outline observations, OS scaling, assistive technology and every-paint behavior remain outside this correction.

### Readable text while fonts load (October 24, 2026)

The browser font configuration uses `font-display: swap` and a generic monospace fallback. A delayed-download probe had shown visible controls with their text hidden while the three Monaspace files were still loading. The restored CSS prototype showed readable fallback text; the chosen fallback keeps the monospaced character until the brand fonts arrive. Web font tokens include that fallback, and map credits use the full family list without quoting it as one name. Native tokens retain the original single-family names; installed package source contains numeric-asset resolution within font resources.

Three sampled final-source browser configurations pass 57 assertions in total: 390×844 normal, 320×568 with 3× declared CSS font-size/line-height and browser reduced motion, and 1280×900 normal. These checks hold font requests during a reload after a normal baseline load, then release those requests; they do not form a full viewport/state matrix. The three faces remain loading during fallback captures and report loaded afterward. Sampled pages have no horizontal document overflow. At 390×844, a trusted quest claim while fonts are pending saves once; the actual progression function confirms 5,829 → 5,879 XP, with unchanged steps and the same saved claim after font completion and reload.

Captured local/session strings and instrumented Storage methods were restored in those three contexts before and after home readiness. Font routes, CSS, probes and CDP sessions were removed or closed with the owned contexts. Held-font images use CDP capture to avoid the screenshot tool waiting for fonts; no FontFaceSet API was overridden. Lint, typecheck and current iOS/Android/web JavaScript/Hermes export checks pass; unit tests were not repeated for this typography configuration.

Independent QA returned PASS WITH LIMITS for the sampled web font-loading behavior, including three cold initial document loads with fonts held before hydration. Its held-font map-credits check remains inconclusive, and runtime SVG text was not covered. The raw failures remain in the [evidence](../.playwright-mcp/font-loading-evidence.json). A separate parent check of the exported web build at 390×844 waited for the map, tiles and three credit links, then verified pointer and Enter toggling, the family stack, panel containment and 48×48 control. The packaged map CSS and worker returned HTTP 200. That follow-up used loaded fonts; it does not replace the independent held-font check. Its first attempt used an incorrect tab name; the corrected attempt and cleanup are retained.

The evidence also retains the parent compact cleanup’s module 841/HTTP 500 followed by an unchanged successful retry. The server error’s cause remains open. Native font/splash rendering, OS scaling, assistive technology, every-paint behavior and earlier extreme-count/resize/combined-outline observations remain unverified or outside this correction.

### Readable country labels (October 24, 2026)

Country names on the world map now use the same warm muted color as town labels. The three country layers change from the provider's `rgb(101,101,101)` to the existing `#ab998f` token. In the live browser prototype, the names appeared clearer, then restored the exact map style, camera and captured storage. Web overrides apply when the style loads; native uses paint-only overlays of the existing layers. Native compatibility was inspected against installed MapLibre 11.5.0 source.

Parent browser checks pass 63 assertions across three sampled configurations: 390×844 normal, 320×568 with 3× CSS font-size/line-height and browser reduced motion, and 1280×900 normal. Forty-five separate serialized-layer comparisons preserve country filters, sizes, halos, layouts and zoom limits while changing only text color. Pan, credits and map remount checks pass; monitored Storage calls total zero after hydration, and captured local/session strings and instrumented methods were restored. Major and minor country labels appear in the captures; the other-country layer has property checks without a visible label fixture. CSS text overrides do not represent OS scaling or enlarge canvas glyphs.

Lint, typecheck and current iOS/Android/web JavaScript/Hermes exports pass. Unit tests were not repeated for this paint change. The [evidence](../.playwright-mcp/country-label-evidence.json) retains the provider request's initial HTTP 403 and the successful request with a browser user agent. Independent QA accepted the exact patch within the reviewed source/web scope. Its initial attribution and CSS-stress harness failures remain alongside the corrected followups. Native rendering, assistive technology, every-paint behavior and earlier extreme-count/resize/combined-outline observations remain outside this check. Module 841/dev HTTP 500 remains open; this browser sample's six successful documents do not establish its cause or closure.

### Bruh startup and reachable recovery (October 24, 2026)

The font/mount gate uses the existing static bruh in a 100 px SVG box. In the sampled font/mount-gate checks, its browser DOM has a named, busy progressbar. The sampled held-entry browser checks show the bruh in place of the blank entry view, without the visible “loading…” caption. The pending-progress state reuses this component; that branch has source/export checks only. Startup error containers use scroll views with growing content; the saved-progress heading is now “could not load.” In the before probe at 320×568 with 3× CSS text, the recovery button lay below the fixed frame and wheel scrolling did not reach it. The existing data warning and reset callback are retained.

Parent checks cover 390×844 normal, 320×568 with 3× declared CSS font-size/line-height and browser reduced motion, and 1280×900 normal. The main run passes 57 evaluated assertions for held-entry first paint, SVG centering, DOM progress semantics, ready-state/font completion, and corrupt-save scrolling and focus. Its three heading-word entries were absent because the harness queried DIV instead of the actual H2; those are not passed checks. The 21 narrow H2 follow-up assertions pass, including whole-word ranges and computed text sizes. Corrupt strings remain exact. No reset was accepted. Captured local/session strings were restored before and after home readiness, then pristine empty storage was restored before closing the owned contexts.

Lint, typecheck and current iOS/Android/web JavaScript/Hermes exports pass. Unit tests were not repeated for this layout change. Pending-progress loader reuse and the font-error container have source/export checks only. DOM attributes do not establish screen-reader behavior. Native rendering, splash/font handoff, OS text scaling, assistive technology and every-paint behavior remain unverified. Independent QA returned a scoped pass for the same three web configurations, with no blocking patch findings. Its first run retains three failed measurement-selector assertions out of 75; a corrected narrow follow-up passed 21/21 checks. The [evidence](../.playwright-mcp/boot-loading-evidence.json) retains those failures and the parent compact cleanup’s module 841/HTTP 500 with its unchanged successful retry. The dev-server cause and earlier extreme-count/resize/combined-outline observations remain open; this correction does not resolve them.

### Shorter weekly-card labels (October 24, 2026)

Camp’s weekly card uses “week” and the browser’s “demo” tag. In the component source, only those two display strings changed. The non-demo “7 days” tag is unchanged (source check only). At 320×568 with 3× RNW CSS font-size/line-height and browser reduced motion, the sampled card is 200 px shorter. With the card positioned 16 px below the scrollport top, the compact “58K” numeral moves from y333..441 to y133..241 and fits inside the 359 px port. The exact “58,290 steps” caption continues below the port and remains reachable by scrolling.

The three sampled layouts—390×844 normal, 320×568 with the CSS overrides, and 1280×900 normal—retain the observed totals, chart DOM labels and saved game strings. In the two sampled normal layouts, card heights remain 425 px; heading and numeral keep their 16 px gap. Zero-step and seven-goal fixtures, plus Play/Camp navigation, pass the recorded checks. Eight PNGs were inspected individually at original detail. Captured local/session strings were restored before returning home and verified unchanged after home hydration; pristine empty storage was then verified before closing the owned fallback context. Storage calls were not instrumented.

Lint and typecheck pass. Unit tests and JavaScript exports were not repeated for this copy-only change. Independent QA returned PASS WITH BOUNDED LIMITS for these three browser configurations and two fixtures, with no actionable findings. It corroborated the earlier geometry with a synthetic old-string DOM replay. The [evidence](../.playwright-mcp/concise-week-evidence.json) retains preview timeouts, the shared-browser lock failure, the corrected tab-name lookup, and the wait for new copy before a successful reload. Browser/CSS samples do not establish native rendering, OS text scaling, assistive-technology or every-paint behavior. Earlier extreme-count/resize/combined-outline observations and module 841/dev HTTP 500 remain open.

### Retry saved progress (October 24, 2026)

Saved-progress errors offer “try again” as the primary action. Starting a new journey keeps its warning and uses an outline button. In source, retry reopens storage through a versioned loader; duplicate retries and retry/reset overlap are guarded, and effect cleanup invalidates late reads. The font-error branch is unchanged.

In the sampled browser flows, temporary read errors and repeated decode failures retain the exact saved strings with zero instrumented game writes until recovery. Each successful recovery produces one hydration write of the original valid game. The three main configurations are 390×844 normal, 320×568 with 3× RNW CSS font-size/line-height and reduced motion, and 1280×900 normal. Supplementary controlled delays check held Enter, held Space combined with pointer activation, and focus moved to an external control. In the tested transitions, held activation does not reach the replacement control; failure returns focus to Retry, and success reaches the first visible game control when focus was lost. The tested external focus move is retained. The compact Retry button and all four focus-ring edges fit after scrolling. No reset or start-new-journey action was accepted.

The 50 evaluated browser checks run by the implementing agent pass. Seventeen source-effect probes execute extracted loader/guard functions with controlled callbacks and actual game decoding; they pass, but do not mount React or perform native I/O. Lint, typecheck, all 69 existing tests and current iOS/Android/web JavaScript/Hermes exports pass. Six selected final PNGs were inspected individually at original detail. Own Storage and AsyncStorage method descriptors were restored, pristine storage was verified, and only owned contexts were closed. The [evidence](../.playwright-mcp/startup-retry-evidence.json) retains the early observer/counting harness failures, two corrected focus failures, the source-probe compiler mistake, and preview timeouts. Independent QA returned a scoped pass for 12 sampled browser contexts and 245 overlapping assertions, plus 16 hook and nine provider source-effect probes. Its retained harness failures and cleanup record are archived with the evidence; no actionable regressions were found in that scope.

These are controlled browser/API, CSS, source and export checks. Native storage recovery/rendering, physical GPS/Health, OS text scaling, assistive technology and every-paint behavior remain unverified. Blocked reset branches were checked with source-probe sentinels; no erasure implementation was run. Earlier extreme-count/resize/combined-outline observations and module 841/dev HTTP 500 remain open.

### Quieter weekly chart values (October 24, 2026)

Weekly chart rows show locale-formatted counts without repeating “steps” seven times. The total keeps its unit, and the chart keeps its full DOM accessibility label. In source, only the row-value expression changes; total calculations, goal markers, styles and save functions are untouched.

The pre-edit DOM prototype measured the baseline demo card at 1,769 px in a 320×568 browser with 3× RNW CSS font-size/line-height overrides and reduced motion. The current-source browser sample with the same fixture and CSS settings measures 1,499 px, a 270 px reduction. It remains taller than the scrollport; the final row is reachable by scrolling. The 390×844 and 1280×900 normal-text samples retain their 425 px card height. Zero, missing-day, single-step and all-goals fixtures preserve the checked numeric values, total units, missing-entry labels and goal markers. Play/Camp navigation passes in all six cases.

All 104 overlapping browser checks across six sampled cases pass; lint and typecheck also pass. Each seeded context records one matching hydration game-key write; after hydration, the sampled formatting, scrolling and navigation interval records zero monitored game-key writes and retains the exact saved fixture. Fixture seeding/restoration is excluded. Eight selected final still PNGs were inspected individually at original detail. Original Storage.setItem descriptors and pristine local/session strings were restored, temporary CSS/helpers removed, and the six owned contexts closed. The [evidence](../.playwright-mcp/weekly-unit-evidence.json) retains the prototype, current-source checks and preview timeouts. Independent QA found no actionable findings within the copy-only source/browser scope. All 84 fresh checks across five isolated contexts pass; the current-source heights were measured independently of the earlier before-height prototype. Its sampled 1.05–1.47 second post-hydration intervals recorded zero game-key mutations. Transport and discovery failures remain archived.

This is browser/CSS and source evidence. Native rendering, OS scaling, browser zoom, screen readers and every-paint behavior remain unverified. Unit tests and JavaScript exports were not rerun for this single JSX formatting expression. Inherited extreme-count/resize/combined-outline observations and module841/devHTTP500 remain open.

### One reward amount on ready quests (October 24, 2026)

Ready, uncollected quests show XP on the collect button without repeating it in the description. Unfinished and collected quests retain their reward amount in the description. The source patch changes only this metadata conditional; claim actions, accessible button/group names, reward calculations, saving, focus code and styles are unchanged in source.

The pre-edit DOM prototype measured the first two ready cards at 526 and 598 px in a 320×568 browser with 3× RNW CSS font-size/line-height and reduced motion. The current-source sample measures 472 and 544 px, 54 px shorter per card than the DOM prototype. They remain taller than the scrollport and require scrolling. The normal 390×844 and 1280×900 samples retain 144 px ready cards. These are sampled browser measurements, not native sizing results.

All 90 overlapping checks across six sampled isolated browser cases pass; lint and typecheck also pass. In those browser fixtures, pointer and trusted Enter claims displayed +50, saved exactly one claimed quest while preserving other game fields, and restored the collected group's visible focus ring after reward dismissal. A controlled save failure retained the original stored bytes until Retry saved the expected claimed game. The 320 px initial/claim/focus interval used temporary 3× CSS font-size/line-height and reduced motion. Reload checks used normal CSS text at the same viewport and preserved the claimed game with one hydration write. Unfinished, all-ready and all-collected fixtures preserve the checked descriptions and DOM accessibility labels for rewards.

Nine selected final still PNGs were inspected individually at original detail. Original Storage.setItem descriptors were restored; apps were unloaded into owned inert cleanup pages before exact pristine local/session restoration. Temporary CSS/helpers/routes were removed and six owned contexts closed. The [evidence](../.playwright-mcp/quest-ready-copy-evidence.json) separates the DOM prototype from current-source checks and retains the prototype's transport/image-display/read-probe failures.

Independent QA returned PASS for the sampled source/browser scope, with no product findings. Its separate run recorded 97/98 passing assertions across three isolated contexts and five fixture phases. The failed assertion required a 2 px outline offset; the actual 3 px offset and 2 px outline fit all four measured clipping bounds. This review expectation error is preserved in the raw result and adjudication. Its single +50 claim, controlled save failure/Retry, normal-CSS reload, seven selected still PNGs and cleanup are recorded separately from the parent checks. All 42 source pins and protected package/log hashes matched before and after review.

Native rendering, OS scaling, browser zoom, screen readers and every-paint behavior remain unverified. Unit tests and JavaScript exports were not rerun for this metadata-only conditional. Inherited extreme-count/resize/combined-outline observations and module841/devHTTP500 remain open.

### One collection completion message (October 25, 2026)

The complete collection shows `6 / 6 collected` once. The redundant `all collected` caption is removed; unfinished collections keep their next-unlock level. Within this component, only this JSX conditional changes. The rest of the component, including unlock calculations, card actions, focus code and styles, matches the saved before source byte for byte.

The current 320×568 browser sample with 3× RNW CSS font-size/line-height and reduced motion measures a 108 px summary, versus 224 px in the pre-edit DOM prototype. Normal 390×844 and 1280×900 samples remain 18 px tall. The summary-to-grid gap remains 24 px in the checked cases. Compact captions were scrolled into view; these are not initial-screen or native sizing guarantees.

Corrected R2 records 91 passing overlapping checks across seven isolated, seeded browser cases at levels 1, 4, 11, 12 and 13. Counts, next-unlock captions and card names match the domain functions. Trusted Tab/Shift+Tab round trips return to the first companion with all four measured outline edges contained. This verifies DOM names and browser focus, not assistive-technology selection semantics. Five selected final still PNGs were inspected individually at original detail.

No game actions were activated. Each case retained exact fixture bytes with one expected hydration write and no additional monitored demo-game-key `setItem` calls during inspection/focus. The 390 px completed case also retained its fixture and caption after reload with one hydration write. Original `setItem` descriptors were restored; CSS/helpers were removed, apps unloaded before pristine local/session restoration, and seven owned contexts closed. Browser Date was fixed to October 24 noon in Chicago; OS time was untouched.

R1's 77/91 raw result is retained: 14 failed assertions assumed an `aria-selected` attribute and a focusable heading as Tab's origin. R2 corrected those harness assumptions without another production edit. R1 also retains one HTTP 500 before a successful desktop retry. The [evidence](../.playwright-mcp/collection-summary-copy-evidence.json) keeps those results separate from R2.

[Independent QA](../.playwright-mcp/collection-summary-copy-independent-r1/bruhs-collection-summary-copy-qa-r1.md) accepts the conditional in four sampled browser configurations. Its raw 69/72 result retains three broad whole-DOM geometry flags. A separate 3/3 clipping-aware follow-up found no visible horizontal overflow from the flagged boxes in inactive routes; this resolves those assertion flags only. Copy, the 24 px gap, the sampled 18/108 px completed heights and all four measured keyboard-outline edges passed. Fixture bytes were retained with expected hydration writes only, and the review records restoration and closure of its owned fallback resources. All 42 source pins and protected hashes matched before publication.

Lint and typecheck pass. Unit tests and JavaScript exports were not rerun for this copy conditional. Native rendering, OS scaling, browser zoom, assistive technology and every-paint behavior remain unverified. Prior extreme-count/resize/combined-outline observations and module841/devHTTP500 remain open; the separate runtime follow-up did not establish a cause or fix.

### Keep QA artifacts out of Metro (October 25, 2026)

The main preview's Metro config excludes `.playwright-mcp` through [Metro's blockList](https://metrobundler.dev/docs/configuration/#blocklist), extending [Expo's default configuration](https://docs.expo.dev/guides/customizing-metro/). The same generated folder is ignored by Git, and the new config is included in lint.

A temporary runtime probe captured two original unknown-841 errors. The captured sequence suggests that loader invalidation cleared a 999-module renderer registry before metadata's context lookup, leaving zero modules. Two earlier diagnostic rounds failed at their own guard; their 24 HTTP 500s are excluded from app-error counts.

Across the cases, there were 621 generated-JSON writes in total. The old server returned two original errors across 12 page requests. The watched candidate server loaded all 12 requested pages across 390×844, 320×568 and 1280×900 without captured page/console errors. Three selected Play stills were inspected. Earlier source-probe attempts failed on a wrong-root URL and initial file-visibility 404s. The corrected follow-up observed a source edit; its immediate generated-entry 404 remains timing-ambiguous. Installed-source review supports the exclusion. Temporary probe files were removed.

Independent browser QA passed 12/12 pages during 394 artifact writes, observed source BEFORE→AFTER, and received three blocked-entry 404s. After activating the reviewed config on the main preview, 6/6 page loads passed during 162 writes; three selected main Play stills were inspected. Owned Playwright storage was restored after unloading the apps. T3 snapshots timed out; storage and renderer teardown in those closed T3 tabs remain unobservable. The temporary candidate server was stopped.

Lint covers 80 files, and typecheck plus Android, iOS and web JavaScript exports pass. These are browser/build checks; native rendering, physical Health/GPS, OS scaling and assistive technology remain unverified. Source review found no blocking defect in the artifact exclusion and supports the two captured registry-clear sequences. Legitimate source changes may still trigger the underlying Expo race.

[Evidence](../.playwright-mcp/artifact-ignore-evidence.json)

### Keep quest rewards together (October 25, 2026)

Quest headers place a small glyph beside the title and give step captions the full card width. A measured title-font width selects tighter spacing for larger text in narrow cards. Existing font sizes and scaling settings are unchanged. “The scenic route” becomes “scenic route”; quest IDs, thresholds and XP bonuses are unchanged. Collected cards keep one check in the header.

Six browser layout samples cover 320×568, 390×844 and 1280×900 at normal sizing and 3× CSS font-size/line-height overrides. At 320×568 with 3× CSS text, sampled ready cards are 344 px high in a 359 px-high scrollport and can be shown fully by scrolling. Sampled normal ready cards remain 144 px high. Enlarged pending cards reach 402 px; their sections remain reachable by scrolling. Focus correction targets the active control, rather than revealing the whole card.

The parent’s compact reduced-motion claim flow passed 11 checks, including exactly 50 XP, one expected save and exact reload persistence. Independent QA returned a bounded pass across 42 matrix cases and 11 additional samples, with three keyboard claims and three pointer claims, exact 50/125/200 XP bonuses, reload persistence and save-error retry. Initial harness failures and corrected follow-ups remain in the evidence. All 12 isolated QA contexts restored their pristine local/session storage after unloading the app. Lint covers 80 files; typecheck, all 69 tests and Android/iOS/web JavaScript exports pass.

Two P3 observations remain open. Source math shows that web character-width rounding can delay compact spacing by a few pixels; this was not observed at runtime. During a pointer probe in the compact save-error state, the top 5 px of the collected marker’s focus outline was clipped; its text remained readable, and regression status is unknown. These are browser/CSS, source and export checks; native rendering, OS text scaling, assistive technology and every-paint behavior remain unverified. T3 snapshots timed out; the closed tabs’ storage/renderer teardown remains unobservable. General Expo source-invalidation and earlier extreme-layout observations remain open.

[Evidence](../.playwright-mcp/compact-quests-evidence.json)

### Keep quest focus and spacing clear (October 25, 2026)

Collected quest markers use the existing web inset focus ring, with horizontal space for its stroke. The second correction centers the wrapped row’s label vertically to address the normal-text top-stroke clearance regression found during initial review. The regression screenshots and requested changes remain in the evidence. Existing activation, focus and scrolling handlers are unchanged.

On the revised source after both corrections, the parent’s compact 320×568/3× CSS text and regular 390×844/normal-text save-error flows each pass six assertions. Selected original-detail still PNGs from those revised-source samples show the ring inside the marker and clear of its text in those frames. Held/released pointer samples retain their scroll position and create no extra storage mutations. Ordinary Space or wheel scrolling may move a focused non-action group outside the viewport; this correction does not promise to keep it visible through arbitrary scrolling.

Compact spacing also uses fractional web layout widths. At 372×844 with 2.25× CSS font-size/line-height overrides, the measured character was 22.328125 px wide while the old layout callback reported 22 px. The rounded threshold delayed compact spacing. The parent’s corrected sample selects compact spacing and reduces the ready scenic/trail cards from 317.5 px to 267.5 px high. The 374 px-wide comparison, using the same CSS overrides and ready fixture, retains normal spacing. These resizing/measurement samples create no progress writes. The source retains the existing layout-width fallback for native.

Lint covers 80 files; typecheck, all 69 tests and Android/iOS/web JavaScript exports pass on the revised source. All three owned parent browser contexts restored Storage descriptors before app unload, restored pristine local/session maps afterward, and closed. Earlier type-check failures and the corrected guards remain recorded.

Independent R2 source/browser QA returned a bounded pass for the centering and fractional-measurement changes and the exact compact save-error sequence. Two incorrect harness height assertions remain preserved alongside the passing corrected boundary rerun. The evidence distinguishes sampled browser/CSS behavior, still PNGs, source inspection and JavaScript exports from unverified native rendering, OS text scaling, assistive technology and every-paint behavior. The parent’s T3 snapshot attempts timed out twice; its closed tab’s storage/renderer teardown remains unobservable. The general Expo source-invalidation race and earlier extreme-layout observations remain open.

[Evidence](../.playwright-mcp/quest-marker-inset-evidence.json)

### Give Play’s quest caption room (October 25, 2026)

Play’s quest shortcut places its small glyphs beside the title and gives the progress/XP caption the full card width. A display-only nonbreaking space keeps each XP amount with its unit. The source retains the prompt calculation and navigation code; button names match in the 24 paired DOM samples.

The parent compared 24 browser samples at 320×568, 390×844 and 1280×900. From before source to final source, the compact enlarged-text pending cards shrink from 366 px to 312 px high in a 359 px-high scrollport. Normal 320 px pending cards shrink from 86 px to 72 px high. Underlying font-size and line-height settings are unchanged; enlarged-text samples used once-only 3× browser CSS overrides, not OS text scaling. In all 24 final geometry samples, card height plus 10 px fits the port; this comparison does not cover shorter error ports or every focus state.

The parent’s flow has 32 assertions total across two browser contexts: compact enlarged text and regular normal text. It covers trusted keyboard navigation, pointer caption navigation, one actual 50 XP claim/save per context, the updated 325 XP prompt, reload persistence and completed-shortcut navigation without claims. Actual keyboard focus outlines fit in those two samples, and the XP amount/unit ranges occupy one line. All eight final-source fallback contexts owned by the parent (six layout and two flow contexts) restored their Storage descriptors before unload, restored pristine local/session maps after unload and closed. Before and intermediate layout runs remain separate evidence.

Lint covers 80 files; typecheck, all 69 tests and Android/iOS/web JavaScript exports pass. Independent source/browser QA returned VERIFIED within its sampled scope: 24 layout cases and 445 assertions total across its main and follow-up runs, covering navigation, claim/save, reload, focus/resize and Retry. In its shorter save-error port, individual words, the caption and Retry were reachable by scrolling; the whole shortcut did not fit. All 11 headless contexts owned by the independent reviewer restored pristine storage and closed.

Browser CSS stress and still PNGs do not verify native rendering, OS text scaling, assistive technology or every-paint behavior. Both parent and reviewer T3 snapshots timed out twice; their tab closures were accepted, with storage/renderer teardown unobservable. General Expo source invalidation and prior extreme-layout observations remain open.

[Evidence](../.playwright-mcp/play-quest-evidence.json)

### Quiet the walking stamp list (October 25, 2026)

Distance stamps use lock/check shapes instead of repeated status lines. Each badge declares an image role and a label containing its name, distance and status, including “not reached” in a finished recap. Browser semantic snapshots contain those labels; the static badges add no Tab stops. The source comparison limits this change to stamp JSX, with existing styles and recording code retained.

The parent checked 48 browser states, including empty, paused and completed walks, at 320×568, 390×844 and 1280×900 with normal text and once-only 3× CSS font-size/line-height overrides; reduced motion was enabled at 3×. In the six paired before/after empty-walk samples, post-change scrollable content is 78 px shorter at normal text and 186 px shorter at 3×. Each sampled badge and its whole words remained reachable by scrolling; this does not mean the complete list fits onscreen. Selected still PNGs were inspected at original detail.

The current run passes 1,004 assertions total, including the matrix, cleanup and two Finish/Retry flows. At 320×568/3× and 390×844/normal, each saved paused fixture produces one failed route write and one successful Retry. Geometry and the stored game string survive reload and Back, with no game-key save in those action phases. These are synthetic saved routes; Start/Resume and physical GPS were not exercised. All six fallback contexts owned by the parent restored Storage descriptors, helpers and CSS before unload, restored pristine local/session strings after unload and closed.

Independent source/browser QA returned PASS within its sampled scope: 626 assertions across 24 layout states and one compact 3× saved-fixture Finish/Retry/reload scenario. It inspected 15 of its 29 original PNGs and confirmed named browser image nodes, actual Tab traversal, individual-badge reachability and exact route/game preservation. All six headless contexts owned by the independent reviewer restored pristine local/session strings after unload and closed. Its four software-WebGL warnings and 120 OpenFreeMap glyph-fetch/local-fallback warnings remain recorded; the map-font warnings’ timing and cause are unestablished.

Lint over 80 files, typecheck and Android/iOS/web JavaScript exports pass. The initial six-case harness’s wrong-readiness locator failures remain recorded separately from the current run. Parent and reviewer each recorded two T3 snapshot timeouts. Their owned-tab closure requests were accepted; T3 renderer/storage teardown remains unobservable. Native rendering, OS text scaling, assistive technology, every-paint behavior, the general Expo source-invalidation race and prior extreme-layout observations remain unverified or open.

[Evidence](../.playwright-mcp/quiet-stamps-evidence.json)

### Refresh native development projects (October 25, 2026)

Regenerated the ignored native projects from the existing Expo configuration after finding that the cached projects predated GPS maps. The previous projects remain in `/tmp/bruhs-native-build-r1/before`. App source, app configuration, package manifests and lockfile stayed unchanged.

- **Android:** `assembleDebug` passed for `arm64-v8a`. The resulting development APK passed signature verification and contains `libmaplibre.so`. It has no embedded JavaScript bundle and requires Metro. This is a debug-signed development build, with no install or runtime verification.
- **iOS:** CocoaPods installed MapLibre 11.5.0 and Expo Location 58.0.18. The first Xcode attempt waited in Keychain authorization and was cancelled. A retry using the documented `netrc` authorization provider, with no user `.netrc` present, resolved MapLibre Native 6.31.0, then stopped before compilation: Xcode reports that iOS 26.5 is not installed.

The generated iOS purpose strings include foreground location and Health read access, without Always-location or Health-write text or background modes. The APK declares coarse/fine location and `READ_STEPS`, without background-location, foreground-service-location or Health-write permissions. Expo's location-service components remain declared in the merged manifest; their presence does not establish runtime use.

Lint and typecheck pass. All 45 files in the preceding quiet-stamp pass's [source manifest](../.playwright-mcp/quiet-stamps-pins.json) retain their recorded SHA-256 hashes. Unit tests and JavaScript exports were not repeated because application source did not change. The preview returned HTTP 200 and its server stayed running. [Build evidence](../.playwright-mcp/native-build-evidence.json) retains the initial argument failure, cancelled Keychain wait, Xcode platform failure, build warnings and APK inspection.

Agent device access is restricted, and device automation is disabled in this environment. Native UI, GPS, Health, OS text scaling and assistive technology remain unverified. The earlier Expo invalidation race and historical map-font warnings remain open.

### Keep map reload focus (October 25, 2026)

Reloading a failed web map now moves focus from its disappearing button to the persistent **Walk map controls** group before the reload starts. The group has a negative tab index, so it adds no sequential Tab stop. Its inset ring stays inside the card in the inspected still PNGs. The reported input and navigation checks found no delayed focus override.

The parent run passed 257 assertions across 19 scenarios: Enter success and Space failure at 320×568, 390×844 and 1280×900 at normal sizing and with a one-time 3× CSS font-size/line-height override, plus seven held-key, pointer, focus, wheel, Back and guarded programmatic cases. Reduced motion was simulated in the 3× cases. Paused/completed route fixtures retained exact saved route/game strings, with zero monitored action writes after hydration. Six of 38 matrix PNGs were inspected at original detail.

[Independent QA](../.playwright-mcp/map-reload-independent-r1/bruhs-map-reload-focus-qa-r1.md) approved the reviewed web correction after eight scenarios, 110 assertions and 11 fresh PNG inspections at 390×844 normal and 320×568 with the same CSS enlargement. Its guarded geolocation methods recorded zero calls. Both runs restored their owned local/session storage strings and temporary instrumentation, then closed their isolated browsers.

Lint, typecheck and all-platform JavaScript exports pass (two HBC bundles, 12 HTML routes). Unit tests and native builds were not repeated for this web focus change. [Evidence](../.playwright-mcp/map-reload-evidence.json) preserves the initial incorrect Camp selector, corrected 16-document inspection, T3 snapshot timeouts, intentional network failures and WebGL warnings. All 45 files in the [source manifest](../.playwright-mcp/map-reload-pins.json) retained their recorded hashes during verification. Protected packages/configuration also remained unchanged during verification.

Agent device access remains restricted. Native behavior, OS text scaling, real assistive technology and every-paint behavior remain unverified. Direct-entry Back's BODY focus and the enlarged attribution panel are outside this correction; the Expo invalidation race and historical map-font warnings remain open.

### Leave room for the walk map (October 25, 2026)

By default, web map credits collapse when their text needs vertical scrolling; fitting credits stay open. A manual disclosure choice or focus inside the credits prevents automatic closure. Provider names, destinations and text-size settings are unchanged in source.

At 320×568 with a one-time 3× CSS font-size/line-height override, the initial 254 px credit panel on a 278 px map becomes a 58 px info control. Players can reopen the complete credits and scroll them. This follows [MapLibre’s guidance](https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/AttributionControlOptions/) to leave comfortably fitting attribution expanded.

The parent’s 11 browser scenarios pass 261 assertions across 320×568, 390×844, 1280×900 and 568×320 layouts. They cover normal/enlarged CSS text, trusted Enter/Space, provider links and focus rings, manual choices, resizing, already-focused credits and reload recovery. Four of 22 matrix PNGs were inspected at original detail. All 11 owned contexts restored their local/session storage strings and closed. App-document API patches were restored before unload; instrumentation reinstalled in the inert cleanup document was discarded with its context. The monitored action phase recorded zero storage mutations and geolocation calls.

Lint, typecheck and the web JavaScript export pass (12 HTML routes). Unit tests, native exports and native builds were not repeated for this web-only change. [Evidence](../.playwright-mcp/map-credits-evidence.json) retains the initial inspection’s reversed state labels, preview timeouts, intentional network failure and WebGL warnings. The [independent review](../.playwright-mcp/map-credits-independent-r1/bruhs-map-credits-qa-r1.md) has its own scope.

Manually opened credits still require scrolling. Short-screen maps may need outer scrolling. Native behavior, OS text scaling, real assistive technology and every-paint behavior remain unverified; agent device access is restricted. The general Expo invalidation race and historical map-font warning remain open.

### Keep reward amounts together (October 25, 2026)

A 200 XP reward split `+200` across two lines at 320 px and 375 px with enlarged CSS text. The reward now selects compact spacing when the numeral needs it, showing larger exact values in a smaller font. The tested 390 px reward at normal text sizing retains its previous numeral geometry and 40 px font size with 48 px line height.

Web measurement probes are inert. Their widths are read without the entrance animation's scale, addressing the hidden-focus and resize failures found in the first implementation. Native measurements still use layout events; native rendering remains unverified.

The corrected parent matrix passes 479 assertions across 23 sampled browser scenarios: compact, regular, desktop and landscape layouts; trusted 50/125/200 XP quest claims; controlled reducer events for 1,500 XP, goals and reward replacement; focus, scrolling, dismissal and resizing. Enlarged cases use a one-time 3× override of source CSS font size and line height, with reduced motion except two motion-enabled cases. There was one save per exercised game event and no extra monitored measurement, resize or dismissal writes. Six of 46 PNGs were inspected at original detail. All 23 owned contexts restored their local/session storage strings and patched Storage/geolocation methods before closing.

[Independent QA](../.playwright-mcp/reward-fit-independent-r2/bruhs-reward-fit-final-qa-r2.md) approves the correction within its sampled browser/source scope. The visible scroll area's focus ring still clips at the card edge during reverse wrapping with enlarged CSS text; Tab reaches the outlined action in the tested follow-up. This remains a separate P3 observation.

Lint, typecheck and all-platform JavaScript exports pass: 12 HTML routes and two HBC bundles. Unit tests and native builds were not repeated for this presentation change. [Evidence](../.playwright-mcp/reward-fit-evidence.json) retains the initial regressions, incorrect font and reverse-navigation test assumptions, transport failures and independent review records. The [45-file source manifest](../.playwright-mcp/reward-fit-pins-r2.json) stayed unchanged during the corrected parent matrix.

Long extreme values can still wrap, and enlarged or short layouts require scrolling. Native behavior, OS text scaling, real assistive technology and every-paint behavior remain unverified; agent device access is restricted. The general Expo invalidation race and historical map-font warnings remain open.

### Keep reward navigation in order (October 25, 2026)

Web reward controls now wrap directly between Close and Done or View bruhs in either Tab direction. This follows the [modal-dialog keyboard pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/). The current action ref is used after reward replacement. When the scroll viewport receives focus, browsers supporting CSS `:has()` draw its indicator inside the rounded reward frame, clear of the content's top edge. Source retains the existing inset viewport indicator when the CSS `:has()` guard does not apply.

The corrected parent matrix passes 548 assertions across 23 sampled Chromium browser scenarios. It covers compact, regular, desktop and landscape layouts, trusted 50/125/200 XP quest claims, and controlled actual reducer events for 1,500 XP, goals and held-press reward replacement. Enlarged cases use a one-time 3× override of source CSS font size and line height, with reduced motion except two motion-enabled cases. The run captured one save per exercised game event and no additional focus, resize or dismissal writes. All 23 exercised owned contexts restored their local/session storage strings and patched Storage/geolocation methods before closing.

Six of 92 final PNGs were inspected at original detail. Lint, typecheck and all-platform JavaScript exports pass (12 web HTML routes and two iOS/Android HBC JavaScript bundles). Unit tests and native builds were not repeated for this web interaction change. [Evidence](../.playwright-mcp/reward-scroll-evidence.json) preserves eight incorrect nonoverflow-focus assertions on an intermediate revision and a separate intermediate inset-ring screenshot concern. Independent review is recorded with that evidence. All 45 files in the [source manifest](../.playwright-mcp/reward-scroll-pins-r1.json) retained their recorded hashes during final parent verification.

Older-browser fallback rendering, native behavior, OS text scaling, real assistive technology and every-paint behavior remain unverified; agent device access is restricted. Extreme-value wrapping, the general Expo invalidation race and historical map-font warnings remain open.

### Make daily trail stops feel earned (October 25, 2026)

The daily trail counter starts neutral and turns green after reaching a stop. An earned stop gets a brief 92%-to-100% scale over the existing 250 ms motion token. Reduced motion updates the count and tint without that pulse. Source guards limit feedback to increased progress on focused, active Play with the same day and goal, while no reward is open. Installed API inspection and 22 mocked effect probes cover the native haptic branches; they do not verify haptic output.

The final parent Chromium runs pass 306 assertions across ten sampled scenarios. These cover 320×568, 390×844 and 1280×900 layouts, all four stops, replay guards, save failure/Retry, reload and resizing. Demo walks use trusted keyboard input; goal, hidden-progress and new-day checks use controlled reducer events and an advancing browser clock. Enlarged samples use one-time 3× CSS font-size and line-height overrides. Selected still PNGs were inspected at original detail. The sampled counter fits and save results match the domain functions; game-balance code was not edited.

Lint, typecheck and all-platform JavaScript exports pass (12 web HTML routes and two iOS/Android HBC bundles). Unit tests and native builds were not repeated for this presentation change. The [evidence record](../.playwright-mcp/trail-stops-evidence.json) keeps the earlier parent run's four clock-affected assertions and incorrect tab locator separate from the final checks and independent review. All ten final parent contexts restored their owned local/session strings and patched Storage, geolocation, vibration, visibility and Date descriptors before closing.

Native rendering, haptic feel, real Health/GPS, OS text scaling, assistive technology and every-paint behavior remain unverified; agent device access is restricted. Enlarged and short layouts require scrolling. The general Expo invalidation race and historical map-font warnings remain open.

### Trim repeated quest units (October 25, 2026)

Pending quests now show “5,000 left” below a target that already says “5,000 steps.” The DOM accessibility label retains the full “5,000 steps left” phrase, including singular “1 step left.” In the sampled 320×568 browser layout with one-time 3× CSS font-size and line-height overrides, the three zero-progress cards shrink from 402 to 348 px. Each can be scrolled wholly into the 359 px viewing area with 5 px clearance. This measurement excludes save-error notices.

The parent Chromium matrix passes 524 assertions across six normal/enlarged layouts at 320×568, 390×844 and 1280×900. Seven step fixtures cover pending, one-step remaining and ready boundaries; ready cards show no “0 left.” Two trusted keyboard flows collect all three rewards, save exactly 375 bonus XP, and retain the exact saved game after reload. Four of eight final still PNGs were inspected at original detail. All six owned contexts restored their local/session storage strings and patched Storage/geolocation descriptors before closing.

Lint and typecheck pass. Unit tests, JavaScript exports and native builds were not repeated for this copy/label change; layout settings and game-balance source were not edited. [Evidence and independent review](../.playwright-mcp/quest-left-evidence.json) record the separate prototype and final checks. Native rendering, OS text scaling, assistive-technology speech and every-paint behavior remain unverified. The general Expo invalidation race and historical map-font observations remain open.

### Keep walk status beside map controls (October 25, 2026)

Walk and GPS status now share the map toolbar with loading/error feedback. In the 320×568 normal-text browser sample, “paused” moves from below the viewing area into the visible toolbar. Shorter “loading…” and “GPS ±50 m” labels retain full DOM accessibility labels. GPS status remains nonlive; map loading/error keeps its existing polite announcement setting.

The final browser samples pass 928 assertions across 126 UI states in six normal/enlarged configurations at 320×568, 390×844, 360×780 and 1280×900. Enlarged cases use one-time 3× CSS font-size and line-height overrides with reduced motion. Active/GPS states use controlled component/provider values while the recorder stays paused. Separate actual paused Finish, failed save, Retry and reload flows preserve exact route geometry, elapsed time, distance and game/XP strings. No GPS calls or Start/Resume activation occurred.

Six final still PNGs were inspected at original detail. The focused error-plus-weak-GPS toolbar fits the tested 257 px viewing area after the existing focus reveal; short layouts still require scrolling. Normal phone canvas sizes remain 278×278 and 348×348 px. Lint, typecheck and all-platform JavaScript exports pass (12 HTML routes and two iOS/Android HBC bundles). Unit tests and native builds were not repeated for this presentation change.

[Evidence and independent QA](../.playwright-mcp/map-status-evidence.json) retain prototype restoration flags and corrected harness failures. Independent QA returned bounded approval with no actionable patch findings. Owned fallback contexts restored their local/session strings and patched browser APIs before closing. Native rendering, real GPS/Health, OS scaling, real assistive technology and every-paint behavior remain unverified; device access is restricted. The general Expo invalidation race and historical map-font observations remain open.

### Put completed walk results first (October 25, 2026)

In the tested browser layouts, completed walks show distance, time and earned stamps before the map. Save-error recovery follows the completed result; unfinished walks retain the previous order. In the normal 320×568 browser sample, the recap occupies y92–178 inside the 439 px viewing area. The web map's DOM accessibility label is now independent of where details appear.

The final browser checks pass 520 assertions across six normal/enlarged configurations and four fresh saved-walk loads at compact, regular and desktop sizes. Enlarged samples use one-time 3× CSS font-size and line-height overrides with reduced motion. Component/provider fixtures keep the recorder paused. Separate actual paused Finish, failed-save, Retry and reload flows preserve exact route geometry, elapsed time, distance and game/XP bytes. In each of the three exercised Finish/Retry sequences, the failed completed-route write and successful Retry carry the same serialized walk. The normal compact and regular samples keep the recap visible after Retry. No GPS calls or Start/Resume activation occurred.

Stable keys preserve the sampled stats, canvas and map identities through completion. Fresh saved loads verify full-route and marker framing separately from same-ID fixture swaps. Six final still PNGs were inspected at original detail. All ten final owned fallback contexts restored their local/session strings and patched browser APIs before closing.

Lint, typecheck and all-platform JavaScript exports pass (12 HTML routes and two iOS/Android HBC bundles). Unit tests and native builds were not repeated for this presentation change. The [evidence record](../.playwright-mcp/recap-order-evidence.json) retains the earlier helper and fixture-camera failures and separates the independent review rounds. Enlarged and short layouts still need scrolling. Native rendering, real GPS/Health, OS scaling, real assistive technology and every-paint behavior remain unverified; device access is restricted. The general Expo invalidation race and historical map-font observations remain open.

### 2026-10-25 — Live walk progress first

Put distance, walking time, and earned stamps before the map during live and paused walks. Save errors and Retry follow that progress. The idle view keeps its existing order. Shorten the visible controls to “pause,” “resume,” and “finish,” retaining their full accessibility labels and existing refs and handlers.

In the sampled normal-text layouts, the two actions share a row with an 8 px gap, reducing footer height by 64 px. In the sampled 320 px and 390 px layouts with one-time 3× CSS font-size and line-height overrides, the controls wrap into separate rows without splitting the labels. Progress appears before the map, whose dimensions remain unchanged in the tested browser states. Short or enlarged layouts still require scrolling.

Parent browser checks pass across 320×568, 390×844, and 1280×900 at normal text and one-time 3× CSS font-size and line-height overrides. The 54 UI states cover recording, paused, waiting, idle, completed, and errors. Four browser sequences using actual paused Finish, failed-save, Retry, and reload interactions each produce one failed and one successful route-write attempt with identical completed-route strings. Monitored game strings stay unchanged. Two additional contexts verify first-fix ordering, earned counts, resize focus, and preservation of the domain demo’s 5,829 XP. These sampled checks total 522 assertions. Recording and first-fix states are UI fixtures, with no real GPS or Start/Resume calls.

Lint, typecheck, and iOS/Android/web JavaScript exports pass. Unit tests and native builds were not rerun for this presentation change. Parent-owned storage strings were restored after app unload; patched API descriptors were also restored, and all eight isolated browser contexts were closed. Parent checks, still captures, retained failures, and receipts are recorded in [the evidence](../.playwright-mcp/live-walk-evidence.json).

Native rendering, real GPS/Health, OS text scaling, assistive technology, and every-paint behavior remain unverified. Device access is restricted and device automation is disabled in this environment. The general Expo source-invalidation race and inherited map-font observations remain open.

### 2026-10-25 — Direct-entry Back keeps keyboard context

Direct-entry browser checks reproduced Back leaving BODY focused on both the walk map and Health details. When no in-app history exists, Back now returns Explore to Play and Health to Camp. A matching one-time web query requests focus on the corresponding map or Health control, then clears. The existing focus guard prevents transfer when another visible control has focus. Existing in-app history continues to use Back.

Parent checks pass in browser viewports of 320×568, 390×844, and 1280×900 at normal text and one-time 3× CSS font-size/line-height overrides, with browser reduced motion in the enlarged cases. Across all six layouts, the matrix covers a total of 16 direct returns and 16 ordinary round trips, including held Enter, query consumption, visible focus frames, and preserved scroll positions. Space and pointer direct returns, reload, and browser Back/Forward have additional 390×844 normal-text coverage. Two controlled handoff-URL checks retain an already focused external control and do not replay after its removal. These sampled checks total 246 assertions: 234 matrix assertions and 12 assertions from the two controlled guard checks.

The checked flows retain exact saved game and paused-route strings, with zero monitored action writes after hydration and zero GPS calls in the checked flows. All 12 matrix PNGs were inspected individually. The eight matrix/guard contexts restored storage-method and geolocation descriptors, restored original local/session strings after app unload, and closed. Parent results, retained failures, and receipts are in [the evidence](../.playwright-mcp/direct-back-evidence.json).

Lint, typecheck, and iOS/Android/web JavaScript exports pass. Unit tests and native builds were not rerun for this UI navigation change. The native source path specifies the same fallback destinations without the web focus query; native navigation, OS text scaling, real assistive technology, and every-paint behavior remain unverified. Device access is restricted and device automation is disabled. The general Expo source-invalidation race and inherited map-font observations remain open.

### 2026-10-25 — Park grounds and clearer map paths

Park-ground polygons missing from the tested Central Park browser view now use bruhs green. The shared map definitions specify grass/park polygons below water and tint woodland with the same green. Dashed map paths use a lighter warm color. The source filter targets park grounds; the [tile schema](https://openmaptiles.org/docs/schema/#landcover) is linked as a reference. Other grass categories are excluded. Source edits are limited to the map definitions and the native/web map components.

The parent reports passing browser checks for the listed samples: 320×568, 390×844, and 1280×900 with normal text, plus 320×568 using one-time 3× CSS font-size/line-height overrides with a simulated reduced-motion preference. The samples cover Central Park, Epping Forest, zoom boundaries, layer definitions/order, exact synthetic route geometry, and recentering. Credits target sizes and Back/reopen behavior were checked in the regular normal-text and compact enlarged-text cases. All 12 final-source PNGs were inspected individually. Four initial recenter-locator timeouts are retained separately from the corrected run in [the evidence](../.playwright-mcp/map-green-evidence.json).

In the checked flows, exact saved game and route strings were retained; monitoring recorded zero post-hydration action writes and zero GPS calls. The four owned contexts restored their original local/session strings and Storage/geolocation descriptors before closing. Lint, typecheck, and iOS/Android/web JavaScript exports pass. Unit tests and native builds were not rerun for this styling change. Native source uses the same definitions; native rendering, real GPS/Health, OS text scaling, assistive technology, and every-paint behavior remain unverified. Device access is restricted and device automation is disabled. The general Expo source-invalidation race and inherited map-font observations remain open.

### 2026-10-25 — Blue water on walking maps

The source definitions for both map renderers specify `blueberry-950` for lake and coastline fills, matching the illustrated trail pond. Native rendering remains unverified. Browser layer comparisons against the preceding park/path baseline found only the intended water fill-color change.

The final browser samples cover 320×568, 390×844 and 1280×900 at normal text. The fourth configuration used 320×568 with one-time 3× CSS font-size/line-height overrides and the browser reduced-motion preference. All 114 assertions in the sampled browser checks passed. Central Park and San Francisco Bay were sampled in all four configurations; additional paint checks covered zooms 1, 8 and 16. Thirteen final PNGs were individually inspected at original detail. Earlier captures caught some labels mid-fade and remain archived; final captures waited for a fresh map idle event.

In the sampled flows, route geometry and saved game/walk strings stayed exact, and monitoring recorded zero post-hydration action writes or GPS calls. Recenter passed in all four configurations; Back/reopen passed at 390 normal and compact enlarged CSS text. The credits checks in `bruhs-map-water-matrix-r2.json` established the 48 px control size; disclosure behavior was not asserted. Owned local/session storage and patched descriptors were restored before all four contexts and their browser closed.

Lint, typecheck and iOS/Android/web JavaScript exports passed (12 HTML files and two HBC bundles). Unit tests and native builds were not rerun for this paint-only change.

[Evidence](../.playwright-mcp/map-water-evidence.json). Native rendering, OS text scaling, assistive technology, real GPS/Health and every-paint behavior remain unverified. The broader Expo invalidation race, map-font warnings and extreme-layout observations remain open.

### 2026-10-25 — Restore mapped water names

Loaded Central Park tiles contain water-name points that the provider's line-only label filter excludes. A shared symbol-layer definition restores those points with light-blue text and a dark-blue halo. The web layer is placed above the route; native source code requests layer insertion after `walk-trail`, with native rendering still unverified. Existing line-based water labels remain intact.

The final browser matrix passes 130 assertions across completed-route samples at 320×568, 390×844 and 1280×900 with normal text, plus 320×568 with one-time 3× CSS font-size/line-height overrides and a browser reduced-motion preference. Empty 390×844 and paused compact CSS3 supplements pass 67 more assertions. Reservoir/lake scenes, zoom paint checks, Recenter and selected Back/reopen flows preserve existing layer objects and route geometry. The one-time browser CSS overrides do not establish canvas-label scaling behavior.

Thirteen final matrix PNGs and seven state PNGs were individually inspected at original detail. The initial revision passed data checks but the route crossed some names; its source, captures and checks remain archived. Final captures show the corrected layer order. Expanded credits cover the reservoir name and companion in the normal compact sample; a separate trusted-keyboard collapse/reopen check preserves the camera and reveals both when collapsed. Its two PNGs were also inspected. The existing compact credits obstruction remains open.

In these sampled flows, saved game/walk strings remained exact and monitoring recorded zero post-hydration action writes or guarded location calls. Original local/session strings and patched API descriptors were restored in all seven owned fallback contexts before closing their three browsers.

Final lint, typecheck and iOS/Android/web JavaScript exports pass (12 HTML files, two HBC bundles). Unit tests and native builds were not rerun for this symbol-layer presentation change.

[Evidence](../.playwright-mcp/water-point-labels-evidence.json). Native rendering, OS text scaling, assistive technology, physical GPS/Health and every-paint behavior remain unverified. The broader Expo invalidation race, map-font warnings and extreme layouts remain open.

### 2026-10-25 — Respect wheel exploration

The web map treats the public wheel event as exploration, so a first wheel zoom can keep the player's chosen view across later location updates. In the recorded baseline trace, movement events lacked the wheel's original event and the next synthetic location update recentered the map. A shared handler covers movement and wheel events, minimizes unfocused credits, and releases its listeners when the map is removed.

Final browser input checks pass 108 assertions across 320×568, 390×844 and 1280×900 at normal text, plus 320×568 with a one-time enlarged-text simulation using 3× CSS font-size/line-height overrides and a browser reduced-motion preference. Separately, four browser camera cases at the same configurations retain first/repeated wheel views and resume following after Recenter. These use controlled recording-UI location updates while the actual recorder stays paused; no live GPS was used. Fourteen final PNGs were individually inspected at original detail.

Programmatic camera movement preserves expanded credits. Focused credits keep their visibility and focus during wheel zoom. Checks of selected Back/Open flows, sampled after navigation settles, report removal of the old shared handler and registration of one fresh handler. Expanded credits can still obscure content initially; focused credits intentionally remain open.

Earlier harness failures remain archived: premature Back cleanup sampling, a wheel pointer over enlarged credits, and a reduced-motion wait on unchanged marker screen position. Corrected checks use settled navigation, an exposed canvas point and geographic marker coordinates. In the final eight contexts, map-layer objects and saved game/walk strings stayed exact; monitoring recorded zero post-hydration action writes or guarded location calls. Original strings and patched descriptors were restored before the contexts and two browsers closed.

Lint, typecheck, eight focused camera unit tests and JavaScript exports targeting iOS, Android and web pass (12 HTML files, two HBC bundles). Native source is unchanged; native rendering, OS scaling, assistive technology and physical GPS/Health remain unverified.

[Evidence](../.playwright-mcp/map-exploration-input-evidence.json). The broader Expo invalidation race, map-font warnings, extreme layouts and every-paint behavior remain open.

### 2026-10-25 — Keep the recap companion clear

Web whole-route framing now measures the visible map credits. In the normal initial browser samples at 320×568, 390×844 and 1280×900, the full 52 px companion has a 12 px gap above the panel; the baseline hid 22–40 px. Recenter and recap resizing remeasure it. Credits toggles alone preserved the camera in the checked interactions.

Independent R1 QA found that delayed MapLibre CSS could invalidate the initial measurement. The map now waits for that stylesheet before construction, releases a departed screen’s waiters, reuses the shared download and discards failed links for Reload. Independent R2 approved the frozen web correction: all 159 behavior checks passed across nine owned Chromium contexts, covering delayed delivery, cached Back/Open, failed-load Reload, departure during loading, manual exploration, selected resizing and point-padding reset. The reviewer individually inspected all 35 fresh PNGs. R1 remains a historical Block; R2 closes its delayed-CSS finding within this sampled scope.

The primary agent’s separate recap matrix passed 101 assertions at the three normal configurations and 320×568 with one-time 3× CSS font-size/line-height overrides plus browser reduced motion. Its six-context stylesheet suite passed 88 assertions. The primary agent inspected 19 of its 30 fresh PNGs at original detail. Selected paused, empty and date-line provider-UI fixtures belong to those primary-agent checks; R2 did not rerun them. In these reported runs, the stored recorder remained complete, and no Start, Resume, Finish, GPS or Health action was used.

In the ten primary-agent and nine independent contexts, saved local/session strings and the 52 checked map-layer objects per context stayed exact after hydration, with zero monitored later writes or guarded GPS calls. Independent contexts each recorded one identical startup game save. Eight independent contexts have exact raw cleanup comparisons; one invalid listener comparison after Back remains archived, with a separate passing live-map cleanup follow-up. Owned original storage, descriptors, styles, probes and substituted provider identity were restored, then contexts and browsers closed. Browser-internal listener tables were not globally inspected.

Lint, typecheck and JavaScript exports targeting iOS, Android and web pass (12 HTML files and two HBC bundles). Earlier formatter/harness failures, redundant waits/timer work, deliberate CSS request failures and GPU warnings remain in the [evidence](../.playwright-mcp/map-credits-padding-evidence.json). T3 snapshot timeouts required isolated fallback; owned blank-tab closes were accepted, with renderer teardown unobservable.

Manually expanded enlarged credits can still obscure the companion. Extra padding measured before automatic collapse can persist until framing runs again, and a nonterminal stylesheet request can keep showing loading. The reported source comparison found no native-source changes. Native rendering, real GPS/Health, OS scaling, assistive technology, other engines, every-paint behavior and extreme layouts remain unverified. The general Expo invalidation race and map-font behavior remain open.

### 2026-10-25 — Put map recovery beside the error

Reload now follows the map status, before the canvas and unchanged guidance. In the measured 320×568 baseline, the error was visible while the button extended below the scrollport, even after bringing the map heading into view. The enlarged-text case required scrolling past the blank map and guidance. Existing spacing tokens now leave room around the button for its focus ring.

The primary agent’s four layout cases pass at 320×568, 390×844 and 1280×900 with normal text, plus 320×568 with one-time 3× CSS font-size/line-height overrides and browser reduced motion. Six completed/empty-walk flows pass trusted keyboard and pointer Reload, web focus return to the surviving map controls, and synthetic partial-map errors. Showing recovery retained the map and canvas; explicit Reload replaced them. Programmatic setup and reachability scrolling are distinct from the trusted Reload inputs. In these ten post-change contexts, saved local/session strings stayed exact, with zero monitored post-hydration action writes or guarded location calls. No Start, Resume, Finish, GPS or Health action was used. The primary agent inspected 12 selected original-detail stills of its 42 captures.

Independent QA approves the focused source/web change. Seven valid cases pass, including two held-Enter samples, retained camera state when recovery appears, exact route objects and all 52 checked layer objects at 21 stages. In its completed compact 3× recap, status and Reload start below the initial recap viewport, then fit together once the map heading is reached. Enlarged guidance and other controls remain reachable by programmatic scrolling without activation. The reviewer inspected 13 selected original-detail PNGs from 53 total captures (30 from valid cases). Seven earlier invalid harness cases remain archived separately from their corrected passing repeats. Across all attempts, 14 owned contexts and four browsers restored monitored original storage, descriptors, styles and probes, then closed. Managed T3 renderer teardown remains unobservable.

Lint, typecheck and JavaScript exports targeting iOS, Android and web pass (12 HTML files and two HBC bundles). Expected stylesheet failures, GPU warnings and T3 snapshot timeouts remain in the [evidence](../.playwright-mcp/map-recovery-placement-evidence.json). This changes shared Explore-screen layout; native rendering, OS scaling, assistive technology, real GPS/Health and every-paint behavior remain unverified. CSS simulation is distinct from OS or map-glyph scaling. Existing enlarged-credits overlap, the general Expo invalidation race, map-font behavior and extreme layouts remain open.

### 2026-10-25 — Shorter map-error guidance

The shared map-error helper says “GPS recording can continue.” Removing “check your internet” avoids assuming a network cause from a generic map failure. Reload supplies the action; this source change replaces only that string.

At 320×568, the helper measured 42→21 px at normal text size and 441→252 px with one-time 3× CSS font-size and line-height overrides plus browser reduced-motion emulation. Six controlled Explore presentation states were checked in four browser configurations. Status captions and controls matched the earlier samples in the two paired compact configurations; the regular and desktop samples were after-only observations. The actual recorder remained paused during presentation substitutions. [Measurements and scope](../.playwright-mcp/map-error-copy-parent-r1/bruhs-map-error-copy-root-summary-r1.json).

Separate completed-fixture checks passed keyboard and pointer Reload at compact normal and 3× CSS text sizes. Saved game/walk and local/session strings stayed exact after fixture hydration, with zero monitored Storage action writes or guarded geolocation calls across the six post-change root-review contexts. Five selected fresh PNGs were inspected individually. Lint and all-platform JavaScript exports passed; exports contain 12 HTML pages and two HBC bundles. These checks do not establish native rendering, OS scaling, assistive technology, physical GPS/Health or every-paint behavior. [Root evidence](../.playwright-mcp/map-error-copy-parent-r1/bruhs-map-error-copy-root-report-r1.md).

Independent QA returned PASS for the sampled source/browser change in four independent contexts: 13 fresh after-state presentations, one completed-fixture keyboard Reload and a typecheck with exit 0. Whole words were horizontally contained and reachable by scrolling. Its recovered frame verified route, marker and focus while `map.loaded()` was false; full basemap completion was not asserted. Raw preview timeouts and deliberate CSS/GPU diagnostics remain retained. The general Expo source-invalidation race and prior limitations remain open. [Independent report](../.playwright-mcp/map-error-copy-independent-r1/report.md).

### 2026-10-25 — Steps beside trail stops

The illustrated trail header shows current steps beside earned stops, replacing its static caption. The count is initially visible in the tested compact normal-text views; the count and goal shortcut below the illustration remain available. The shared formatter supplies “1 step” and grouped numbers.

The current source uses a level-two heading with the existing label typography; its name and level were checked in browser DOM/Chromium AX. This avoids relying on author naming for a generic container. [WAI-ARIA naming guidance](https://www.w3.org/TR/wai-aria-1.2/#generic).

Latest root-review checks passed across nine samples in four browser configurations. Seven paired samples matched the header, map, world and character boxes from the original static-caption source (before any count change) within 0.05 px; two 10,000-step samples were after-only checks. Normal typography remained 12 px with 18 px line height. With one-time 3× CSS font-size/line-height overrides and reduced-motion emulation, the header still needs scrolling; number and unit words stayed intact in the tested cases. Two of 17 fresh root-review PNGs were individually inspected. [Latest measurements](../.playwright-mcp/trail-counter-parent-r2/bruhs-trail-counter-root-summary-r2.json).

Two compact navigation flows in the root review retained the count through character/collection and daily-goal shortcuts. All six isolated contexts in the latest root review preserved hydrated local/session strings, including game progress, with zero monitored post-hydration Storage action writes or guarded geolocation calls. Lint, typecheck and all-platform JavaScript exports passed; exports contain 12 HTML pages and two HBC bundles. Earlier probe failures and limitations, including failed prototype restoration, remain archived separately. [Root evidence](../.playwright-mcp/trail-counter-parent-r2/bruhs-trail-counter-root-report-r2.md).

Focused independent R2 QA passed in two compact contexts: normal 1 step and 10,000 steps with 3× CSS text/reduced motion. It verified DOM/Chromium AX heading name and level, trusted Tab skipping, and one character/Play return. Two of its three fresh PNGs were individually inspected. [Independent report](../.playwright-mcp/trail-counter-independent-r2/review-report-final.md).

Browser AX is not real screen-reader speech. For this revision, native compilation/runtime and rendering, OS scaling, real assistive technology and its interoperability, physical Health/GPS, haptics, behavior during every rendered frame and the app’s heading outline remain unverified. Prior Expo invalidation, font and extreme-layout observations remain open.

### 2026-10-25 — Clear daily-trail completion

Completed trails say “daily trail done” in the map header, with the lower repeat removed. Unfinished trails retain their next stop, name and remaining steps. Completion is initially visible in the tested compact normal-text browser views.

Thirteen root-review states passed across compact, regular and desktop browser configurations, including compact one-time 3× CSS font-size/line-height overrides with reduced-motion emulation. Five paired completed samples reduced the lower objective from 74→48 px normally and 256→140 px with those overrides. The enlarged header wraps and still needs scrolling. Four normal-text pairs retained map, world and character geometry. Three of 17 PNGs were inspected individually. [Measurements](../.playwright-mcp/trail-complete-parent-matrix-r1/bruhs-trail-complete-after-r1.json).

Each of two isolated root goal cycles raised the goal from 8,000 to 10,000, then restored 8,000. Each made exactly two expected game saves, retained the goal/status nodes and 6,005 fixture XP, and restored the original game string. Browser DOM/Chromium AX checked the named status; trusted Tab skipped it, and hidden updates retained radio focus with the live region off. All six root contexts restored their original storage strings, Storage/geolocation descriptors and temporary CSS/readers. [Interaction evidence](../.playwright-mcp/trail-complete-parent-flow-r2/summary.json).

Independent review approved the frozen source/browser patch after 16 independent fixture samples across four configurations and one separate compact goal cycle. All nine independent PNGs were inspected individually. Incorrect formatter expectations were resolved through a separate adjudication of recorded DOM measurements and frozen source; the raw failed run remains archived. [Independent report](../.playwright-mcp/trail-complete-independent-r1/findings.md).

Lint, typecheck and iOS/Android/web JavaScript exports passed (12 HTML pages and two HBC bundles). Earlier prototype-cleanup and locator failures remain archived. Native rendering, OS scaling, real assistive technology, physical GPS/Health and every-paint behavior remain unverified. Prior Expo invalidation, font and extreme-layout observations remain open.

### 2026-10-25 — Dashes for missing days

Camp’s week chart shows a dash for a missing day. Recorded 0 and 1 stay numeric; the chart’s accessible description still says “no entry.” Only the visible fallback string changes in shared source.

Seven passing source-rendered browser cases cover compact, regular and desktop configurations. Three normal-text pairs kept chart/card heights; two compact pairs with one-time 3× CSS font-size/line-height overrides and reduced-motion emulation saved 372 px with six missing days and 186 px with three. In these cases, values and bar widths match the history functions. Three selected source PNGs were inspected individually. [Measurements](../.playwright-mcp/week-gaps-parent-r2/summary.json).

Independent browser QA approved four fresh compact cases at normal and 3× CSS text sizes. It verified exact values, scrolling, DOM/Chromium AX descriptions and keyboard behavior, with zero action writes or guarded GPS calls. Three primary PNGs were inspected individually. [Independent report](../.playwright-mcp/week-gaps-independent-r1/review-report.txt). Raw fixture, probe and selector failures remain archived alongside corrected passing checks; owned browser storage and instrumentation were restored.

Lint, typecheck and iOS/Android/web JavaScript exports passed (12 HTML pages and two HBC bundles). Browser/CSS and export evidence does not establish native rendering, OS scaling, real assistive technology or every-paint behavior. Earlier Expo invalidation, font and extreme-layout observations remain open.

### 2026-10-26 — Readable pressed goals

In the sampled browser holds, pressed daily-goal cards showed the existing raised background with text at full opacity. In sampled normal-text browser states, selected number contrast improved from 4.17:1 to 6.51:1 and the “steps” label from 3.70:1 to 5.62:1. Their 14 px and 12 px text needs 4.5:1 under [WCAG contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

Ten passing root hold states cover compact, regular and desktop configurations, including compact one-time 3× CSS font-size/line-height overrides with reduced-motion emulation. The earlier enlarged labels already met their 3:1 large-text target. Pointer holds were canceled off-target; Enter reselected the current goal. Selection, within-hold geometry and saved strings matched in these checks, with zero monitored post-hydration Storage action writes or guarded GPS calls. Three selected source PNGs were inspected individually. [Root evidence](../.playwright-mcp/goal-contrast-parent-r2/summary.json).

The completed independent review reported four passing canceled compact pointer holds at normal and 3× CSS text sizes. It verified contrast, unchanged words/type/geometry/selection, focus, release and exact storage restoration, with zero monitored action writes or guarded GPS calls. Two selected fresh PNGs were inspected individually. [Independent review](../.playwright-mcp/goal-contrast-independent-r2/review.json). Raw preview, generator and comparison failures remain archived alongside their corrections.

Lint, typecheck and JavaScript exports for iOS, Android and web passed. Native builds and runtime were not checked for this revision. These browser/CSS checks do not establish native rendering, OS scaling, real assistive technology or every-paint behavior. Earlier Expo invalidation, font and extreme-layout observations remain open.

### 2026-10-26 — Private weekly parties

The user confirmed private weekly step races with invite codes as the first-release competition mode. A configured Play screen opens these races with the existing bruhs art and spacing tokens. The form asks for sharing consent and discloses device-bound guest login. The board separates unread totals from zero, preserves ties, and offers profile editing, leave and profile deletion. Single-player progress and GPS routes stay local; optional native sharing submits current-week daily Health totals without awarding XP.

Independent SQL R2 review approved the foundation after Auth-cascade empty-party cleanup was added. Independent client R2 source review closed the dropped sharing-trigger and stale week-pagination findings. The primary agent then corrected held-action focus recovery and added an exact-version auth SDK patch for its uncovered initial-session storage rejection. Explicit storage failures still surface as session errors and preserve the saved guest identity; the SDK’s existing caught-error diagnostic remains. These later changes are distinct from the earlier R2 approval.

The final primary browser runs passed 37 two-player/storage-recovery checks and 21 keyboard/error checks against the owned local backend. The sampled configurations were 390×844 and 1280×900 normally, plus 320×568 with one-time 3× CSS font-size/line-height overrides and reduced-motion emulation. Create/join, synthetic server score display, profile changes, leave/delete, reload, failed-action recovery and deliberate focus/scroll guards passed within those flows. The six isolated contexts restored their initially empty local/session storage and patched descriptors; all four synthetic guest accounts were deleted. The primary agent inspected all 11 fresh viewport PNGs individually. Enlarged forms still require scrolling.

Lint, typecheck and all 86 tests pass. JavaScript exports targeting iOS, Android and web pass with 13 HTML pages and two HBC bundles. Provider probes simulate hooks, clocks and native Health responses; browser score fixtures are not physical Health uploads. The installed-SDK storage test failed before the patch and passed after without writes, signup or replacement identity. Original browser failures and the supplemental cleanup of an early untracked synthetic signup remain retained in the [evidence](../.playwright-mcp/party-release-evidence-r1.json).

This is not ready for public release. The backend is local only, iOS compilation remains blocked by the unavailable destination, and current native/runtime Health, GPS, battery, physical keyboard/safe-area behavior, OS text scaling and real assistive technology remain unverified. A hosted backend, release builds, store disclosures and production abuse controls are still pending. Guest recovery and attestation are not implemented. Earlier Expo invalidation, map-font and extreme-layout observations remain open; sampled browser checks do not establish every-paint behavior.

### 2026-10-26 — Shared backend workspace

The approved backend structure is `apps/api`, named `bruhs-api`, in this monorepo. It owns Supabase configuration, migrations and database tests; Outside is its first consumer. The private-party migration moved byte-for-byte. Future apps can add domain-specific data and permissions without introducing another repository or HTTP server now. A shared account experience is still future work.

The new local project started independently from the existing preview backend. Root commands `dev:api` and `check:api` work. Schema lint and 20 transactional pgTAP assertions passed; the database check bypassed Turbo caching. Fifteen smoke assertions used the actual app client/model with isolated in-memory AsyncStorage against the new API, covering creation, joining, scoring, ties, isolation, profile edits, session restoration, leaving and deletion. All three synthetic Auth users were removed; the new project's Auth and party tables were empty afterward. No Health or GPS calls were exercised.

Outside's lint, typecheck and 86 tests passed. All 86 app source files and the existing local connection file matched their pre-move hashes. The lockfile preserves existing importer/package/snapshot values and the auth SDK patch, adding only the pinned CLI dependency closure. A frozen offline install passed. The CLI's newer-version notice and initial missing optional seed-file warning remain recorded. An early draft lock serializer failed before writing; the corrected merge and installation passed.

[Independent code/config review](../.playwright-mcp/api-workspace-r1/source-review-r1/review.md) approved the scoped workspace move without findings. All 99 frozen files matched at review start and end; runtime checks were not rerun by the reviewer. This reorganization does not link or deploy a hosted backend or close native release gaps. No new JavaScript exports or native builds were run because the app source, dependencies and native configuration were unchanged. Existing physical Health/GPS, OS scaling, assistive-technology and production release limits remain. [Local verification evidence](../.playwright-mcp/api-workspace-r1/summary.json).

### 2026-10-26 — Concise party introduction

The party introduction now says “a private weekly step race.” It keeps the private, weekly competition meaning while removing the repeated fresh-start explanation. Sharing consent and the guest-recovery warning remain.

In browser samples at 320×568, 390×844 and 1280×900, the introduction’s rendered height decreased from 42 to 21 px and the name field moved 21 px higher. At 320×568 with one-time 3× CSS font-size/line-height overrides and reduced-motion emulation, its rendered height decreased from 315 to 189 px and the field moved 126 px higher. Enlarged forms still require scrolling.

Ten checks passed in each of four before-change flows and each of four after-change flows covering consent, invite validation, Back navigation and isolated-storage restoration. No signup attempts occurred. Five after-state PNGs were inspected individually. Lint and typecheck passed. Independent source review approved the exact text-only diff with no findings; all 90 frozen hashes matched at review start and end. Unit tests, exports and native builds were not repeated for this text-only change. Browser/CSS evidence does not establish native rendering, OS text scaling or assistive-technology behavior. A supplemental whole-word check passed; its earlier assertion included trailing line-break whitespace outside the text box and remains archived. [Evidence](../.playwright-mcp/party-intro-polish/after.json).

### 2026-10-26 — Quiet browser share aborts

The party screen handles browser `AbortError` without adding a failure message. [Web Share](https://www.w3.org/TR/web-share/#share-method) uses that error for both cancellation and no available share targets; the app cannot distinguish them from that error alone. The invite code remains selectable. Other rejections keep the existing copy guidance, and a new attempt clears an earlier error. Native rejection handling is unchanged.

Before the change, four browser fixtures reproduced the failure message after a simulated abort. They covered 390×844, 320×568 and 1280×900 normally, plus 320×568 with one-time 3× CSS font-size/line-height overrides and reduced-motion emulation. The synthetic party/session responses were intercepted; no accounts or invitations were created or sent. These checks use a mocked browser share result, not an OS share sheet.

The corrected browser samples passed 36 assertions across those four configurations. The initial 390 px navigation timed out; its rerun passed all nine assertions. Both results are retained. Lint, typecheck and all 86 tests passed. Independent source review approved the correction without findings and verified all 90 frozen hashes. Four after-state PNGs were inspected individually. The existing preview returned HTTP 200 between request timeouts; a diagnostic web export completed but overlapped the edit and is excluded from final verification. Native sharing, physical touch, OS scaling and assistive technology remain unverified. [Evidence and limits](../.playwright-mcp/party-share-cancel/summary.json).

### 2026-10-26 — Compact share recovery guidance

A failed party share now says “copy the code above.” The existing share button and its guidance form one group with an 8 px gap; the invitation’s larger 16 px spacing stays between its other parts. This removes redundant failure narration while keeping the recovery action clear.

In the tested 320×568 browser, the original normal-text message extended from y554 to y596; the shorter message occupies y546–567. With one-time 3× CSS font-size/line-height overrides and reduced-motion emulation, its height fell from 441 to 189 px and its bottom moved from y820 to y560. Both corrected samples fit the 568 px scrollport without added scrolling behavior. The button’s measured position and focus stayed the same.

All four final browser configurations passed 40 total assertions, including 390×844 and 1280×900 normal text. The fixtures simulate sharing and intercept party/session responses; they create no live accounts or invitations. Checks for abort handling, rejection guidance, retry success, and exact invite payloads passed. Browser localStorage and sessionStorage strings matched their post-hydration values in those samples. Four error-state PNGs were inspected individually. Lint and typecheck passed. Independent source review approved the scoped change without findings; all 90 frozen files matched at review start and end. Unit tests, exports and native builds were not repeated for this text/layout change. Native rendering, actual OS share sheets, OS text scaling and assistive technology remain unverified. [Evidence](../.playwright-mcp/party-share-feedback/after.json).

### 2026-10-26 — Readable party rows

Leaderboard names and totals now use their content width and can move below the rank and portrait. Short rows stay inline when they fit. The change replaces the fixed 120 px text basis and permits wrapping the whole text block instead of squeezing it beside the portrait. Existing text sizes, scaling settings and data labels remain.

A 320×568 browser fixture with 3× CSS font-size/line-height overrides previously split the last digit of “12,345” onto another line. With the fix, the fixture kept that numeral whole and reduced the first 24-character-name row’s height from 597 to 470 px. Long names can also make normal-text rows taller when their text moves below the portrait; this is the readability tradeoff.

Six size/text combinations covered 320×568, 390×844 and 1280×900 at normal and 3× CSS text. Separate fixtures checked zero, one, an unsynced value, ties and “1,234,567.” Trusted Enter on “more bruhs” focused the new row, 407 px high, with its complete outline inside the compact viewport. The browser fixtures intercepted party/session responses; no live accounts or shared scores were created. The localStorage/sessionStorage strings matched their captured post-fixture-hydration values. The captured fetch function, document visibility descriptor, and original localStorage/sessionStorage strings were restored. The temporary font override was removed before closing the owned tab.

Lint and typecheck passed. Independent source review approved the two-property change without findings and matched all 90 frozen files. Native rendering remains unverified. Unit tests, exports and native builds were not repeated for this flex-layout change. These sampled browser checks do not cover every valid total or locale, native layout, OS scaling or screen-reader speech. Reduced-motion preference stayed off; no motion setting changed. [Evidence](../.playwright-mcp/party-board-reflow/runtime.json).

### 2026-10-26 — Unbroken player marker

The leaderboard keeps “· you” together by using a nonbreaking space inside the marker. The ordinary space before it still allows the complete marker to move to the next line.

Paired browser measurements reproduced the split at 320×568 normally and with 3× CSS font-size/line-height overrides. With the fix, the dot and all three letters shared one baseline in four samples: 320×568, 390×844 and 1280×900 normally, plus the compact layout with 3× CSS font-size/line-height overrides. The paired compact row heights remained 145 px at normal text size and 470 px with the 3× CSS overrides. The paired row labels and step totals matched. Four isolated Chrome captures confirmed the joined marker and were inspected individually. Party/session responses used synthetic fixtures; no live accounts or invitations were created.

Lint, typecheck and independent source review passed; the 90-file source/package snapshot matched at review start and end. Unit tests, exports and native builds were not repeated for the text-only change. Original fixture storage and fetch state were restored. The read-only-visibility fixture failed before measuring any rows and was excluded; its corrected replacement covered all four layouts. Preview snapshot timeouts prevented PNGs there, so the separate Chrome captures supplied the final visual checks. These failures remain recorded. Native text layout, OS scaling and assistive technology remain unverified. [Evidence](../.playwright-mcp/party-you-marker/after.json).

### 2026-10-26 — Readable pressed daily progress

The daily step-goal shortcut uses the existing raised background for press feedback while keeping its text opaque. In the three tested normal-text browser sizes, the previous opacity treatment reduced the goal label's computed contrast to 3.948:1. The corrected browser samples had computed contrast of 5.624:1, above the [4.5:1 normal-text threshold](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). The prior enlarged-label samples already met the large-text threshold.

Paired samples covered 320×568, 390×844 and 1280×900 normally, plus 320×568 with one-time 3× CSS font-size/line-height overrides and reduced-motion emulation. Their idle button geometry, text styles and progress values matched before and after. All four corrected canceled pointer holds preserved focus, words and geometry, then restored the idle appearance. Two additional compact fixtures checked zero steps with a 4,000-step goal and a completed 10,000-step day. Pointer and Enter activation opened Camp, focused the selected goal, consumed the shortcut query and returned to Play without changing saved strings. The six corrected sessions recorded zero post-hydration Storage action writes or GPS calls.

Lint and typecheck passed. Independent source review approved the exact one-line style change without findings and verified all 95 frozen hashes at review start and end. The 95 files in the source/package snapshot still match their recorded hashes. The isolated browser contexts restored their original localStorage/sessionStorage strings and patched Storage/geolocation descriptors, removed text overrides and closed. Two collaborative-preview snapshot timeouts required the isolated Chrome fallback. Unit tests, exports and native builds were not repeated for this one-line style change. Browser/CSS sampling does not establish native rendering, physical touch, OS scaling, assistive-technology behavior or every pressed paint. Native/cloud release checks and the general Expo source-invalidation race remain open. [Evidence](../.playwright-mcp/play-progress-contrast/summary.json).

### 2026-10-26 — Opaque action feedback

Enabled shared buttons and quest claims retain their existing press scale without fading their text or surfaces. Outline and ghost labels also stay fully opaque. In normal-text browser samples, the previous fade reduced computed label contrast to 4.230:1 for the demo walk button and 4.269:1 for a quest claim. Both corrected controls computed to 5.988:1 against their pressed surfaces. The original enlarged-text samples already met the large-text threshold.

Canceled pointer holds checked both controls at 320×568, 390×844 and 1280×900 normally, plus 320×568 with one-time 3× CSS font-size/line-height overrides and reduced-motion emulation. Paired text, button sizes and press transforms matched. An initial large-text attempt lost its queried footer element before pointer-down; the retained failure is followed by a passing narrow rerun that waits for layout to settle. Two additional flows on browser fixtures used pointer activation at 390×844 and Enter at compact 3× CSS text. Each demo walk added 500 steps and 50 XP with one save; each quest claim added 50 XP with one save. Reward dismissal restored the collected marker's focus. Outline and ghost controls remained usable, and canceling reset kept the exact saved game through reload. All 14 corrected canceled pointer holds passed.

Lint and typecheck passed. Independent source review approved the two style edits without findings, including the preserved scales, disabled opacity and installed RN/RNW interaction semantics. The 95 source/package files match the hashes recorded in `.playwright-mcp/primary-press-contrast/freeze.json`. Isolated browser contexts restored original localStorage/sessionStorage strings and patched Storage/geolocation descriptors, removed CSS overrides and closed. Two collaborative-preview snapshot timeouts required Chrome fallback. Unit tests, exports and native builds were not repeated for these two pressed-style edits. Browser/CSS evidence does not establish native rendering, physical touch, OS scaling, assistive technology or every pressed paint. Native/cloud release checks and the general Expo invalidation race remain open. [Evidence](../.playwright-mcp/primary-press-contrast/summary.json).

### 2026-10-26 — Consent alignment with enlarged text

The party consent mark keeps its original first-line alignment in the tested enlarged-text browser layouts. A hidden, noninteractive single-line label measures the rendered line height. The mark retains its normal optical offset as that height grows. In 320×568 browser samples, the previous center offset was −7 px at 2× CSS text and −17.5 px at 3×; both corrected samples retain the normal +3.5 px offset. The native source uses layout height for the same intended alignment; native rendering remains unverified.

Five paired samples covered 320×568, 390×844 and 1280×900 normally, plus compact 2× and 3× CSS font-size/line-height overrides with reduced-motion emulation. Input dimensions, entered values and the consent name matched. A separate browser fixture changed text sizing from 1× to 3×, 2×, 1.5× and back to 1×, then resized to phone and landscape viewports. Alignment, consent and focus survived those settled changes. Tab order skipped the probe, and a DOM accessibility snapshot excluded it. Enter moved from name to invite code; invalid names and codes blocked submission. No account creation or joining was submitted.

The transition fixture recorded zero Storage action writes, GPS calls or Auth/REST requests after hydration. It restored the original localStorage/sessionStorage strings and patched Storage/geolocation descriptors, removed text overrides and closed. The five matrix contexts also restored their original saved strings and closed. Initial harness syntax and enabled-attribute assertion failures are retained with their corrections; the baseline alignment measurements remain usable. Two collaborative-preview snapshot timeouts required isolated Chrome fallback.

Lint, typecheck and independent source review passed; all 95 frozen source/package files matched the hashes in `.playwright-mcp/party-fields/freeze.json`. iOS, Android and web JavaScript exports completed successfully for this frozen source snapshot. These are bundle/export checks, not native build or runtime validation. Unit tests were not repeated for this local layout measurement. Browser/CSS and DOM accessibility evidence does not establish native rendering, OS font scaling, physical keyboards or touch, assistive-technology behavior or every-paint correctness. The general Expo invalidation race and native/cloud release checks remain open. [Evidence](../.playwright-mcp/party-fields/summary.json).

### 2026-10-26 — Party field errors and profile focus

Web name and invite-code fields now expose their existing inline errors as invalid states and field descriptions. Separate IDs from `useId` connect each visible error caption to its own field; empty or corrected values remove the metadata. The native source sets `accessibilityHint` for the same guidance; native runtime behavior and device speech remain unverified. Visible copy and validation rules stay the same.

The semantic-stage fixtures covered 390×844, 1280×900 and 320×568 with one-time 3× CSS font-size/line-height overrides and reduced-motion emulation. Chrome's accessibility tree previously reported no description and a false invalid state for both invalid values. Corrected fixtures exposed the exact messages, distinct targets and cleared metadata after correction. The initial semantic-stage fixtures passed their name, focus, consent-gating and saved-string checks. All six before/after screenshots were byte-identical. These checks preceded the final profile-focus edits; the field metadata and validation branches remain unchanged in the final source.

Profile checks also reproduced lost browser focus on Cancel at normal and compact 3× CSS text sizes, and on opening the editor at normal size. Both transitions now reuse the existing guarded party-action focus handoff. In the two final profile fixtures, pointer, Enter and Space focused the name field on entry and returned to Edit on cancellation. The next Tab reached Leave Party; reopening discarded unsaved edits and cleared the old error metadata. During their measured post-hydration interaction windows, the two final profile fixtures made only intercepted home/board reads, with zero Storage writes, guarded GPS calls or external Auth/REST requests. No profile save, account creation, joining or score mutation was invoked in those runs. Fixture cleanup restored original localStorage/sessionStorage strings, captured fetch and Storage/geolocation descriptors, removed text overrides and probes, and closed the contexts.

Lint and typecheck passed on the final source. R1 source review approved the semantic changes; R2 approved the complete patch and both focus handoffs. iOS, Android and web JavaScript/Hermes exports passed for the current source. These are bundle/export checks, not native build or runtime validation. The current 95-file source/package snapshot is `.playwright-mcp/party-field-errors/freeze-r2.json`. Unit tests were not repeated for field metadata and integration with the existing focus helper. Two collaborative-preview snapshot timeouts required isolated Chrome fallback. Browser/Chrome accessibility-tree evidence is not screen-reader speech or native runtime validation. OS text scaling, physical keyboard/touch, native/cloud release checks and the general Expo invalidation race remain open. [Evidence](../.playwright-mcp/party-field-errors/summary.json).

### 2026-10-26 — Fresh party form after profile deletion

In the checked local browser flows, successful party-profile deletion clears the entered name, invite code and consent, then returns to the create form. A failed deletion keeps the entered details. The local adventure remains saved. The original real-backend run removed the account and shared data correctly but left the old name for all three test players; one join form also retained its code and checked consent.

Three isolated Chrome players exercised actual local Auth, API and database calls. The corrected run passed 55 checks covering creation, consent-gated joining, party isolation, rankings and ties, profile edits, repeated/lower totals, reload, departure and deletion. Daily totals were synthetic inputs to the authenticated RPC, not physical Health readings. A demo walk added 500 local steps and 50 XP without uploading them. Deletion was checked at 390×844 and 1280×900 normally and at 320×568 with one-time 3× CSS font-size/line-height overrides and reduced-motion emulation. Opening the join form after deletion found an empty code and unchecked consent. A deliberately aborted delete request preserved the form, identity, database counts and exact local game string; a fresh confirmation then deleted that profile.

All three owned Auth users, profiles, memberships, shared-score rows and both parties were removed through the app. Database counts returned to the initial zeros; the fallback cleanup deleted zero rows. The isolated contexts restored their captured localStorage/sessionStorage strings and geolocation descriptors, removed CSS overrides and closed. Seven final PNGs were inspected individually. The compact enlarged-text captures show the upper scroll area; field reset evidence there comes from DOM checks and interactions. A separate desktop failure capture shows recovery guidance above the visible reading area; that placement remains open as LIVE-PARTY-O1.

Lint, typecheck and all 86 tests passed. The current 95-file source/package snapshot is `.playwright-mcp/live-party-flow/freeze.json`. Independent source review approved the scoped callback change without findings and matched all 95 frozen files at review start and end. JavaScript exports and native builds were not repeated for the local state-reset callback. Two collaborative-preview snapshot timeouts required isolated Chrome fallback. The retained diagnostics include the expected stale-invite 400, three logout 403s after Auth deletion, and the injected connection failure; local auth strings still cleared. Browser/CSS and local-backend evidence does not establish native Health/GPS, OS scaling, assistive technology, cloud release or every-paint behavior. The general Expo invalidation race and other existing release limits remain open. [Evidence](../.playwright-mcp/live-party-flow/summary.json).

### 2026-10-26 — Party recovery beside the failed action

In the tested browser flows, Leave Party and Delete Party Profile network errors appear directly above their matching controls with shorter copy. Session and unreadable-data failures also offer a separate Refresh action. Refresh checks the party without repeating Leave/Delete and closes any armed confirmation. Another destructive attempt still needs a fresh confirmation. Other party errors retain their header recovery.

The original compact 320×568 browser with 3× CSS font-size/line-height overrides put a 567 px generic error thousands of pixels above the focused action. The final 56-check network-layout matrix passed at 390×844 and 1280×900 normally and 320×568 with one-time 3× CSS overrides and reduced-motion emulation. A separate 95-check reconciliation matrix passed twelve joined/unjoined session/data states at the same three configurations. At the sampled reconciliation checkpoints, the applicable error, Refresh control and departure control were visible; Refresh made Home reads, preserved the exact local game and did not send another destructive request. Refresh also cleared an already-armed deletion confirmation.

The separate 39-check delayed-response guard run preserved BODY focus and the compact 1806 px reading position after wheel scrolling. Previously, automatic confirmation focus moved it to 2586 px. Web wheel/touch-start listeners cancel that pending return-focus intent; touch-start has source coverage rather than physical-touch proof. Held Enter repetitions and fresh Space activation passed. A separate 56-check broader local-backend regression passed race creation, joining, ranking/ties, rename, reload, departure, deletion and the unjoined failure layout. These samples support the browser recovery improvement for LIVE-PARTY-O1.

The runs used real local Auth/API/database calls with synthetic players. The reconciliation matrix deliberately supplied session/data failure responses; race totals were synthetic RPC inputs rather than physical Health readings. An additional 14-check controlled probe removed only its captured synthetic Auth user, simulated one Delete authorization response, then used real Home/Auth reads to clear the stale login without another Delete request. Natural deletion of an already-deleted user had returned success; that earlier timeout is retained as an invalid reproduction, alongside the first probe's SQL command-tag assertion error.

The matrix, guard and race players were deleted through the app. The controlled invalidation probe removed its own account separately. Every final run returned database counts to its initial zeros with zero fallback row deletions. Isolated contexts restored their captured localStorage/sessionStorage strings and geolocation descriptors, removed CSS overrides and closed. Still captures mask invitation text. The earlier compact recording covers the preceding network-error layout; it does not verify the added Refresh controls.

Lint, typecheck and all 90 tests passed. iOS, Android and web JavaScript/Hermes exports passed for the current 95-file source/package snapshot, `.playwright-mcp/party-error-recovery/freeze-r3.json`; these are not native build/runtime checks. R1 source review was superseded after the scroll finding. R2 requested the missing unjoined Refresh correction; R3 source/mock review approved the complete correction without further findings and matched all 95 frozen hashes at start and end. Two collaborative-preview snapshot timeouts required isolated Chrome fallback. Native execution, physical Health/GPS, OS font scaling, assistive-technology speech, cloud release and every-paint behavior remain unverified. The general Expo invalidation race and other release limits remain open. [Evidence](../.playwright-mcp/party-error-recovery/summary-r3.json).

### 2026-10-26 — Quest entry keeps keyboard focus

In the tested browser flows, opening Quests from Play now focuses the “daily quests” heading; the next Tab reaches the first ready reward. Previously, all three shortcut samples left BODY focused and Tab jumped to the Camp opener. The screen reuses the existing guarded focus helper through three integration lines. The ready, pending and collected navigation samples preserved tab-arrow focus, logical Back/Forward focus and focus explicitly moved to the Camp tab.

A 24-check single-claim pass and a separate 90-check navigation pass succeeded at 390×844 and 1280×900 normally, plus 320×568 with one-time 3× CSS font-size/line-height overrides and reduced-motion emulation. A separate 24-check two-claim flow at normal phone and compact enlarged-text sizes awarded exactly 175 XP, saved twice, reached level 5 and focused NEW Night without equipping it. Reload preserved the exact saved string and did not replay the reveal. The single-claim cases awarded 50 XP, saved once and returned focus to the collected marker after reward dismissal. These were trusted browser interactions with synthetic local game saves, not physical walks.

All 14 final isolated contexts restored their captured localStorage/sessionStorage strings and patched Storage/geolocation descriptors, then closed. The final runs recorded zero guarded GPS calls or Auth/REST requests. The navigation matrix recorded zero post-hydration Storage writes; claim flows made their expected saves. An earlier guard attempt used incorrect lowercase accessible names and was interrupted; its locator failures and partial cleanup limits remain archived. Two collaborative-preview snapshot timeouts required isolated Chrome fallback. Seven selected final stills were inspected individually; they do not establish every-paint correctness.

Lint, typecheck and all 90 tests passed. iOS, Android and web JavaScript/Hermes exports passed; these are not native build/runtime checks. Independent source review approved the three-line integration without findings. All 95 source/package files match `.playwright-mcp/quest-loop-focus/freeze.json`. Physical Health/GPS, native rendering, physical touch/keyboards, OS scaling, assistive-technology behavior and cloud release remain unverified. The general Expo invalidation race and other release limits remain open. [Evidence](../.playwright-mcp/quest-loop-focus/summary.json).

### 2026-10-26 — Camp entry and Back focus

In the tested web flows, opening Camp from the avatar focuses its heading, and Tab reaches the selected daily goal. When history returns to the opener's route, Back restores the avatar or daily-goal control that opened Camp. Hidden header copies no longer claim another control's return or steal the Quests heading. When tab history instead returns to Play, the tested path focuses the Play tab. Routes with their own page heading retain that handoff, and existing focus on another control takes priority. A prior-build browser comparison confirmed the same Play history target; this change does not alter that policy.

The final browser pass used actual browser interactions with synthetic local saves and completed 288 assertions: 24 across three avatar-entry/history cases and 264 across 21 navigation/goal-layout cases. Conditions were 390×844 and 1280×900 normally, plus 320×568 with one-time 3× CSS font-size/line-height overrides and reduced-motion emulation. Checks covered repeated Back/Forward, actual goal-opener ownership, later Quest entry, tab focus and reading position, nested Health return, map and party return, and held Enter followed by a fresh activation. Delayed goal measurements preserved selected-radio focus when unattended and respected wheel scrolling, away/back scrolling, Tab and leaving the route. Nine selected final stills were inspected individually; they do not establish every-paint correctness.

The sampled final interaction windows recorded zero Storage action writes, guarded GPS calls or Auth/REST requests; the synthetic local game string stayed exact. All 24 final contexts restored their captured localStorage/sessionStorage strings and patched Storage/geolocation descriptors, then closed. The 21 guard contexts also restored their captured application-page ResizeObserver descriptors. Initial failed app navigations retain partial-cleanup limits. Earlier selector, desktop wheel-target, history-expectation, transport and lint failures remain archived with their corrections. Two collaborative-preview snapshot timeouts required isolated Chrome fallback. The read-only baseline server was stopped; the main preview remains available.

Lint, typecheck and all 90 tests passed. iOS, Android and web JavaScript/Hermes exports passed; these are not native build/runtime checks. All 95 source/package files match `.playwright-mcp/profile-entry-focus/freeze-r3.json`. R1 source review was interrupted and unapproved; R2 source/mocked review approved the preceding ownership correction. Final R3 independent source/mocked review approved the home-tab fallback without findings. Native rendering, physical Health/GPS and input, OS scaling, actual assistive technology, cloud release and every-paint behavior remain unverified. The general Expo invalidation race and other release limits remain open. [Evidence](../.playwright-mcp/profile-entry-focus/summary-r3.json).

### 2026-10-26 — Companion entry and Play return focus

In the tested web flows, opening the collection from Play's trail character focuses the “bruhs” heading; the next Tab reaches the first available companion. Previously, all six empty/demo fixtures left BODY focused and Tab reached the Camp opener. Browser Back now focuses the Play tab on that return path. Initial Play loading keeps its existing unfocused state. Valid unlock reveals retain card focus, while tab navigation keeps its selected tab and reading position. Existing map, party, daily-goal and avatar opener returns retain priority in the tested regressions.

Four final browser suites passed 444 assertions across 38 isolated contexts with synthetic local saves. Samples used 390×844 and 1280×900 normally, plus 320×568 with one-time 3× CSS font-size/line-height overrides and reduced-motion emulation. The phone and compact two-quest flows used trusted browser input. Each awarded 175 XP, saved the game twice, reached level 5 and focused NEW Night without equipping it. Reload preserved the saved game string without replaying the reveal. Cold valid/locked reveal links and delayed goal focus/scroll cancellation also passed. Eleven selected final still PNGs were inspected individually; this is sampled settled-layout evidence.

The 36 final non-claim contexts recorded zero post-hydration Storage action writes. All final contexts recorded zero guarded GPS calls or Auth/REST requests. All 38 restored their captured localStorage/sessionStorage strings and patched Storage/geolocation descriptors, then closed; the 21 goal/navigation guard contexts also restored their captured application-page ResizeObserver descriptors. Two collaborative-preview snapshot timeouts required isolated Chrome fallback. An earlier stopped preview caused 32 navigations to fail before app assertions; all those contexts closed, but storage restoration remains unverified for 11. Their failures and the preview's unknown exit cause remain archived. The recovered preview returned HTTP 200; its shared log also contains an unattributed `Web ERROR null`.

Lint, typecheck and all 90 tests passed. iOS, Android and web JavaScript/Hermes exports passed; these are not native build/runtime checks. Independent source/mock review approved the four-file integration with 167 targeted assertions and no findings. All 95 source/package files match `.playwright-mcp/companion-entry-focus/freeze.json`. Physical Health/GPS and input, native rendering, OS scaling, actual assistive technology, cloud release and every-paint behavior remain unverified. The general Expo invalidation race and other release limits remain open. [Evidence](../.playwright-mcp/companion-entry-focus/summary.json).

### 2026-10-27 — One daily-step count on Play

Play's illustrated trail now leads with its stop counter or completion message. The repeated daily-step heading is removed; the exact total remains beside the daily goal, including its DOM accessibility label. In the tested 320×568 browser layouts with one-time 3× CSS font-size/line-height overrides, the trail card is 62 px shorter. The completed card measures about 327 px and fits in the 359 px visible scrollport after scrolling it into view. Card heights stay the same in the sampled normal-size browser layouts.

The final browser pass completed 153 assertions across nine empty/ready/collected layout cases and three demo-walk flows. Samples used 390×844 and 1280×900 normally, plus the compact CSS-text sample with reduced-motion emulation. Enter, Space and pointer demo-walk activations each added 500 steps, awarded 50 XP and made one game-key save. The first earned stop's polite DOM status, goal shortcut/return, companion entry/return and reload persistence passed. These are trusted browser inputs on synthetic local saves, not physical walks or native accessibility speech.

The nine non-action cases recorded zero post-hydration Storage writes. All 12 final contexts recorded zero guarded GPS calls or Auth/REST requests, restored their captured localStorage/sessionStorage strings and patched Storage/geolocation descriptors, then closed. The 11 earlier inspection/prototype contexts also restored and closed. Selected stills were inspected; the final compact completed PNG is byte-identical to the inspected prototype capture. Two collaborative-preview snapshot timeouts required isolated Chrome fallback.

Lint, typecheck and all 90 tests passed. Independent source review approved the caption trim without actionable findings; browser checks remain a separate root-owned scope. All 95 source/package files match `.playwright-mcp/play-trail-density/freeze.json`; only `AdventureMap.tsx` differs from the preceding companion pass. Platform exports were not rerun for this caption-only deletion; preceding exports do not verify this revision. Native rendering, physical Health/GPS and input, OS scaling, actual assistive technology, cloud release and every-paint behavior remain unverified. The general Expo invalidation race and prior unattributed preview-log error remain open. [Evidence](../.playwright-mcp/play-trail-density/summary.json).

### 2026-10-27 — Recap visibility with expanded map credits

In sampled browser recaps with enlarged CSS text, measurements after Recenter show a gap between the companion marker and manually expanded map credits. At 320×568 with 3× CSS font-size/line-height overrides, the earlier credits window covered the marker after Recenter. The final window measures 120 px instead of 236 px and leaves a 12 px marker gap. The measured normal-phone and desktop text windows remain 52 px high.

Credits stay open and scrollable. Focusing a credit link restores the previous reading height so its focus outline fits; that larger reading panel can cover the companion. Clicking Recenter restores the smaller window in the tested flow. The height floor uses one nominal [computed line-height](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/length) plus existing padding; it does not establish native glyph fit. The retained height declaration is an intended fallback when an engine rejects `lh`; that behavior has source/logic review only.

The final five-configuration matrix and compact follow-up pass 145 assertions across six isolated browser contexts. Samples use 320×568, 390×844 and 1280×900 normally, plus 320×568 and 390×844 with one-time 3× CSS text overrides and reduced-motion emulation. All three attribution links remain reachable by Tab, and all 15 main-matrix link-outline measurements fit their scroll windows. Wheel scrolling preserves the camera. Manual pan survives disclosure toggles; direct reading-to-Recenter and expanded-credit resizing retain the tested marker clearance. Six selected before/prototype/final stills were inspected individually.

All six final contexts preserve their synthetic game/route strings with zero post-hydration Storage writes, guarded GPS calls or Auth/REST requests. Captured localStorage/sessionStorage strings and patched Storage/geolocation descriptors were restored before closing. The earlier clipped copyright outline, omitted copyright symbol in a test expectation and pre-idle pan comparisons remain archived with their corrections.

Lint, typecheck and all 90 tests pass. Web export passes, with the styles present in all 13 static HTML files. Independent source review approved the CSS correction without actionable findings; browser and export validation remain a separate root-owned scope. All 95 source/package pins match; only `+html.tsx` differs from the preceding trail-caption pass. Native exports were not rerun. Native build/runtime, physical Health/GPS and input, OS scaling, actual assistive technology, other engines and every-paint behavior remain unverified. Earlier extreme-layout, Expo-invalidation, intermittent map-font and unattributed preview-log observations remain open. [Evidence](../.playwright-mcp/map-credits-visibility/summary.json).

## 2026-10-27 — Readable tab press feedback

In sampled browser pointer holds, inactive tab labels now calculate to 5.62:1 contrast instead of 4.14:1. `AdventureTabBar` keeps labels and icons opaque and uses the existing raised surface for press feedback. Selection, sizing and spacing have no source diff. The calculation uses computed sRGB colors and ancestor opacity; it is not an antialiased-pixel measurement or app-wide accessibility certification. Normal 12 px inactive labels previously fell below the [4.5:1 text threshold](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). Selected labels already passed, and the 36 px CSS-scaled labels already exceeded the 3:1 large-text threshold.

The final browser runs pass 280 aggregate assertions across ten isolated contexts: 20 canceled pointer holds with separate color/geometry measurements, followed by 55 trusted navigation steps in a separate run. Samples use 320×568, 390×844 and 1280×900 normally, plus 320×568 and 390×844 with one-time 3× CSS font-size/line-height overrides and reduced-motion emulation. Pointer clicks, arrows, Home/End and held Space/Enter retain the tested selection, roving focus and release behavior. Space retains its existing direct-selection behavior; it does not gain a raised held surface. Five selected before/after stills were inspected individually by the root reviewer.

All ten final contexts preserve the hydrated synthetic game string and record zero monitored post-hydration Storage writes, guarded GPS calls, Auth/REST requests or page errors. Captured localStorage/sessionStorage strings and patched Storage/geolocation descriptors were restored before closing the contexts and browsers. The five baseline contexts were restored separately. Two T3 snapshot timeouts remain archived; the owned preview tab's close was accepted, while renderer teardown remains unobservable.

Lint, typecheck and all 90 tests pass. Export completed for iOS/Android Hermes bytecode and 13 static web pages; this does not establish native compilation or runtime behavior. Independent source review approved the correction without actionable findings, checked the installed press-wrapper semantics and recalculated the contrast. Its source-only scope is separate from the root browser, lint/typecheck/test and export checks. All 95 source/package pins match; only `AdventureTabBar.tsx` differs from the preceding map-credits pass. Native ripple, physical input and Health/GPS, OS scaling, actual assistive technology, cloud/release and every-paint behavior remain unverified. Earlier extreme-layout, Expo-invalidation, intermittent map-font and unattributed preview-log observations remain open. [Evidence](../.playwright-mcp/tab-press-contrast/summary.json).

## 2026-10-27 — Native quest heading semantics

The native quest-name `Copy` now requests the `header` accessibility role. The installed React Native 0.88 source maps that role to the iOS header trait and Android heading metadata. Actual native rendering and VoiceOver/TalkBack navigation and speech remain unverified. The diff changes one native-branch prop, with no style, copy, web-branch or reward-logic changes.

Before the correction, a read-only browser inspection covered Play, Quests, Bruhs and Camp in 20 sampled states across five isolated contexts: empty/demo phone, empty/demo compact with one-time 3× CSS font-size/line-height overrides and reduced-motion emulation, and desktop demo. No horizontal text overflow was measured in the sampled DOM text ranges. Exact hydrated game strings were preserved with zero monitored post-hydration Storage writes or guarded GPS calls. This inspection predates the role change and does not verify native semantics.

After the correction, three browser quest flows pass all 24 combined assertions at 390×844, 320×568 with the CSS/reduced-motion emulation, and 1280×900. Each flow collects exactly 50 XP with one game save, restores focus to the collected marker after reward dismissal and preserves the expected save through reload. Three collected-state stills were inspected individually. All eight inspection/regression contexts restore their captured localStorage/sessionStorage strings and patched Storage/geolocation descriptors before closing. The T3 snapshot failures remain archived; owned-tab close was accepted, while renderer teardown remains unobservable.

Lint, typecheck and all 90 tests pass. iOS/Android Hermes exports and 13 static web pages complete with exit 0; exports do not establish native compilation, rendering or screen-reader behavior. All 95 source/package pins match, with only `QuestList.tsx` differing from the tab-feedback baseline. Independent source review passes without blocking findings; its native source inspection is separate from the browser, test and export checks. Native runtime, OS scaling, actual assistive technology, physical Health/GPS, production backend/release and earlier recorded limitations remain open. [Evidence](../.playwright-mcp/native-quest-headings/summary.json).

## 2026-10-27 — Walk saves under slow storage

While a route write is busy, new accepted fixes now replace its pending full-walk snapshot. The drain writes that newest snapshot next. All accepted route points remain in the walk; intermediate save snapshots can be superseded. Deletion still waits for the drain before removing the saved route.

In an in-memory Node probe with 1,000 synthetic fixes and a blocked first write, serialization fell from 1,002 snapshots / 38,306,013 bytes to two snapshots / 76,445 bytes. Each run saved its complete 1,000-point, 76,215-byte final walk exactly. This models backpressure; it does not measure device latency, battery or heap use. Four new concurrency tests cover catch-up, latest-error Retry, erasure ordering and disposal. Those four fail against the copied baseline and pass the correction; all 12 existing recorder tests also pass. A fifth test detects eager serialization while storage is blocked. A temporary variant with that regression passes the previous 16 recorder cases and fails this new guard; the corrected recorder passes all 17.

The final three browser flows pass 51 combined assertions at 390×844, 1280×900 and 320×568 with one-time 3× CSS font-size/line-height overrides and reduced-motion emulation. Synthetic location callbacks exercise Start, Pause, Resume, late-fix rejection, Finish, failed save, keyboard Retry, reload, failed deletion and a fresh successful deletion confirmation. Each route retains eight points in two segments without counting the pause gap. Retry/reload/failed deletion preserve the exact finished save bytes. Monitored game-key action writes remain zero and the synthetic game/XP stays unchanged. The four-fix burst uses one route write in each final case, versus five in the corrected baseline browser run.

Three final contexts and both baseline attempts restore captured localStorage/sessionStorage strings and patched Storage/geolocation/permissions descriptors, remove owned probes/CSS and close with zero mocked watches. These reported checks cover exact captured-storage/API restoration and mocked-watch cleanup; T3 renderer teardown was not observable. Six selected before/final stills were inspected individually. Some early captures precede basemap tile completion; four WebGL ReadPixels warnings remain recorded. The initial baseline action-write check incorrectly included reload hydration; its raw result and corrected follow-up remain archived.

Root verification reports passing lint, typecheck and all 95 tests. iOS/Android Hermes and 13-page static web exports complete with exit 0. All 95 source/package pins match; only `recorder.ts` and its tests differ from the native quest-heading baseline. Compared with R1, R2 changes only the test file; production recorder, runtime, package and config bytes are unchanged. Browser checks and exports were not repeated for R2. Independent R1 source review approved the recorder without blockers. Its optional serialization-test suggestion prompted the fifth regression, approved in independent R2 test review without remaining objections. Native/device storage behavior, physical GPS/Health, OS scaling, actual assistive technology, cloud/release and every-paint behavior remain unverified, alongside earlier recorded limitations. [Evidence](../.playwright-mcp/walk-save-backlog/summary.json).

## 2026-10-27 — Native party keyboard settings

The party screen requests [handled keyboard taps](https://reactnative.dev/docs/scrollview#keyboardshouldpersisttaps) on iOS/Android and [automatic keyboard insets](https://reactnative.dev/docs/scrollview#automaticallyadjustkeyboardinsets) on iOS through optional `Screen` props. These settings are intended to let form controls handle taps while typing and provide scroll room above the keyboard. In native join mode, the name field also requests [submit without blur](https://reactnative.dev/docs/textinput#submitbehavior) so its existing Next handler can focus the invite code without a forced blur. Web values and other screens remain unset; copy, styles, validation, consent and Auth logic have no source diff.

An eight-check source-effect model executes the installed React Native 0.88 responder method bodies with mocked keyboard and event inputs. For an idle, docked-keyboard, non-text-input target, the default policy claims capture and `handled` does not; the sampled control cases retain their capture behavior. A separate eight-case model executes RN's input-prop normalization: a single-line Next label still defaults to `blurAndSubmit`, while explicit `submit` keeps the submit policy without blur. Installed iOS/Android source emits the submit event and applies blur separately. These are source/logic findings. Android's existing raw Enter-key handler can still hide the keyboard; uninterrupted keyboard visibility is not established by this editor-action refinement. Actual native tap delivery, keyboard overlap, dismissal, focus handoff, safe areas, floating/hardware keyboards and OS scaling remain unverified.

The final R2 revision passes 60 combined assertions across three isolated browser cases: 390×844 and 1280×900 at normal text, and 320×568 with one-time 3× CSS font-size/line-height overrides and reduced-motion emulation. Focused-input pointer taps toggle consent, Enter advances from name to invite, invalid or unconsented submissions stay blocked, and DOM/Chrome accessibility-tree errors clear after correction. No valid create/join is submitted. Nine original/final R2 PNG pairs are byte-identical in these states; three final R2 stills were inspected individually. These captures do not exercise a software keyboard or native prop values.

All nine sampled original/R1/R2 browser contexts preserve captured hydrated local/session strings with zero monitored post-hydration Storage writes, guarded GPS calls or Auth/REST requests. The exact captured local/session storage strings and original Storage/geolocation API property descriptors were restored; owned probes/CSS were removed. Two shared-preview snapshot timeouts remain archived. T3 accepted the owned-tab close request; renderer teardown remains unobservable.

On the final R2 revision, root lint, typecheck and all 95 tests pass. iOS/Android Hermes exports and 13 static web pages complete with exit 0. All 95 declared source/package pins match `freeze-r2.json`; among those 95 pinned files, only `ui.tsx` and `party.tsx` differ from the approved recorder baseline. Independent R1 and R2 source reviews approve the reviewed changes without actionable findings; these source-only conclusions are separate from the root browser, test and export evidence. Native/device verification, physical Health/GPS, cloud/release, actual assistive technology and earlier recorded limitations remain open. [Evidence](../.playwright-mcp/party-keyboard/summary.json).

## 2026-10-27 — Saved walks during stalled map loading

In three sampled browser flows, holding the map stylesheet request did not block Finish or save Retry. No app source was changed. The corrected inspection passed 60 combined assertions at 390×844 and 1280×900 with normal text, and 320×568 with one-time 3× CSS font-size/line-height overrides and reduced-motion emulation. The CSS overrides cover the pre-reload interactions; page reload checks persistence without reapplying them.

Each flow starts with a synthetic paused three-point walk. A trusted Finish interaction reached a controlled save failure and preserved its saved paused bytes; keyboard Retry saved a valid completed walk with the same geometry, distance and elapsed time. The route then survives a stylesheet failure, map Reload and page reload with its exact completed save bytes and game string intact. Each case records one failed route-write attempt and one successful Retry, zero monitored post-hydration game action writes with XP unchanged, and no guarded GPS calls or Auth/REST requests. Start/Resume and real Health/GPS are not exercised. Map Reload transfers focus to its surviving controls group; the recovered map source matches the saved route's domain geometry.

A genuinely nonterminal stylesheet request can still show loading indefinitely. Reload remains available only after a reported error; this inspection does not close that limitation. The initial harness incorrectly used a party-form settle helper and evaluated no app assertions. Its three restored attempts and the corrected results remain archived. The final runs retain three controlled stylesheet resource errors, four GPU ReadPixels warnings and one unattributed Expo Router layout-anchor fetch warning. No page errors were captured. Three selected stills were inspected individually; they do not establish broader visual or network coverage.

All six initial/final isolated contexts restore their captured local/session strings and patched Storage/geolocation descriptors, remove owned probes/CSS and close. Both standalone browsers close. Two T3 snapshot timeouts are archived; its owned-tab close was accepted, while renderer teardown remains unobservable. At inspection, all 95 declared source/package pins matched the approved party-keyboard R2 baseline. Lint, tests, typecheck and exports were not repeated for this read-only inspection. Native/device, OS scaling, actual assistive technology, cloud/release and earlier recorded limitations remain open. [Evidence](../.playwright-mcp/map-pending-walk/summary.json).

## 2026-10-27 — Retry a stalled web map

The web map toolbar now offers Reload while loading. When its last waiting map is canceled, the loader removes the unused pending stylesheet link; loaded styles remain reusable. The first stylesheet uses its ordinary versioned URL, while subsequent new links use distinct retry query values. This addresses the observed browser behavior where replacing a link with an identical URL rejoined the stalled request. No automatic timeout or page reload was added. Native loading controls retain their prior source branch.

Focus moves from Reload to the surviving map-controls group during activation and when a loading/error transition removes the focused control. Focus on another control prevents that transfer. The final R3 app regression passes 102 combined assertions across 390×844 and 1280×900 at normal text, and 320×568 with one-time 3× CSS font-size/line-height overrides and reduced-motion emulation. These cover loading Retry, single held-key activation, CSS failure/error Retry, natural focus transitions, repeated-error focus/control identity, desktop external focus, and loaded-style reuse after Back. CSS overrides cover the pre-reload interactions; full page reload checks persistence without reapplying them. Nine saved loading/error/ready focus rectangles fit vertically within their sampled scrollports; three final R3 stills were inspected individually. Repeated error checks use the actual map Evented listener; the error-to-ready check invokes the mounted status callback, rather than completing another network load.

Actual Finish, an injected save failure and keyboard save Retry preserve a synthetic paused route's geometry, distance and elapsed time. Each final case records one failed route-write attempt and one successful Retry. Exact completed save bytes and the game string survive map recovery, Back and page reload, retaining 5,829 XP with zero monitored post-hydration game action writes, guarded GPS calls or Auth/REST requests. Start/Resume and physical Health/GPS are not exercised. A separate 13-check probe extracts and type-erases the actual private loader, then executes it against real Chromium DOM/style requests on an inert page. Sharing, same-signal cancellation, last-waiter removal, loaded reuse and failure/retry pass there; this is separate from the app regression and native verification. The loader bytes are identical in R2/R3, so this probe was not repeated for R3; the app checks and exports were rerun.

Earlier request-reuse failures, an overly strict key-phase assertion and the standalone probe's request/handler race remain archived with their corrections. The interrupted R1 source review is not approved; its disappearing-control focus finding prompted the stable status-callback correction. R2 source review then found that repeated errors stole focus from the surviving error Reload. R3 tracks the last reported status and synchronizes explicit Reload through the same stable callback; the new browser regression passes. R2 also records a root-owned adjudication-note update while its 95-file source freeze stayed unchanged. Fresh R3 source review approves the reviewed correction without actionable findings; its source-only conclusion is separate from the root browser, test and export checks. Final app checks retain six controlled stylesheet resource errors and four GPU ReadPixels warnings; the separate loader probe retains two controlled resource errors. No page errors were captured. The final three app contexts restore captured local/session strings and Storage/geolocation descriptors, remove owned probes/CSS and close; the loader probe ends with its captured storage strings unchanged and closes after removing its owned globals/link. T3 snapshot failures and unobservable renderer teardown remain recorded in the preceding inspection.

Root lint, typecheck and all 95 tests pass. iOS/Android Hermes exports and 13 static web pages complete with exit 0. All 95 declared source/package pins match `freeze-r3.json`; among those files, only `explore.tsx` and `StreetMap.web.tsx` differ from the approved party-keyboard baseline. These checks cover the tested stylesheet-loading stage, not every asset, engine, timing or paint. DOM-link removal is not a universal transport-abort guarantee. Native/device, OS scaling, real assistive technology, cloud/release and earlier recorded limitations remain open. [Evidence](../.playwright-mcp/map-loading-retry/summary.json).

## 2026-10-27 — Quieter completed-walk map errors

Completed walks now omit “GPS recording can continue.” from map errors. Reload stays available, and unfinished walks retain the guidance. Root browser measurements show the recovery region shrinking from 101 to 72 CSS px at normal text and from 434 to 174 CSS px at 320×568 with one-time 3× CSS font-size/line-height overrides. The compact sample uses reduced-motion emulation; these are not OS-scaling or native measurements.

The root browser report records 75 passing measured checks across six final held-input cases: Enter at 390×844, Space with the compact CSS overrides, and mouse pointer at 1280×900, each across stylesheet-driven ready/error transitions. Release starts no extra load; ready cases retain the same map without a recenter command, while errors remain until a fresh activation. Focus stays usable. Each session preserves its exact synthetic game/walk strings and 5,829 XP, with zero monitored post-hydration Storage action writes, guarded GPS calls or Auth/REST requests. Three paused-walk error cases pass 36 checks and retain the caption. Three additional completed-error captures confirm its absence; these repeat that coverage rather than add independent input combinations.

Three final stills were inspected individually. The final contexts restore captured local/session strings, Storage/geolocation descriptors and owned camera-method overrides, remove probes/CSS and close. The first report's three unmeasured error-camera flags are excluded from the corrected 75-check count; its raw report remains archived. Controlled stylesheet errors, GPU ReadPixels warnings and two shared-preview snapshot timeouts are retained. T3 accepted the owned-tab close; renderer teardown remains unobservable.

Root lint, typecheck and all 95 tests pass. Root JavaScript exports complete with exit 0, producing two Hermes bundles (iOS/Android) and 13 static HTML pages; native compilation was not validated. Independent review approves the one-expression source guard without actionable findings; browser, test, export and device results are outside its certification. All files in the declared 95-file inventory match `freeze-after.json`; among them only `explore.tsx` differs from the approved 95-file map-retry baseline. Native/touch, OS scaling, real assistive technology, physical Health/GPS, cloud/release and earlier recorded limits remain open. [Evidence](../.playwright-mcp/map-held-controls/summary.json).

## 2026-10-27 — Reachable party connection recovery

Party connection failures now say “could not connect.” above the existing “try again” button. In the tested 320×568 browser layout with one-time 3× CSS font-size/line-height overrides and reduced-motion emulation, the error card shrinks from 763 to 322 CSS px. Retry moves from y788–946 to y347–505, fully inside the 568 px viewport without scrolling. At 390×844 and 1280×900 with normal text, the card shrinks from 136 to 115 px. Three final error stills were inspected individually.

The root's final browser run passes 39 assertions across those three layouts. Intercepted network failures preserve the existing two-member leaderboard and each session's exact saved game and synthetic credential strings; keyboard Retry clears the error and restores focus to the party heading. There are zero monitored post-hydration Storage action writes or guarded GPS calls. In that synthetic-intercept browser run, all Auth/REST traffic is intercepted, with no real account, database or Health operation. Owned isolated contexts restore captured local/session strings and Storage/geolocation descriptors, then close. Controlled network errors and two T3 snapshot timeouts remain recorded; T3 accepted the owned-tab close, but renderer teardown is unobservable.

Root lint, typecheck and all 95 tests pass. Independent review approves the exact source change without findings; it does not certify browser/runtime or platform readiness. Among the declared 95-file inventory, only the network-error literal in `src/friends/model.ts` changes from the preceding map-error-copy baseline. JavaScript exports were not repeated for this copy-only edit. A read-only Xcode/SDK check reported no change to the prerequisites it inspected for the earlier generic-simulator destination failure; native compilation was not retried. Native/device, OS scaling, real assistive technology, hosted backend/release and prior limitations remain open. [Evidence](../.playwright-mcp/party-offline-recovery/summary.json).

## 2026-10-27 — Visible party refresh feedback

Slow party refreshes now show a themed waiting ring inside the existing refresh button while the current scores remain readable. Normal motion uses the installed ActivityIndicator; reduced motion uses a static ring. The button's busy and disabled states are exposed in the tested browser cases. Its label, element identity and 48×48 CSS px bounds remain unchanged in those cases. The native Health-sharing branch also requests this feedback in source; actual Health sharing remains unverified.

Root browser checks use intercepted network responses at 390×844 and 1280×900 with normal text, plus 320×568 with one-time 3× CSS font-size/line-height overrides and reduced-motion emulation. They cover error/Retry recovery, the held board read, returning to idle, saved-string preservation and live motion-preference changes. Normal spinner transforms advance across sampled frames; the compact static ring has no active animation. Three final pending-state stills were inspected individually.

The first implementation omitted web busy metadata; an explicit `aria-busy` alias corrects that. The final raw browser run passes 64 of 67 flags. The remaining three flags reject Chrome's recorded AX boolean value encoded as `1`; a follow-up adds three recorded-value adjudications using the existing AX records and DOM `aria-busy="true"`, without a fresh browser run or source change. Both earlier failure sets remain archived. Each isolated session preserves its exact game and synthetic credential strings, with zero monitored post-hydration Storage action writes or guarded GPS calls. All Auth/REST traffic in these runs is intercepted. Owned contexts restore captured local/session strings and Storage/geolocation descriptors, remove probes/CSS and close. Controlled network errors and two T3 snapshot timeouts remain recorded; T3 accepted the owned-tab close, but renderer teardown is unobservable.

Root lint, typecheck and all 95 tests pass. JavaScript exports complete with exit 0, producing two Hermes bundles and 13 static HTML pages; this is not native compilation. Independent source review approves the implementation without actionable findings; its 20 limited probes do not certify root browser/check/export results or platform readiness. Only `party.tsx`, `ui.tsx` and `Icon.tsx` differ within the declared 95-file inventory from the preceding party-connection-copy baseline. Native/device, OS scaling, real assistive technology, hosted backend/release, indefinite transport hangs and prior limitations remain open. [Evidence](../.playwright-mcp/party-refresh-feedback/summary.json).

## 2026-10-27 — SDK patch alignment and Android storage permissions

Updated nine Expo SDK 58 packages to the online check's recommended patches and added the Metro runtime peer required by Router. Native app builds and execution, cloud behavior and release readiness remain unverified. Expo resolves to 58.0.19, Router to 58.0.26 and Metro runtime to 58.0.15. The installer also registered the unconfigured status-bar plugin; its installed implementation makes no native style changes without options. Android now blocks two inherited legacy external-storage permissions that the reviewed app storage paths do not use.

The install initially changed resolutions used by other workspace apps. The final lockfile restores all eight non-steps importers and their original 1,280 reachable snapshots and package metadata, while retaining the updated steps graph. A frozen installation without lifecycle scripts succeeds; the final online Expo version check reports dependencies up to date. Independent source review approves the three-file package/config/lock change and recomputes the preserved closure without missing edges or new steps peer mismatches. This does not certify the root runtime checks.

Expo prebuild cleared and regenerated the ignored Android and iOS projects, including their prior Pods/build outputs. No Pods installation, native app compilation, signing, installation or device access occurred in this pass. Android release-manifest processing succeeds. Across its three saved derived stages, 24 recorded checks confirm exactly READ_EXTERNAL_STORAGE and WRITE_EXTERNAL_STORAGE were removed, with no permission additions; foreground location, Health steps and disabled backup remain. These are three stages of one release configuration, not separate platform scenarios or a claim that every remaining permission is essential. Generated iOS Health/GPS purpose strings and the HealthKit entitlement remain unchanged. The SDK removes the old RCTNewArchEnabled plist key; installed native factory source still explicitly enables the new architecture, without runtime verification.

Root lint, typecheck and all 95 tests pass. Fresh JavaScript exports finish with exit 0 and produce two Hermes bundles and 13 static HTML pages. The final browser journey passes 48 assertions across 390×844 and 1280×900 at normal text, plus 320×568 with reduced motion and 3× CSS font-size/line-height overrides. The override stylesheet is rebuilt after route/modal changes; this is browser CSS emulation, not OS text scaling. Synthetic local game, walk and party-session fixtures cover the demo step action, quest claim, equip, goal change, paused-walk Finish, held party refresh and reload. Each complete tested fixture journey records exactly four game saves and one route save; completion preserves route geometry/time and adds no step XP. All Auth/REST traffic is intercepted and guarded GPS calls remain zero. Actual Health sharing is outside this evidence.

Twelve additional stills were inspected individually after reward opacity reached 1 and card bounds matched across three frame samples. The narrow follow-up passes 21 checks, including keyboard access to the scrollable reward action. The compact top-of-page captures do not show the map canvas. A separate seven-check compact repeat confirms the reward numeral's 174.06 px width fits its 238 px parent; its action PNG is byte-identical to the earlier still, so the initial clipping suspicion is unsubstantiated. Normal rewards in the earlier core captures were taken during entrance motion and remain archived rather than serving as settled visual proof.

The unreliable offline version result, uncached offline Gradle failure, three wrong-label harness failures, capture observations and GPU warnings remain recorded. After two T3 snapshot timeouts, isolated Chrome supplied the browser evidence. The isolated Chrome core-journey and visual-follow-up contexts restore captured local/session strings and Storage/geolocation descriptors, remove temporary CSS/probes and close. T3 separately accepted the owned-tab close, but its renderer teardown remains unobservable. The local preview remains running. Native/device execution, OS text scaling, real assistive technology, physical Health/GPS, hosted services and release readiness remain unverified. Device access is restricted and device automation is disabled in this environment. The general Expo invalidation race and prior limitations remain open. [Evidence](../.playwright-mcp/native-readiness-current/summary.json).

## 2026-10-27 — Android release compilation and optimization

This verification-only pass reports successful Android release Kotlin/Java compilation, arm64-v8a C++ linking and R8 optimization. This verifies those build stages; final APK/AAB packaging, signing, installation and native execution remain unverified.

The compilation run finishes with exit 0 in 3m 19s, reporting 377 actionable Gradle tasks. It includes the Gradle-managed JavaScript/Hermes bundle prerequisite. Artifact inspection records the app's compiled activity/application classes, a 64-bit AArch64 libappmodules.so and the generated release JavaScript/Hermes bundle. The separate R8 run finishes with exit 0 in 1m 31s and reports 554 actionable tasks; the generated DEX output and mapping file are recorded. The selected graphs and execution logs contain no APK/AAB packaging, signing or installation task. No APK/AAB output was produced by these selected runs.

The first offline graph check stopped on uncached release dependencies. Online library resolution succeeded with Android SDK downloads disabled. A verification-only Gradle init script requests two Metro workers alongside the two-worker Gradle pool; app and generated native source are unchanged. All 125 captured source/configuration/evidence inputs match their pre-run hashes, and all three current derived release manifests match the preceding permission-cleanup baseline byte for byte. Compiler and Gradle deprecation warnings remain in the logs.

The bundle uses the existing loopback development backend configuration. Other ABIs, final packaging/resource shrinking, iOS compilation, native UI and physical Health/GPS, OS text scaling, real assistive technology, hosted services and distribution remain unverified. Device access is restricted and device automation is disabled in this environment. The preceding lint, typecheck, 95 tests and JavaScript-export checks were not rerun; that decision relies on unchanged hashes for the 125 captured source/configuration/evidence inputs. No new browser flow was run; the existing preview still returned HTTP 200 and its process remained running. The general Expo invalidation race and prior limitations remain open. [Evidence](../.playwright-mcp/native-compile-current/summary.json).

## 2026-10-27 — Cancellable party loading

In the tested browser flows, party refreshes and pagination offer Cancel. Initial cancellation leaves “party not loaded.” with Retry; same-week cancellation retains loaded scores. Cancel hides prior-week scores at Monday’s reset without restarting loading. Confirmed profile and join writes finish before their separate board refresh, so a stalled read no longer holds the completed form open. Pending server writes keep their existing completion flow.

Canceled verification responses preserve credentials. Once a live response confirms a missing session and the provider grants cleanup ownership, the Cancel control closes. Cleanup is then noncancellable, and the SDK completes its auth-storage writes. In the tested web transitions, a disappearing keyboard-focused Cancel restores the party heading after cleanup; deliberate focus, wheel input and Back navigation take priority. Pagination Cancel stays in More’s position, and a deliberately focused control stays visible when rows arrive unless intervening input cancels that visibility intent.

Root lint, typecheck and all 118 tests pass, including 20 simulated-hook provider tests and 14 installed-SDK tests with mocked fetch/storage. R1 independent source review found two races missed by the earlier green checks: SDK verification could remove credentials after cancellation, and a cancellation-induced week change could restart sharing. The added regression tests for both races fail before the fixes. Verification now uses an abortable Auth read and explicit cleanup ownership; ordinary rollover uses the existing sharing queue. Updating the displayed week during cancellation no longer independently triggers sharing. Independent R2 review approves the reviewed source and isolated probes, closes both R1 findings, and reports 34 focused tests and 22 supplemental probes passing. Its approval excludes the root browser/export results and native or hosted behavior.

The final browser run passes 217 assertions across 30 selected scenarios at 390×844 and 1280×900 with normal text, plus 320×568 with rebuilt 3× CSS font-size/line-height overrides and reduced-motion emulation. This samples scenario/layout combinations rather than every combination. All Auth/REST responses are intercepted with synthetic credentials and scores. Twenty-five sessions record zero monitored Storage action writes. Five confirmed cleanups each issue four auth-related removeItem calls; game/walk strings remain exact and guarded GPS calls stay zero across all sessions. Captured original local/session strings and Storage/geolocation descriptors are restored before the isolated contexts close. Five controlled HTTP404 console resource errors remain recorded, with no page errors. Twelve selected stills were inspected individually at original detail and show particular scroll positions, not full-page coverage.

Earlier product failures, harness corrections and two T3 snapshot timeouts remain archived. T3 accepted its owned-tab close; renderer teardown remains unobservable. Final JavaScript exports finish with exit 0, producing two Hermes bundles and 13 static HTML pages. All 95 declared source/package pins match the R2 freeze; six files differ from the preceding SDK baseline. The earlier Android native compile predates this patch. Native/device execution, physical Health/GPS, OS text scaling, real assistive technology, hosted services and release readiness remain unverified. Device access is restricted and device automation disabled. The general Expo invalidation race and prior limitations remain open. [Evidence](../.playwright-mcp/party-read-cancel/summary.json).

## 2026-10-27 — Production backend configuration check

The repository's EAS production profile now requires a non-loopback HTTPS project URL and a publishable or legacy anon key kind during app-config resolution. Previously, the sampled production configuration accepted the local endpoint used by the earlier Android compile. A profile marker covers local resolution, where the EAS_BUILD_PROFILE builtin is unavailable; [Expo documents the distinction](https://docs.expo.dev/eas/environment-variables/usage/). Development and preview keep optional backend configuration. The dynamic config passes through app.json; Biome now includes app.config.ts and eas.json.

Final lint, typecheck and 126 tests pass, including eight new config tests. Six final installed Expo CLI cases pass with synthetic settings. They cover both mapped-zero URL spellings under both production flags, accepted synthetic production settings, and a local preview. Successful public configurations match the pre-change baseline excluding internal loader-path metadata. The initial eight CLI cases remain separate evidence. R1 source review found the mapped-zero gap despite green checks; the new fixtures fail against the old guard. R2 source/probe review approves the correction, closes that finding and independently passes eight focused tests. Its approval excludes the root browser/export results and release readiness.

Final exports finish with exit 0, producing two Hermes bundles and 13 static HTML pages under synthetic production settings. This verifies JavaScript packaging, not native execution or hosted service behavior. A read-only 390×844 browser DOM smoke covers four game tabs, with captured original storage and descriptors restored before closing the isolated browser. It exercises no gameplay, Health, GPS or backend action. All 101 declared source/config/package/document paths match the R2 freeze before publication. Earlier failures remain archived, including the deliberately stopped R1 export: Expo returned 0 with zero output artifacts, which is recorded as stopped rather than a pass. The nested Biome snapshot was renamed byte for byte; the product lint rules were not relaxed.

A separate read-only, unsigned generic iOS Release build-settings preflight exits 64 because Xcode reports the required iOS 26.5 platform is missing. It reaches no compilation; all 99 captured existing source/package and generated iOS project inputs stay unchanged. Device access is restricted and device automation disabled. No platform installation or device access was attempted.

The guard checks URL shape and key kind. DNS, reachability, key authenticity, Auth, RLS and server behavior need separate validation. Direct native builds and unmarked export/update paths are outside the verified guard path. No hosted project is connected or deployed. Native execution, real Health/GPS, OS text scaling, assistive technology and release readiness remain unverified. The general Expo invalidation race and prior observations remain open. [Evidence](../.playwright-mcp/production-config-current/summary.json).

## 2026-10-27 — Party bruh preview

Editing a party profile now shows the equipped bruh's portrait and name before the name field. The existing Save action already shares that bruh. In the earlier browser fixture, an unchanged-name save replaced the party's original bruh with Sun while the editor showed only the name field. The preview makes that result visible before Save. It uses the existing 72 px artwork size and spacing tokens; enlarged captions can move below the portrait. Create and join keep their existing artwork.

Lint, typecheck and all 126 tests pass. The synthetic browser/CSS-emulation matrix (18 isolated contexts) passes 252 assertions across all six bruhs at 390×844 with normal text, 320×568 with 3× CSS font-size/line-height overrides and reduced-motion emulation, and 1280×900 with normal text. It checks the preview's DOM name and width, programmatic full reveal, keyboard order, Save's focus ring, Cancel and focus return, reopening, and the expected save payload. Each case exercises one simulated profile-save RPC with the shown bruh and unchanged name. All Auth/REST responses are intercepted. Exact captured game/auth/session strings stay unchanged; monitored Storage writes and guarded GPS calls stay zero after hydration. All isolated contexts restore captured storage and descriptors before closing. Seven selected before/after/matrix PNGs were inspected at original detail; they are still samples, not every-paint proof.

Final JavaScript exports produce two Hermes bundles and 13 static HTML pages under synthetic production settings. Independent source review approves the frozen one-file change. It does not certify the root runtime/export evidence or native focus/assistive-technology behavior. The one-file UI change leaves the service/provider/game sources unchanged; the captured 101-path freeze records that boundary. T3 snapshot timeouts and the accepted close with unobservable renderer teardown remain archived. Native execution, physical Health/GPS, OS scaling, native focus, actual screen-reader speech, hosted services and release readiness remain unverified. The general Expo invalidation race and earlier observations remain open. [Evidence](../.playwright-mcp/party-bruh-preview/summary.json).

## 2026-10-27 — Shared local API journey

In this verification-only run of the unchanged Outside Expo web client, two isolated browser players complete the private weekly race flow against the repository's shared local Supabase workspace using actual Auth, RPC and database responses. All 25 functional checks pass across the sampled 390×844 normal-text and 320×568 enlarged-text sessions. The compact session uses 3× CSS font-size/line-height overrides and reduced-motion emulation. Create, invite join, profile-bruh Save, identity reload and both profile deletions pass. Separate synthetic harness submissions of 1,500 and 4,000 produce the expected weekly ranks; repeating 4,000 preserves that total. Browser demo steps remain unshared. Physical Health sharing is outside this evidence.

Schema lint and 20 transactional database tests pass separately. Current app lint and typecheck pass; no production source changes or unit-suite repeat occur in this verification-only pass. A local-only static web export produces 13 HTML pages and contains the intended shared API target. It is outside the EAS production release profile. The first development-sidecar attempt targeted the preserved preview backend; a guard blocked signup before account creation. A second origin probe timed out. The final static-build origin probe confirms the shared target before the successful flow. These failures remain archived. Two selected element PNGs were inspected individually at original detail; they show the profile preview and ranked rows, not full-page coverage.

Both players delete their synthetic accounts through the UI. Auth-user and Outside profile/party/member/daily-step row counts return to their zero baseline; service audit metadata is excluded. Two subsequent logout requests return HTTP 403 after account deletion; both UI actions reach the empty form. Expected auth and equip storage writes occur. Both isolated contexts restore captured storage and patched Storage/geolocation descriptors before closing; guarded GPS calls and captured page errors stay zero. The owned static server stops, and the shared backend returns to its initial stopped state with retained volumes. The original app environment file is unchanged, and the existing preview process still returns HTTP 200. All 108 captured source/config/package/document paths match their pre-run hashes before publication.

T3's two snapshot timeouts and accepted tab close with unobservable renderer teardown remain recorded. No hosted project, native/device execution, physical Health/GPS, OS scaling or real assistive technology was validated. Device access is restricted and device automation disabled. The earlier iOS platform prerequisite, general Expo invalidation race and prior limitations remain open. [Evidence](../.playwright-mcp/shared-api-live-current/summary.json).

## 2026-10-27 — Saved-walk reset warning

The browser demo's reset confirmation now shows “walks are erased.” above the “yes, reset” button. The earlier confirmation mentioned only the demo, although accepting it also deleted the saved GPS route. Three browser baselines reproduced that consequence with synthetic walks. Shared confirmation descriptions now precede approval; reviewed callbacks, repeat guards and style settings retain their existing implementations. Native Health uses the shared ordering in source; its rendering remains unverified.

Six final reset cases pass 111 browser assertions across sampled 390×844 and 1280×800 normal-text sessions and 320×568 with 3× CSS font-size/line-height overrides and reduced-motion emulation. Cancel preserves exact fixture bytes. Successful reset writes one default demo snapshot and removes the route key once; a simulated removal failure preserves the game and walk until retry. Reload preserves the result. In the compact sample, the 126 px warning and 158 px approval fit together with their 12 px gap and the approval's 5 px focus ring inside the 359 px scrollport.

Six party Leave/Delete confirmation states pass 60 assertions for opening, held-key protection and Cancel using intercepted synthetic Auth/REST responses. These use the shared component unchanged by the final Camp-only text trim; no party departure occurs. Six direct-route cases with synthetic walks pass 90 assertions for paused/completed walks, Cancel and accepted deletion while preserving exact game bytes with zero monitored game saves after hydration. Enlarged route descriptions require scrolling; the checks bring their top and bottom into view programmatically. These are browser/CSS samples, not physical touch or screen-reader checks.

R2 lint and typecheck pass. The R1 126-test suite passed on the shared component change before the final two-string shortening. Final synthetic-production JavaScript exports produce two Hermes bundles and 13 HTML pages. Independent R2 source review approves the reviewed changes without certifying browser, export or platform results. Only Camp and ConfirmAction differ within the 108 captured paths from the pre-pass baseline. Before publication, all 108 captured files match their hashes in the frozen R2 source manifest.

The earlier clipped warning, unsuccessful DOM-only text prototype, export rejected for the wrong key variable, two T3 snapshot timeouts and four software-WebGL warnings remain archived. Selected stills were inspected individually at original detail. Captured storage strings and patched Storage/geolocation descriptors were restored before all 25 fallback Chrome contexts closed. The app environment file is unchanged; the original preview remains running and returns HTTP 200. T3 accepted its tab close, with renderer teardown unobservable. Device access is restricted and automation disabled. Native execution, actual Health/GPS, OS scaling, real assistive technology and hosted release remain unverified; the earlier iOS build prerequisite, Expo source-change race and other recorded limitations remain open. [Evidence](../.playwright-mcp/demo-reset-walk-warning/summary.json).

## 2026-10-27 — Confirmation accessibility descriptions

Expanded confirmation buttons now reference their existing consequence text through `aria-describedby` on web and `accessibilityHint` in native source. Collapsed controls clear the association. The two-file change adds no visible copy or layout settings.

Across three sampled browser configurations, 24 expanded baseline samples lacked accessible descriptions. After the change, 243 assertions passed across 48 DOM/Chrome accessibility-tree samples, including exact descriptions, cancellation, reopening and distinct references for simultaneous party confirmations. The samples use 390×844 and 1280×800 normal text, plus 320×568 with 3× CSS font-size/line-height overrides and reduced-motion emulation. Auth/REST responses are intercepted; no destructive action is accepted. Captured game/walk/auth/session strings remain unchanged, with zero monitored action writes or guarded GPS calls after hydration. The measured target rectangles, names and focus states match the baseline. Eight of nine PNG pairs are byte-identical; the remaining walk pair has different map imagery, with no cause assigned. Six selected stills were inspected individually at original detail.

Lint and typecheck pass. Synthetic-production JavaScript exports produce two Hermes bundles and 13 HTML pages. Independent source review approves the frozen change without certifying runtime or exports. All 108 captured source/config/package/document paths match their frozen hashes before publication. Captured storage strings and patched Storage/geolocation descriptors were restored before all three fallback contexts closed; the existing preview returns HTTP 200 and its environment file is unchanged.

Two T3 snapshot timeouts, unobservable renderer teardown after accepted close, four WebGL warnings and the initially missing review artifacts remain recorded. No native execution or screen-reader speech was tested; actual Health/GPS, OS scaling, hosted services and release readiness remain unverified. Device access is restricted and automation disabled. The earlier iOS prerequisite and general Expo invalidation race remain open. [Evidence](../.playwright-mcp/confirmation-hints/summary.json).

## 2026-10-27 — Readable smaller place names

The three-file change assigns the existing readable bruhs place-label color to neighborhood, village, minor-place and state labels in web and native source. Native rendering remains unverified. Existing label text, fonts, sizes, halos, filters, zoom rules and layer order are retained.

Nine paired browser map views pass 112 assertions across Dubai, rural UK and Illinois scenes. Samples use 390×844 and 1280×900 normal text, plus 320×568 with 3× app CSS font-size/line-height overrides and reduced-motion emulation; canvas glyphs are not text-scaled. In the sampled paired browser runs, serialized map styles differ only in the four intended text-color properties. Rendered label data, canvas bounds and camera values match. A separate normal-phone follow-up verifies trusted keyboard panning and all four colors after Back/reopening. The sampled after run receives 75 glyph responses with HTTP 200 and no glyph failures; this does not resolve the historical font-warning cause.

The seven isolated contexts for the paired runs and follow-up preserve captured game/route strings. During monitored post-hydration periods, they record zero Storage write/removal attempts, zero attempted browser geolocation calls and zero intercepted Auth/REST requests. Captured storage strings and patched Storage/geolocation descriptors are restored before closing. Ten selected stills were inspected individually at original detail. Lint and typecheck pass; synthetic-production JavaScript exports produce two Hermes bundles and 13 HTML pages. The unit suite was not repeated for this paint-only change.

Native inspection is limited to shared source and the installed wrapper; rendering remains unverified. Direct provider requests through urllib returned HTTP 403 while browser glyph requests succeeded; no cause is assigned. T3 snapshot timeouts, unobservable renderer teardown after accepted close and software-WebGL warnings remain recorded. Actual Health/GPS, native execution, OS scaling, real assistive technology, every-paint behavior and hosted services remain unverified. Device access is restricted and device automation is disabled. The earlier development-preview source-invalidation failure remains open, and a missing iOS 26.5 platform still prevents local iOS compilation. Those limit broader release verification beyond this paint change. [Evidence](../.playwright-mcp/map-minor-place-labels/summary.json).

## 2026-10-27 — Earned checkpoints on the walking map

The web map shows green check badges at the existing 250 m, 500 m and 1 km stamp milestones. Native source uses the same layer definitions; native rendering remains unverified. Coincident stamps share a check instead of overprinting numbers, while the existing counter and list retain individual achievements. The five-file change derives map features from recorded segments and adds no saved fields.

Six final browser route fixtures pass 72 rendering/source checks, including a repeated loop and both date-line directions. Layout samples use 390×844 and 1280×900 normal text, plus 320×568 with 3× app CSS font-size/line-height overrides and reduced-motion emulation; canvas glyphs are not text-scaled. A separate synthetic recorder flow passes 33 checks for earning, pause gaps, late fixes, Finish/save failure/Retry, recenter, Back/reopening, reload, Cancel and a new walk. Captured game bytes remain unchanged; route saves are exercised normally. These browser checks use no physical GPS, Health or backend data.

Lint, typecheck and all 132 tests pass. JavaScript exports using synthetic HTTPS backend settings, without a real hosted project, produce two Hermes bundles and 13 HTML pages. Ten selected final stills were inspected individually at original detail. Earlier fixture failures, string-ID rendering loss and the corrected exact-half-world geometry test remain archived. Captured storage strings and patched APIs were restored before the owned browser contexts closed.

Two T3 snapshot timeouts and software-WebGL warnings remain recorded. Native execution, actual Health/GPS, OS scaling, real assistive technology, every-paint behavior and hosted services remain unverified. Device access is restricted and device automation is disabled. The missing iOS platform prevents local iOS compilation; the general Expo source-change race remains an unresolved development-preview issue. [Evidence](../.playwright-mcp/walk-stamp-pins/summary.json).

## 2026-10-27 — Joining a party comes first

The existing “have an invite?” action now precedes party artwork and fields. In the sampled 320×568 browser, it moves from y658–714 to y92–148, placing the invite action within that sampled viewport at entry. The change relocates one unchanged button; consent and guest-login disclosures still precede submission.

Seven final browser cases pass 146 assertions across three viewport sizes at normal text size and compact portrait/landscape with 3× CSS font-size/line-height overrides and reduced-motion emulation. Checks cover keyboard mode changes, validation, consent reset, saving gates, invalid-invite recovery, synthetic create/join responses and profile Cancel. Functional cases use intercepted guest Auth/REST responses; no real account is created or joined. In all seven final cases, the saved demo-game string matches its post-hydration snapshot. All seven final contexts restore captured storage strings and patched Storage/geolocation descriptors before closing.

Lint and typecheck pass. Independent source review approves the relocation only. Unit tests and JavaScript exports were not repeated for this unchanged-button move; earlier results predate it. Eight selected final stills were inspected at original detail. The initial held-Enter focus assertion and its corrected narrow probe, two T3 snapshot timeouts and one expected synthetic HTTP400 console warning remain archived.

Native execution, OS scaling, real assistive technology, Health/GPS, weekly friend races against a hosted backend and every-paint behavior remain unverified. Device access is restricted and device automation disabled. The missing iOS platform prevents local iOS compilation. Earlier intermittent development-preview failures during source edits remain unresolved. [Evidence](../.playwright-mcp/first-launch-party/summary.json).

## 2026-10-27 — Clean setup after leaving a party

In the tested browser flow, leaving while editing a party profile now restores create/join setup with the saved name instead of the unsaved draft. Successful Leave resets local editing state and requires fresh consent; failed Leave preserves the draft. Successful profile deletion keeps its existing blank-form reset. The correction handles these own-screen actions, not external membership changes.

Seven scenario/viewport samples pass 88 browser checks across 390×844 and 1280×900 normal text, plus 320×568 with 3× CSS font-size/line-height overrides and reduced-motion emulation. Two keyboard follow-ups pass 32 checks for requiring a separate activation to approve Leave, heading focus and a contained invite-action outline. These use intercepted synthetic guest Auth/REST responses; no real account or party is changed. All nine final cases preserve the post-hydration game and saved-walk strings, and restore captured storage strings and patched Storage/geolocation descriptors before closing.

Lint, typecheck and 132 tests pass. Independent source review approves the correction only. Five selected final stills and the baseline were inspected at original detail. Two expected synthetic HTTP503 console warnings and two T3 snapshot timeouts remain archived; T3 renderer teardown could not be observed after the close request was accepted.

Native execution, real Health/GPS, OS scaling, assistive technology, hosted friend races and every-paint behavior remain unverified. Device access is restricted and device automation disabled. The missing iOS platform blocks local iOS compilation, and earlier preview failures during source edits remain unresolved. [Evidence](../.playwright-mcp/party-exit-form/summary.json).

## 2026-10-27 — Party drafts follow their saved owner

In the tested browser flows, a confirmed saved-profile or membership change resets the party form to the appropriate setup. Ordinary same-party refreshes, unsuccessful reads and canceled reads preserve the draft. Discovering a guest session without a saved profile also preserves its unsubmitted name, invite and consent. Deleting that guest clears the form.

The form contents use an ownership key, following [React’s state-reset guidance](https://react.dev/learn/preserving-and-resetting-state). The Screen, header, navigation and focus helper stay outside that reset. The change adds no visible copy or styles.

Fourteen recovery scenario/viewport samples pass 128 browser checks across 390×844 and 1280×900 normal text, plus 320×568 with 3× CSS font-size/line-height overrides and reduced-motion emulation. They cover membership/profile loss, replacement membership, failed/canceled reads, late results after Back, guest recovery and initial loading. Foreground checks dispatch a simulated web visibility event. The checked flows use intercepted, synthetic guest Auth/REST responses; no real party or account changes. Captured game/route strings were unchanged. After hydration, monitoring recorded no journey writes or geolocation calls. Captured storage strings and patched Storage/geolocation descriptors are restored before all 14 contexts close.

Lint, typecheck and 132 tests pass. Independent review found no high-confidence source regression. Earlier syntax and verifier failures remain archived separately. Native execution, real Health/GPS, OS text scaling, assistive technology, hosted friend races and every-paint behavior remain unverified. Device access is restricted and device automation disabled. The missing iOS platform prevents local iOS compilation; earlier preview failures during source edits remain unresolved. [Evidence](../.playwright-mcp/party-form-owner/summary.json).

## 2026-10-27 — Truthful party form feedback

In the tested browser states, refreshing a party no longer labels an open profile form “saving…”. Create, join and profile buttons keep their action labels during unrelated work and stay disabled while that work is pending. Actual form submissions retain “saving…”. The change adds no copy or styles.

Eleven final scenario/viewport samples pass 148 browser checks across 390×844 and 1280×900 normal text, plus 320×568 with 3× CSS font-size/line-height overrides and reduced-motion emulation. Checks cover refresh, pagination, cancellation, failures and each form submission. The tested Auth/REST responses are intercepted, synthetic data. The three held-Enter submissions each send one intended request. Captured game/route strings are unchanged, with no monitored journey writes or geolocation calls after hydration. Captured storage strings and patched descriptors are restored before the owned contexts close.

Lint, typecheck and 132 tests pass. Independent source review approves the one-expression change. The initial two incorrect recovery-control assertions and expected synthetic HTTP503 warnings remain archived; corrected departure checks pass separately. JavaScript exports were not rerun for this label-only change. Native execution, OS scaling, assistive technology, real Health/GPS and hosted races remain unverified; device access is restricted and native-device automation disabled. [Evidence](../.playwright-mcp/party-operation-label/summary.json).

## 2026-10-27 — Keep a keyboard destination after deleting a walk

In two browser samples, Enter held during delayed walk deletion no longer triggers Start when Control is released before Enter. Focus returns to “start a walk,” and the held activation stays blocked through release. The web hook tracks activation keys across modifier changes. The shared confirmation ref also forwards its cleanup callback.

The retained failing probe recorded an unintended Start click and guarded location attempts in each sample. The corrected runs passed 28 checks across two configurations: 390×844 with normal text and 320×568 with 3× CSS font-size and line-height overrides plus reduced motion. Each removed the saved walk once, preserved the exact game-save string, and recorded zero GPS or permission attempts. The tested local/session strings and patched browser descriptors were restored; both owned contexts and their browser were closed.

Lint, typecheck, and all 132 tests pass on this revision. [Evidence and review status](../.playwright-mcp/walk-delete-focus/summary.json) distinguish these browser runs, source-call models, independent reviews, and final JavaScript exports. The sampled focus-handoff checks stayed within the browser document; suppression after window blur and reentry remains unverified. Native rendering, physical Health/GPS, OS text scaling, assistive technology, and hosted races remain unverified.

## 2026-10-27 — Put today's steps before the trail

Play’s daily steps and goal now precede the illustrated trail. In the tested 320×568 browser demo at normal text size, the 48px shortcut moves from y494–542, below its 403px scrollport, to y158–206. The trail group uses the existing 8px gap. The quest card kept its earlier vertical position in the three samples at normal text size and 6,240 steps. The next stop remains below the scene on unfinished days.

Eight scenario/viewport samples pass 75 browser checks: six at normal text size across 320×568, 390×844 and 1280×900, and two compact samples with 3× CSS font-size and line-height overrides plus reduced-motion emulation. They cover zero, one, ongoing and completed step totals. Activating the shortcut with the keyboard opens Camp’s selected goal and browser Back restores focus in the exercised 390px flow. The sampled navigation preserves exact game-save strings with zero monitored writes or sensor attempts after hydration. All eight owned contexts restore captured local/session strings and patched Storage, GPS and permission descriptors before closing.

Lint, typecheck and 132 tests pass. [Evidence and review status](../.playwright-mcp/phone-visual-pass-20261027/summary.json) distinguish current browser checks from independent review. JavaScript exports were not repeated for this single-file JSX layout change; earlier exports predate it. Native rendering, physical Health/GPS, OS text scaling, assistive technology and hosted races remain unverified.

## 2026-10-27 — Android packaging and narrower permissions

The unsigned Android arm64 release APK builds with the current app, R8 optimization and release vital lint. Its original manifest declared an unused “draw over other apps” permission. Adding `android.permission.SYSTEM_ALERT_WINDOW` to Expo’s blocked permissions removes it from the final APK. Direct before/after inspection finds exactly that permission removed, with Health step-read, foreground location, haptics and network permissions retained. Android-only regeneration changes only the main manifest among 47 captured native/environment configuration paths.

Lint, typecheck and 132 tests pass. Root-owned inspection reports 96 passing artifact checks on the unsigned arm64 APK, including matching its generated Hermes payload, excluding preview backend values, and checking the 27 native libraries’ 16 KiB ZIP/ELF LOAD and RELRO geometry against [Android’s alignment guidance](https://developer.android.com/guide/practices/page-sizes). The signature verifier rejects the unsigned APK as expected. Builds use synthetic backend placeholders, with signing inputs absent and SDK/toolchain auto-download disabled. [Evidence](../.playwright-mcp/android-permission-cleanup-20261027/summary.json) separates root-owned build/inspection results from independent source-only approval and retains the earlier harness failures.

This is packaging evidence. Physical Health/GPS, native rendering, 16 KiB runtime, OS scaling, assistive technology, debug overlays, iOS compilation, signed distribution and hosted races remain unverified. Device access is restricted and native-device automation disabled. Supabase versus Convex is still pending user choice. The documented Expo invalidation race, map-font fallbacks and browser-chrome held-key boundary remain open.

## 2026-10-27 — Cancel interrupted walking-control presses

In the exercised Chromium flows, a key held through saved-walk deletion no longer activates Back after Tab leaves the document and returns. The web guard retains cancellation across window blur, while a fresh nonrepeat keydown can start a new press.

Before the fix, both phone samples recorded one unintended trusted Back click and navigation. The root-owned same-fixture replay passes 40 checks across three cases. Independent browser QA passes 108 checks across six cases at 320×568 with 3× CSS font-size/line-height overrides and reduced motion, 390×844 normal text, and 1280×900 normal text. It verifies held Space/Enter cancellation, modifier changes, the exact surviving Back node, and fresh keyboard/pointer actions. Each tested deletion removes the fixture route once, preserves the exact 5,879-XP game string and records zero GPS/permission attempts. Valid owned contexts restore captured storage strings and patched descriptors before closing.

The ordinary outside-focus control delivers `keyup` to `BODY`. A separate controlled browser fault withholds one trusted release from app listeners; fresh-press recovery passes. This does not demonstrate natural OS release loss. Independent source review approves the patch; its source-call models remain separate evidence. Lint, typecheck and 132 tests pass. Exports produce two Hermes bundles and 13 static web pages with synthetic backend placeholders. These are JavaScript/Hermes and static-web export checks; no native compilation, signing, device/runtime or hosted verification is claimed for this guard revision. [Evidence](../.playwright-mcp/walk-key-reentry-20261027/summary.json) retains the original failures, source models, initial setup limitation and separately recovered recording-transfer failure.

Physical keyboard/OS focus handling, native rendering, real Health/GPS, assistive technology and hosted races remain unverified. Device access is restricted and native-device automation disabled. The earlier Expo invalidation and map-font warning causes remain open.

## 2026-10-27 — Compact map failure recovery

A failed first map load no longer reserves an empty square in the sampled browser layouts. At 390×844, the paused-walk error card shrinks from 515 px to 167 px, revealing stamp progress. Reload restores the loading square. Later resource errors retain an already-loaded map so useful detail stays visible.

Independent browser QA returns a bounded pass with 85/86 raw assertions. The failed unconditional ring assertion remains recorded: the tested focus transfer after a pointer click has no ring; keyboard transfers and Reload have rings. Real recovery, later tile failures, fresh attempts, compact/desktop layouts and resize pass. The tested Finish/Retry/reload makes two route-save attempts, one successful write and no game/XP changes; identical hydration rewrites are recorded separately.

The native branch clips the inner map at its original size. Independent source review approves the style reset. Checks of installed native prop updates and Yoga layout cover the transition and viewport sizing. Separate layout checks cover seven fixture samples and 63 assertions. The 320 px sample with 3× CSS font-size and line-height overrides still needs scrolling; text-size settings are unchanged.

Lint, typecheck and 132 unit tests pass. Synthetic-config exports produce two Hermes bundles and 13 HTML pages, checking JavaScript and static web packaging. [Evidence](../.playwright-mcp/map-failure-layout-20261027/summary.json) retains failed drafts/probes, raw assertions, captures, qualifications and cleanup receipts.

Native app compilation and runtime, OS scaling, physical Health/GPS, assistive technology, hosted competition and every-paint behavior remain unverified for this revision. Device automation is disabled; earlier Expo invalidation and map-font observations remain open.

## 2026-10-28 — Fresh party invite feedback

In the sampled browser flows, a fresh Party form no longer shows the previous invite error. Switching Create/Join also clears obsolete invite feedback; submitting another rejected join shows it again. Immediate rejection and Delete cancellation retain the current name, code, consent and error. Back/reopen still starts a new draft.

The browser run recorded a raw result of 98 passed and 3 failed assertions across 320×568, 390×844, 1280×800 and compact 3× CSS font-size/line-height with reduced-motion media. The failures concern an overstrict full-control fit assertion, a scroll sample taken before settling, and test-style attribute restoration. In the older revision, the 709 px enlarged consent control remained reachable by scrolling. The [later consent-copy pass](#2026-10-28--shorter-party-consent) reduced its height in the tested browser layout. Original failures and corrected follow-ups remain documented.

All six owned disposable browser guests were deleted and their retained tokens rejected; original storage strings were restored and owned contexts closed. The supplemental recording’s descriptor-restoration evidence gap remains documented. Controlled transport faults exercised delayed completion and generic recovery separately from ordinary live rejections. Independent source review found no actionable regressions in 23 mocked records (two baseline, 21 corrected-source). Lint, TypeScript and 127 app tests pass. JavaScript exports were not rerun for this state-only patch.

[Evidence](../.playwright-mcp/party-invite-feedback-20261028/summary.json) includes the root baseline's own-token cleanup fallback and two empty harness startup failures. Native, hosted, OS text scaling, assistive technology and every-paint behavior remain unverified. Hosted setup awaits the owning-team answer.

## 2026-10-28 — Shorter party consent

The visible consent and accessible name now say “share my name, bruh and daily steps with party members.” Only two text literals changed; consent handlers, submission gates and font settings are unchanged in source.

In the tested 320×568 browser layout with 3× CSS font-size/line-height and reduced-motion media, the focused control is 520 px tall, down from the 709 px pre-edit sample. Both use 42 px type and 63 px line height. The complete control and its 5 px focus-ring margin fit in that sample. Normal-text samples save 21 px.

Root-owned read-only browser verification passed 56/56 checks across 320×568, 390×844, 1280×800 and the compact CSS-text sample. It covered exact labels, checked state, held-key toggles, consent gating, mode reset, and the actual demo storage key. Those four contexts restored their patched descriptors/styles and original storage before closing, with zero guarded writes or GPS/permission attempts.

The delegated live run ended at model capacity after 112 checks: 111 passed; one retained failure reflected a false expectation about the demo’s equipped bruh. The expectation was later corrected. Its Create/Join evidence remains separate; the interrupted run lacks a final restoration record. One guest was UI-deleted with a rejected-token receipt. Root completed narrowly scoped local admin cleanup of the remaining exact test guest through the existing deletion function. It verified the user/profile/party deletion and empty session, account and score queries scoped to that guest. That remaining guest’s original JWT was not retested.

Independent source review approved the copy-only diff. Latest lint and TypeScript checks passed; unit tests and JavaScript exports were not rerun. [Evidence](../.playwright-mcp/party-consent-copy-20261028/summary.json) preserves the interruption, recovery and verification scopes. Native, hosted, OS text scaling, assistive technology and every-paint behavior remain unverified.

## Verification and limits

Reward replacement has browser component-harness coverage and native source inspection and iOS/Android JavaScript export checks; actual health-triggered replacement and native accessibility focus remain device checks. The [current-app held-press regression](../.playwright-mcp/reward-held-press-matrix.json) now restores focus to the replacement heading after release.

Automated tests cover reward idempotency, health-driven level unlocks, atomic imports, pause and retry, calendar boundaries, saved-state restoration, daily completion, and map checkpoint calculations. Browser QA checks responsive layout, gameplay, persistence, and health-screen navigation. Expo exports validate iOS and Android JavaScript bundles.

Native builds read daily steps from Apple Health or Android Health Connect when connected. The app refreshes on return to the foreground and on demand; the health store supplies steps recorded while the app was closed. No continuous background read permission is requested. See [the health integration contract](health-integration.md) for import behavior and the device checklist.

Physical phones are required to compare actual health-store totals, verify phone/watch source handling and permission changes, and check safe areas, Dynamic Type, screen-reader navigation, and haptic feel. Browser QA uses an explicitly labeled demo and cannot validate native health access.


## 2026-10-28 — hosted friend races on Convex

The hosted beta is `left/bruhs-api`, using `https://earnest-wren-707.convex.cloud`. Outside's local preview and EAS preview/production build profiles use this public endpoint. The API's separate local backend remains available.

Nine hosted API scenario groups passed using synthetic totals and five disposable guests. Independent production-browser review verified core two-guest race and deletion flows at regular and compact phone sizes, with 49 of 53 assertions passing and four raw failures retained with adjudication. All seven owned test guests were deleted. Both workspaces passed lint/typecheck and their combined 136 tests; actual-target export produced two Hermes bundles and thirteen HTML routes. The EAS target change received source/config approval and five app-config probes; no EAS build or submission ran.

[Verification and limits](convex-migration.md#hosted-beta-verification) distinguish API, browser and export evidence. Full 3× adventure typography, physical Health/GPS/session behavior, OS scaling and assistive technology remain unverified. Guest recovery/retention, abuse controls and the earlier development SSR race remain release work.

## 2026-11-03 — pixel MMO rebuild, and polish as a standing goal

The game was rebuilt as a pixel-art step MMO (RuneScape and WalkScape inspired): see `docs/superpowers/specs/2026-11-02-steps-mmo-design.md` at the repo root. Entries above this one describe the earlier companion and trail game and are kept as history. Their spacing tokens, Monaspace type and screen names no longer apply. `AGENTS.md` now states the standing goal: keep polishing every session.

First polish pass. Browser checks ran at 320×640, 390×844 and 1280×800; there were no native-device checks.

- The bag's "inventory" segment label was clipped at 320. It is now "items".
- Panel titles collided with their side notes at 320, e.g. "your bruh is idle" next to "6,240 steps waiting". Title rows now wrap, and the note drops under the title.
- A new player in bruhbridge saw a wall of red "needs…" smithing recipes first. Skill groups and recipes with something startable now come first, so the starter straw hat leads.
- The idle panel now offers one tap: "start <best activity here>", or "find work on the map" when nothing here is startable. It stays hidden when the bag is full, since the bank actions take over.
- The world bag strip's "food buff" label wrapped at 320. It is now "buff".

Remaining:
- On web, the screen title shows its focus ring on load, because focus moves to it on entry. Keep this for keyboard users unless a quieter treatment proves accessible.
- At 320, the activity rows' "uses …" line wraps to two lines.
- Balance numbers are unvalidated.
- Native device checks of sheets, modals and safe areas are still pending.

## 2026-11-03 — second polish pass: the four open items

Checks covered the browser at 320×640 and 390×844, and the Android emulator (Medium Phone, API 36, 411×914 dp, gesture navigation) on a debug build against Metro. The iOS simulator could not run: Xcode 26.6 needs the iOS 26.5 simulator platform, and only an iOS 17.2 runtime is installed.

- **Title focus ring on load (fixed).** The first screen of a page load no longer moves focus to its title, so the page opens without a ring and focus stays on the body. Every later entry still focuses the title, and keyboard navigation shows the ring (opening the character screen with Enter, for example). A direct load of `/character` also starts with no ring.
- **Activity "uses …" wrap at 320 (fixed).** Recipe inputs are now item sprites with "×qty", which fit on one line at 320. The row's accessible label still spells out the inputs in words, and the red "needs …" line still names what is missing.
- **Balance (validated, one rule retuned).** `pnpm balance` (`scripts/balance.ts`) reports pacing with the real rules at 7,000 steps a day:
  - Gathering skills: level 10 in about half a day, 30 in about 4 days, 50 in about 20, and 99 in about 4.5 years. The early quests are reachable within 2 days, and the big catch takes about 38.
  - Two weeks at one spot: about 2,000 actions, two or three bank trips, and roughly one skill chest a day. Gem rates matched their odds over 40 seeds.
  - Agility was far behind: about a year to level 50 and decades to 99. It now earns 1 point per 4 road steps and per 12 work steps, worth 8% more per agility level. That makes 50 about a month and 99 about 5.5 years, slightly behind the active skills.
  - Dragonfruit peak moved from agility 25 to 40, about 15 days in. At 25 it opened around day 5, with nothing doable until level 50.
  - Tests cover the rate, the level boost and small syncs.
- **Native check (Android done; iOS and physical phones still pending).**
  - The HUD, scene, panels, map, quests, bag and tab bar stay inside the system bars, and scrolled content clips at the status bar edge.
  - Sheets clear the gesture bar, and Android back closes them.
  - At 1.3× font scale, text wraps without clipping.
  - Fixes from this check:
    - The activity sheet's start button was below the fold, so sheets now take a pinned `footer`.
    - Map labels were hard to read over terrain and markers, so they sit on a dark plate.
    - Labels near the map's edges grow inward; "blueberry bay" was clipped at 320.
    - New quests used the danger red, so they are now neutral text.

Remaining:
- Run the iOS simulator check once the iOS 26.5 simulator platform is installed (Xcode › Settings › Components). Physical-phone checks of Health sync, haptics and screen readers are still pending.
- On Android, a font-scale change restarts the activity, and the dev build then logs "linking configured in multiple places" (Expo Router). The save and screen survive, but the warning needs a check on a release build.
- Item sheets with long loot tables still put their actions below the fold on short screens. Consider the new sheet footer for the primary action.
- Balance gaps are content, not numbers: nothing unlocks between level 50 and 99, no quests sit between the early ones and the big catch, and coins have few sinks beyond iron tools.

## 2026-11-03 — content pass: late game, missions, item sheets

Browser checks ran at 320×640 and 390×844, using generated late-game saves (total level 618, moonlit grove, 48,250 coins). This was JS-only work, so the Android build from the previous pass was not rebuilt.

- **Item sheets.** Wear/wield, take off, eat and open moved into the sheet's pinned footer. A bird nest's "open 1 / open all" now stays visible below its eight-row loot table at 320.
- **Missions replace daily tasks.** The quests tab has daily, weekly and monthly segments, each showing its ready count. Every mission shows progress, a goal line, coin and chest rewards, and time left. The world screen's ready button counts missions.
- **Quest journal.** With 20 quests, each row now shows its status: ready to start (green), in progress with the hand-in town, complete, or the first unmet requirement.
- **HUD at 320.** Five-digit coin totals overlapped "quest pts". Coins and the pouch now shorten to 48.2k and 1.2m, while screen readers still hear the full number.
- **Map.** Added the moonlit grove (night forest tiles) and the starfall crater island. The grove marker moved one tile so its label clears "durian dunes".
- **Store.** A backpack upgrade panel sits above the stock, showing the slot change and price, and a fully upgraded state.

Remaining:
- Late-game outfits need the hosted API's skin validator updated and deployed.
- Native re-check of the new screens is pending: the iOS simulator platform is downloading, and the Android build predates these changes.
- With 20 entries the quest journal is long. If it grows further, consider grouping finished quests.

## 2026-11-03 — iOS simulator pass

Ran on the iPhone 17 Pro simulator (iOS 26.5, Dynamic Island) with a debug build against Metro. Taps were driven by mouse events posted to the Simulator window. VoiceOver does not run in the simulator, so screen-reader checks are still pending.

- **Safe areas.** The HUD sits below the Dynamic Island, and the tab bar clears the home indicator. Scrolled content clips at the status bar.
- **Health sync works end to end.**
  - "Connect Apple Health" showed the system prompt, which asks only for Steps, read-only.
  - With no data, the app correctly reported "no readable steps".
  - After adding 6,420 steps in the Health app, coming back to the foreground synced them ("Apple Health · synced 10:14 AM"), and all 6,420 appeared in the pouch.
  - Starting the straw hat spent them and opened the loot report.
- **Fixed: sheets and the loot report ignored the home indicator.** Inside a React Native `Modal` on iOS, `SafeAreaView` got no insets, so a sheet's pinned button sat about 13 pt from the bottom edge. Both now pad with `useSafeAreaInsets()` from the app's provider, and the sheet's panel colour runs under the indicator.
- **Fixed: bar labels clipped at large text sizes.** At extra-extra-extra-large text, the mission progress numbers were cut off inside 8 pt bars. Labelled bars now use a minimum height and grow with their text.
- **Fixed: Health permission wording.** It still mentioned "daily adventures" from the old game. It now says what the step totals pay for, and that Outside never writes to Health. This takes effect on the next native build.

Remaining:
- VoiceOver and TalkBack checks: VoiceOver needs a physical iPhone; TalkBack needs an emulator image with Google Play.
- Haptics need a physical phone.
- The Android font-scale warning needs a check on a release build.

## 2026-11-03 — playthrough pass: first session and stage snapshots

There were two inputs:
- An independent reviewer played about 90 interactions from fresh saves at 390×844 and 320×640, without seeing earlier notes.
- Saves built from the real XP curve at days 1, 7, 30 and 180 (7,000 steps a day split across skills), checked at 320 and 390.

Fixed:
- **Digits and ligatures (major; earlier passes misread this too).**
  - Pixelify Sans draws 5 like S or 8 and 2 like S, and its fi/fl ligatures read as "A". The "+500" walk button read "+800", a 150-coin mission read "180", and "fishing" read "Ashing".
  - `scripts/patch-fonts.py` rebuilds the fonts with 5×7 digits and % on Pixelify's own grid (heavier for Bold), with ligatures off. The family is renamed "Pixelify Sans Outside".
  - Checked in Chrome at 15–56 px.
- **The town activity list (about 35 rows at day 30).**
  - Places with several skills now show skill tabs (wrapping to two rows at the crater) and one skill at a time.
  - Each skill leads with the best three recipes you can start now, then the highest-level ones that only need materials, then the next unlock. Older recipes fold behind "show N older recipes".
- **The next step.** `nextStep()` replaces "highest-xp recipe here", which suggested a straw hat that stops after one action. In order it offers:
  1. Hand in a ready quest.
  2. Work toward an active quest's items, here or after a walk, following recipes back to their raw inputs.
  3. Start a fresh quest.
  4. Steady work that can run at least five times.
  5. A walk to gather for the lowest gathering skill.

  Buttons say how far the pouch goes ("uses your 6,240 waiting steps: about 104 actions"; "900 steps on the road, then about 98 actions"), and the activity sheet's start button says the same. Tests cover the first-quest path and the one-off-recipe case.
- **Quests.**
  - The journal sorts in progress, then ready, then locked, and folds completed quests away.
  - Quest details say where each missing item comes from ("fishing minnow shoal at longan lake (fishing 1)").
  - Item sheets warn before you eat, sell or drop something an active quest needs.
  - The completion report shows quest points, and a hand-in button appears on the world screen while working.
- **Reports.**
  - Agility-only level-ups no longer open the modal on nearly every walk.
  - The headline says "your bruh got to work" when an action spent waiting steps.
  - Level-ups show the jump (+10 levels) and what they unlocked.
  - Loot is named, and burnt fish are explained.
- **Missions changed mid-session (bug).** New saves opened their periods only on the first sync, and the draw followed the save's moving dice. Saves now open periods at creation, and draws depend only on the period, so they're stable and shared by everyone. A regression test covers it.
- **320×640.**
  - The idle panel's button was under the sticky walk bar. Short screens now get a bottom-anchored 3.2:1 scene crop, and the button sits above the explanation.
  - Map taps showed their travel panel off-screen; the travel action is now a pinned footer.
- **Smaller fixes.**
  - Empty progress bars use a neutral track instead of red.
  - "Bank everything" keeps chests in the bag.
  - Store tools show "owned" or "have better".
  - The bank total reads "worth N".
  - Map skill tags are sprites instead of "woodc 1", and the map legend names the green you-are-here marker.
  - The activity sheet explains efficiency and doubles in one line, and recipe blockers read "needs bronze bar ×2".

Not changed, noted:
- The reviewer's one "useGame must be called inside GameProvider" error came from hot reloads while these edits were landing, and didn't recur.
- Agility leads the other skills for players who spread their steps (49 at day 30 against about 30), which suits a passive skill.
- Plural item names ("98 raw minnow"), the character screen's chests found/opened wording, and outfit tiles' button role remain.

## 2026-11-03 — UI copy pass

Applied the copy standards now written in `AGENTS.md` (UI copy section).

- **Plurals.** `itemCount()` is the one way to write an item count. Loot reports, toasts, recipes, mission and quest rewards now read "98 raw minnows", "1 message in a bottle", "40 coal". A test runs the rule over all 117 item names.
- **One term per concept.**
  - "Inventory" and "backpack" became "bag".
  - "Buff" became "food bonus".
  - Stat names now match everywhere: work speed, extra action chance, double loot chance, rare find chance, chest chance, bag slots.
  - "XP" became "xp" on the Health screen.
- **Toasts are active.** "equipped X." and "took off X." replace "X equipped/unequipped". "ate the minnow. its bonus lasts 40 actions." replaces "you eat the minnow. buff active…". "Bank everything" says when chests stay behind.
- **Errors and settings.**
  - The save error now says what to do: "couldn't save your progress. free up space on this device, then retry."
  - The Health screen no longer reads like an app named "Steps".
  - The erase confirmation dropped "companions", a leftover from the old game.
- **Activity sheet.**
  - "base 60 · −8" became "per action · 8 fewer with your work speed".
  - Stat values dropped "~", which the pixel font draws as a dash.
  - The explanation moved from all-caps label type to body text.
- **Glyphs.** Silkscreen Bold's "%" read as "Z". `scripts/patch-fonts.py` now redraws it on Silkscreen's grid. The walk-distance readout also dropped "~".
- **HTML head.** The meta description "Turn steps into XP and quests with bruhs." now matches the lowercase title and the glossary: "a pixel step adventure. your real steps pay for your bruh's travel, skills and quests."
- **Character screen.** "chests found" became "chests found while working", so it no longer looks lower than "chests opened" by mistake.
