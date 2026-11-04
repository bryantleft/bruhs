# Read-only health steps

## Integration contract

The app uses `@kingstinct/react-native-healthkit` 16.2.0 with Nitro Modules 0.37.1 on iOS and `react-native-health-connect` 4.1.3 on Android. Installed TypeScript and native source were checked against Expo SDK 58 / React Native 0.88 before implementation.

HealthKit is queried with `queryStatisticsCollectionForQuantity`, `cumulativeSum`, `count`, and one-calendar-day intervals. An overlapping sample predicate retains steps spanning midnight. The library returns all populated statistics buckets, so the adapter filters to requested day starts before validating the batch. Read authorization is intentionally ambiguous; empty results do not mean permission was granted or denied.

Health Connect uses `aggregateGroupByPeriod` with one local calendar day per bucket, following its source-priority aggregation. It requests only `Steps` read access. The native library handles the Expo activity permission delegate. Our config plugin maps both Android privacy-policy actions to `bruhs-outside://health` before initial/new intent linking.

The sync cursor and daily game totals are saved together. A validated batch applies atomically; repeated totals do not add XP again. Already-earned progress is kept if health records decrease. A canceled request can neither begin a queued native read nor import a late result. Paused connections require an explicit connect/resume action before reads restart.

The first read imports today. Subsequent reads start from the earlier of the cursor's day and yesterday, clamped to the connection's start day and today's local midnight. This catches missed days and late watch records, handles DST, and keeps timezone travel from inverting the interval. Resuming after a pause starts with today.

## Optional party sharing

Configured parties add a separate read-and-upload path after create/join consent. It uses the existing native reader with `requestPermission: false`, a cursor covering the current race week, and the enabled Health connection. It filters the returned daily buckets to that week and submits only date/step pairs as the expected signed-in guest. It does not dispatch game imports or reward actions. Empty reads do not become fabricated zero days; explicit zero totals remain valid.

The board’s week starts Monday at 00:00 UTC, while Health buckets use the phone’s local calendar dates. Thus the race compares daily date labels, not an exact shared UTC sensor interval. Per-day database maxima make repeated uploads idempotent. Demo, paused and background states gate new reads; synchronous pause listeners invalidate pending reader results. An upload already committed by the server is not retracted by pausing.

The consent names the shared profile and daily totals. Local journey erasure preserves already-shared totals, as its confirmation states. Leaving removes the membership and shared scores; deleting the party profile also removes the guest Auth identity. GPS geometry and local game saves are outside this upload path. See [party setup and limitations](../README.md#private-parties-optional).

Before distribution, use two physical phones to compare Health totals with the party, test foreground and UTC-week changes, and pause/reset while a read is pending. Confirm that late reads do not begin uploads, previously committed totals follow the disclosed retention behavior, and leave/profile deletion remove only the intended shared data. Repeat across iOS and Android permission, token-refresh and reinstall states. Guest recovery after reinstall is not implemented.

## Sources

- [Apple: authorizing access to health data](https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data)
- [Apple: HealthKit overview](https://developer.apple.com/documentation/healthkit/)
- [Android: read aggregated data](https://developer.android.com/health-and-fitness/health-connect/aggregate-data)
- [Android: read data and background permissions](https://developer.android.com/health-and-fitness/health-connect/read-data)
- [HealthKit library](https://github.com/kingstinct/react-native-healthkit)
- [Health Connect library](https://github.com/matinzd/react-native-health-connect)
- [Expo: development builds](https://docs.expo.dev/develop/development-builds/introduction/)

## Device checks before distribution

1. Install a native build on iPhone and Android; connect and grant read access to Steps only.
2. Compare daily totals with each health app, including overlapping phone/watch sources and a midnight-spanning sample.
3. Re-sync repeatedly, restart the app, and confirm XP/quest bonuses are awarded once.
4. Walk with the app closed, then reopen it. Repeat across local midnight and after several days away.
5. Deny/revoke access, return to the app, and confirm actionable permission/no-readable-data states. On iOS do not expect a readable permission-denied flag.
6. Pause during an in-flight read, background/foreground the app, and verify no further imports occur. Resume and verify today's catch-up.
7. Open the privacy explanation from Health Connect on Android 13 and Android 14+; test both cold and running app states.
8. Confirm journey erasure stops sync and clears app progress while health-store records remain intact.
9. Complete health-access declarations and privacy disclosures in the store consoles before submission. These are distribution steps; no store submission was performed.

## Earlier local verification

The following results predate private parties. They do not certify the current integration or physical Health access. Current party evidence is recorded in [the research log](ui-ux-research.md).

- Biome, TypeScript, and all 38 game/health/session/history tests pass. The tests include atomic imports, repeated sync, cancellation, permission ambiguity, midnight, DST, timezone travel, reward dismissal intent, simultaneous milestones, historical backfill, selection idempotency, save-error priority/recovery, and missing versus zero-step history.
- Final Expo exports pass for iOS, Android, and web. These validate JavaScript bundles, not native HealthKit access.
- Android's ARM64 debug development build compiles successfully. Its merged manifest contains only `android.permission.health.READ_STEPS` among health permissions, disables backup, and includes both privacy explanation actions.
- Generated iOS configuration contains the HealthKit entitlement and read-purpose text, with no write-purpose text or background delivery entitlement. CocoaPods installation succeeds. Native compilation is blocked locally: Xcode reports “iOS 26.5 is not installed” for the required destination.
- Browser QA passes at 320×568, 390×844, and 1280×800, with no horizontal overflow and controls at least 48px. Camp → health → back navigation and the sample game flow pass without console errors. The standalone health route includes bottom safe-area handling in source; these browser checks do not verify native insets.

These checks do not prove hardware sensor accuracy or cross-device health-store behavior. No real health records or physical-device permission flows were verified.
