# Pith UI audit, 2026-11-12

The audit found five issues: one high and four medium. All five have fixes verified by the checks below. No critical issue was found in the tested flows.

## Design verdict

The visual direction passes the anti-pattern review. The interface uses native Mac controls with warm bruhs surfaces, restrained persimmon accents and Monaspace for data. It avoids decorative card grids, unnecessary shadows and competing primary actions. The existing semantic roles, compact app rows and single scrolling Disk side column are worth preserving. Accessibility checks cover keyboard interaction and exposed controls; actual VoiceOver speech remains a release check.

The most useful changes were layout and recovery fixes, rather than a visual redesign.

## Findings and fixes

| Severity | Category | Location | Finding and impact | Resolution |
| --- | --- | --- | --- | --- |
| High | Responsive, accessibility | `SettingsView.swift` | Release settings required 735 points of content height and disabled scrolling. The bottom controls could fall outside a short display. | A stable 560-point content area with a scrolling form in every pane. General, Monitoring and Connections were checked in the running app; the bottom of the release form is captured too. |
| Medium | Responsive, recovery | `ActivityViews.swift` | A long unmatched query was repeated in the table overlay, covering the header and most of the table. There was no recovery action beside the message. | Compact copy, a hint and Clear Search. The running app was tested with a 1,620-character query and Clear Search restored the list. Empty historical ranges also use the range-specific message. |
| Medium | Responsive, readability | `ActivityChart.swift` | The final clock label could collide with “now” in a narrow chart at larger text sizes. A fixed time clearance does not describe the labels' physical widths. | Both labels participate in one measured collision group, with “now” taking priority. |
| Medium | Responsive, pointer interaction | `treemap-canvas.tsx` | Hover cards could extend beyond the clipped map, hiding their name and instructions at 140% text. | Clamp both axes using the card's own dimensions, cap its width, and let pointer events pass through. No layout reads are added to pointer movement. |
| Medium | Accessibility, responsive | `treemap-items.tsx` | The focused accessible item list could be wider than the map, clipping Add and Open controls. | Cap the list width to its containing map. Keyboard selection and activation remain intact. |

The two Disk issues shared a cause: floating content was sized independently of its containing map. They now respect the same boundary. Native forms keep system typography and chrome; the fixes retain the existing bruhs content tokens.

## Evidence

Local artifacts are under `/tmp/bruhs-ui-audit`.

| Fix | Before | After |
| --- | --- | --- |
| Settings height | [Before](/tmp/bruhs-ui-audit/native-before/settings-100-light.png) | [After](/tmp/bruhs-ui-audit/native-after/settings-100-light.png), [scrolled to bottom](/tmp/bruhs-ui-audit/native-after/settings-bottom-100-light.png) |
| Long search | [Before](/tmp/bruhs-ui-audit/native-before/search-long-140-dark.png) | [After](/tmp/bruhs-ui-audit/native-after/search-long-140-dark.png) |
| Chart labels | [Before](/tmp/bruhs-ui-audit/native-before/activity-820-140-dark-inspector.png) | [After](/tmp/bruhs-ui-audit/native-after/activity-820-140-dark-inspector.png) |
| Hover card | [Before](/tmp/bruhs-ui-audit/disk-tooltip-before-820-text140-light.png) | [After](/tmp/bruhs-ui-audit/disk-tooltip-after-820-text140-light.png) |
| Accessible item list | [Before](/tmp/bruhs-ui-audit/disk-accessible-list-before-820-text140-dark.png) | [After](/tmp/bruhs-ui-audit/disk-accessible-list-after-820-text140-dark.png) |

Native renders request widths of 820 and 1,180 points, 100% and 140% text, and light/dark appearances, with and without the inspector. At 140%, the inspector's effective minimum can expand a requested 820-point render to roughly 945 points. `native-after/native-layout.json` records both requested and actual bounds for each of its 36 captures; filenames describe the request. Native cached bitmaps have some AppKit material/layer artifacts, so live interaction checks supplement them.

The real bundled Disk renderer was exercised in the browser at widths 820, 1,024, 1,280 and 1,920, and text sizes 85%, 100% and 140%. Checks included light/dark hover boundaries, arrow and Shift-arrow selection, Add activation with Enter, empty/error recovery, and console/network errors. The fixture server and preview tab were closed afterward.

To repeat native captures without changing saved preferences or history:

```sh
apps/storage/native/.build/Pith.app/Contents/MacOS/Pith \
  --ui-audit /tmp/bruhs-ui-audit/native-repeat
```

## Verification and limits

All 414 Swift tests, 293 Node tests and 111 packaged smoke checks pass; the smoke run took 168.3 seconds. Biome, native-renderer TypeScript, both theme lints, the native theme lint, generated-token checks, the 21 semantic roles' contrast checks and strict code-signature verification pass. The native app builds with warnings as errors. The shared checkout also contained unrelated MCP connection work, which was left out of these commits; local test counts include its checks. Packaged verification is recorded in `VERIFICATION.md`.

Actual VoiceOver speech, touch emulation, throttled 3G and other macOS versions were not exercised in this audit. Pith is a local macOS app; native layout and keyboard checks were prioritized over a phone/network matrix. The separate release checks already listed in `VERIFICATION.md` remain applicable.
