import * as Haptics from 'expo-haptics';
import { useIsFocused } from 'expo-router';
import { type ComponentRef, useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Linking, Platform, type Pressable, StyleSheet, View } from 'react-native';
import { ConfirmAction } from '../components/ConfirmAction';
import { Icon } from '../components/Icon';
import { keepFocusVisible } from '../components/keepFocusVisible';
import { useReducedMotion } from '../components/MotionProvider';
import { StreetMap } from '../components/StreetMap';
import { Button, Copy, IconButton, Progress, Screen } from '../components/ui';
import { useWalkControlFocus } from '../components/useWalkControlFocus';
import { WalkDistance } from '../components/WalkDistance';
import { useExplore } from '../explore/ExploreProvider';
import type { MapStatus } from '../explore/map';
import { elapsedWalk, formatDistance, formatWalkTime, lastFix, STAMPS, type Walk } from '../explore/walk';
import { useGame, useGameFeedback } from '../game/GameProvider';
import { backToAdventure, useScreenFocus } from '../navigation/useScreenFocus';
import { color, layout, motion, radius, space } from '../theme/theme';

const MIN_MAP_SIZE = 260;

type MapLoadState =
  | Readonly<{ status: 'loading' | 'ready' }>
  | Readonly<{ status: 'error'; hasLoaded: boolean }>;

function WalkStats({ walk, stamps }: Readonly<{ walk: Walk | null; stamps: number }>): React.JSX.Element {
  const [now, setNow] = useState(Date.now);
  const active = walk?.status === 'recording';
  const time = formatWalkTime(walk ? elapsedWalk(walk, active ? now : walk.updatedAt) : 0);
  const focused = useIsFocused();
  const reduced = useReducedMotion();
  const { reward } = useGameFeedback();
  const walkId = walk?.startedAt;
  const seen = useRef({ walkId, stamps });
  const stampScale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const previous = seen.current;
    // Consume hidden/restored progress too, so returning never replays an award.
    seen.current = { walkId, stamps };
    stampScale.setValue(1);
    const previousCount = walkId === previous.walkId ? previous.stamps : 0;
    if (!active || !focused || reward || stamps <= previousCount) return;
    if (Platform.OS !== 'web') {
      const feedback =
        Platform.OS === 'android'
          ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm)
          : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void feedback.catch((error: unknown) => console.warn('Discovery haptic could not play:', error));
    }
    if (reduced) return;
    stampScale.setValue(0.92);
    const animation = Animated.timing(stampScale, {
      toValue: 1,
      duration: motion.standard,
      easing: Easing.bezier(0.2, 0, 0, 1),
      useNativeDriver: Platform.OS !== 'web',
    });
    animation.start();
    return () => animation.stop();
  }, [active, focused, reduced, reward, stampScale, stamps, walkId]);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    // A one-second display tick stays isolated from map and route rendering.
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [active]);
  return (
    <View style={styles.stats}>
      <Copy variant="label">distance</Copy>
      <WalkDistance meters={walk?.distanceMeters ?? 0} />
      <View style={styles.statsMeta}>
        <Copy variant="label" accessibilityLabel={time.label} style={styles.walkTime}>
          time {time.clock}
        </Copy>
        <Animated.View style={[styles.stampCount, { transform: [{ scale: stampScale }] }]}>
          <Icon name={stamps ? 'check' : 'leaf'} tint={stamps ? color.success : color.muted} />
          <Copy
            variant="label"
            accessibilityLabel={`${stamps} of ${STAMPS.length} distance stamps earned`}
            accessibilityLiveRegion="polite"
            style={[styles.stampCountText, stamps > 0 && { color: color.success }]}
          >
            {stamps} / {STAMPS.length}
          </Copy>
        </Animated.View>
      </View>
    </View>
  );
}

export default function ExploreScreen(): React.JSX.Element {
  const screen = useScreenFocus();
  const { state, recorder } = useExplore();
  const { game, demo } = useGame();
  const [mapState, setMapState] = useState<MapLoadState>({ status: 'loading' });
  const lastMapState = useRef<MapLoadState>({ status: 'loading' });
  const mapStatus = mapState.status;
  const unavailableMap = mapState.status === 'error' && !mapState.hasLoaded;
  const [mapAttempt, setMapAttempt] = useState(0);
  const mapHeading = useRef<ComponentRef<typeof View>>(null);
  const mapReload = useRef<ComponentRef<typeof Pressable>>(null);
  const mapSurface = useRef<ComponentRef<typeof View>>(null);
  const [recenter, setRecenter] = useState(0);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const { walk, location } = state;
  const point = lastFix(walk);
  const active = walk?.status === 'recording';
  const complete = walk?.status === 'complete';
  const {
    buttonRefs,
    onKeyDownCapture,
    onLayout: onControlsLayout,
  } = useWalkControlFocus(
    state.loading === 'error'
      ? 'reload'
      : location.status === 'requesting'
        ? 'cancel'
        : active
          ? 'pause'
          : walk?.status === 'paused'
            ? 'resume'
            : 'start',
    state.save.status === 'saving',
    screen,
  );
  const meters = walk?.distanceMeters ?? 0;
  const earned = STAMPS.filter((stamp) => meters >= stamp.meters);
  const next = STAMPS.find((stamp) => meters < stamp.meters);
  const mapCaption =
    location.status === 'weak'
      ? `GPS ±${Math.round(location.accuracy)} m`
      : active
        ? point
          ? 'recording'
          : 'waiting for GPS…'
        : walk?.status === 'paused'
          ? 'paused'
          : null;
  const focusMapControls = useCallback((hideMap = false) => {
    if (
      Platform.OS === 'web' &&
      (document.activeElement === mapReload.current ||
        (hideMap &&
          mapSurface.current instanceof HTMLElement &&
          mapSurface.current.contains(document.activeElement))) &&
      mapHeading.current instanceof HTMLElement &&
      !mapHeading.current.closest('[inert], [aria-hidden="true"]')
    ) {
      // Keep focus on controls that survive a hidden map or Reload remount.
      mapHeading.current.focus({ preventScroll: true });
      keepFocusVisible(mapHeading.current.closest('[data-focus-content]'));
    }
  }, []);
  const updateMapStatus = useCallback(
    (status: MapStatus) => {
      const previous = lastMapState.current;
      if (status === previous.status) return;
      const next: MapLoadState =
        status === 'error'
          ? {
              status,
              hasLoaded: previous.status === 'ready',
            }
          : { status };
      if (next.status !== 'loading') {
        focusMapControls(next.status === 'error' && !next.hasLoaded);
      }
      lastMapState.current = next;
      setMapState(next);
    },
    [focusMapControls],
  );
  const reloadMap = () => {
    focusMapControls();
    updateMapStatus('loading');
    setMapAttempt((value) => value + 1);
  };
  const saveIssue =
    state.save.status === 'error' ? (
      <View
        key="walk-save"
        style={styles.issue}
        onKeyDownCapture={onKeyDownCapture}
        onLayout={onControlsLayout}
      >
        <Copy variant="small" style={styles.error}>
          {state.save.message}
        </Copy>
        <Button
          key="retry"
          buttonRef={buttonRefs.retry}
          label="retry saving walk"
          variant="outline"
          onPress={() => recorder?.retrySave()}
        />
      </View>
    ) : null;
  const walkActions = (
    <View key="walk-actions" style={styles.walkActions}>
      <View key={active ? 'pause' : 'resume'} style={styles.walkAction}>
        {active ? (
          <Button
            key="pause"
            buttonRef={buttonRefs.pause}
            label="pause"
            accessibilityLabel="pause walk"
            icon="pause"
            variant="outline"
            onPress={() => recorder?.pause()}
          />
        ) : (
          <Button
            key="resume"
            buttonRef={buttonRefs.resume}
            label="resume"
            accessibilityLabel="resume walk"
            icon="trail"
            disabled={state.loading !== 'ready'}
            onPress={() => void recorder?.start()}
          />
        )}
      </View>
      <View key="finish" style={styles.walkAction}>
        <Button
          key="finish"
          buttonRef={buttonRefs.finish}
          label="finish"
          accessibilityLabel="finish walk"
          icon="check"
          variant={active ? 'primary' : 'outline'}
          onPress={() => recorder?.finish()}
        />
      </View>
    </View>
  );
  const controls = (
    <View style={styles.controls} onKeyDownCapture={onKeyDownCapture} onLayout={onControlsLayout}>
      {location.status === 'error' ? (
        <View style={styles.issue}>
          <Copy variant="small" accessibilityLiveRegion="polite" style={styles.error}>
            {location.message}
          </Copy>
          {Platform.OS === 'web' && location.settings ? (
            <Copy variant="small">
              allow location for this site in your browser settings, then try again.
            </Copy>
          ) : null}
        </View>
      ) : null}
      {settingsError ? (
        <Copy variant="small" style={styles.error}>
          {settingsError}
        </Copy>
      ) : null}
      {state.loading === 'error' ? (
        <Button
          key="reload"
          buttonRef={buttonRefs.reload}
          label="open saved walk again"
          icon="refresh"
          onPress={() => void recorder?.load()}
        />
      ) : location.status === 'requesting' ? (
        <>
          <Button key="finding" label="finding your location…" disabled onPress={() => {}} />
          <Button
            key="cancel"
            buttonRef={buttonRefs.cancel}
            label="cancel"
            variant="outline"
            onPress={() => recorder?.pause()}
          />
        </>
      ) : (
        <>
          {!active && location.status === 'error' && location.settings && Platform.OS !== 'web' ? (
            <Button
              key="settings"
              buttonRef={buttonRefs.settings}
              label="open location settings"
              icon="settings"
              variant="outline"
              onPress={() => {
                void Linking.openSettings().catch(() =>
                  setSettingsError(
                    'couldn’t open settings. allow location in your phone settings, then return here.',
                  ),
                );
              }}
            />
          ) : null}
          {active || walk?.status === 'paused' ? (
            walkActions
          ) : (
            <Button
              key="start"
              buttonRef={buttonRefs.start}
              label="start a walk"
              icon="trail"
              disabled={state.loading !== 'ready'}
              onPress={() => void recorder?.start()}
            />
          )}
        </>
      )}
      <Copy variant="label" style={styles.note}>
        {active
          ? 'switching apps pauses recording.'
          : 'location only during walks. routes stay on this device.'}
      </Copy>
    </View>
  );
  return (
    <Screen rootRef={screen} bottomSafeArea footer={controls}>
      <View style={styles.header}>
        <IconButton icon="back" label="Back to Play" onPress={() => backToAdventure('/explore')} />
        <Copy variant="title" style={styles.title}>
          {complete ? (state.save.status === 'saved' ? 'walk saved' : 'walk done') : 'walk'}
        </Copy>
      </View>
      {state.loadError ? (
        <Copy variant="small" accessibilityLiveRegion="polite" style={styles.error}>
          {state.loadError}
        </Copy>
      ) : null}
      {walk ? <WalkStats key="walk-stats" walk={walk} stamps={earned.length} /> : null}
      {saveIssue}
      <View key="walk-map" style={styles.mapCard}>
        <View
          ref={mapHeading}
          role={Platform.OS === 'web' ? 'group' : undefined}
          accessibilityLabel={Platform.OS === 'web' ? 'Walk map controls' : undefined}
          tabIndex={Platform.OS === 'web' ? -1 : undefined}
          {...(Platform.OS === 'web' ? { dataSet: { insetFocus: 'true' } } : {})}
          style={[styles.mapHeading, Platform.OS === 'web' && styles.mapFocus]}
        >
          <View style={styles.mapLabel}>
            <Icon name="map" tint={color.success} />
            {mapStatus !== 'ready' || mapCaption ? (
              <View style={styles.mapStatuses}>
                {mapStatus !== 'ready' ? (
                  <Copy
                    variant="label"
                    accessibilityLabel={mapStatus === 'loading' ? 'loading map…' : undefined}
                    accessibilityLiveRegion="polite"
                    style={styles.mapStatus}
                  >
                    {mapStatus === 'loading' ? 'loading…' : 'map error'}
                  </Copy>
                ) : null}
                {mapCaption ? (
                  <Copy
                    variant="label"
                    accessibilityLabel={
                      location.status === 'weak'
                        ? `GPS accuracy plus or minus ${Math.round(location.accuracy)} meters`
                        : undefined
                    }
                    style={styles.caption}
                  >
                    {mapCaption}
                  </Copy>
                ) : null}
              </View>
            ) : null}
          </View>
          <View style={styles.mapRecenter}>
            {Platform.OS === 'web' && mapStatus === 'loading' ? (
              <Button
                buttonRef={mapReload}
                label="reload"
                accessibilityLabel="reload map"
                icon="refresh"
                variant="ghost"
                onPress={reloadMap}
              />
            ) : (
              <IconButton
                icon="locate"
                label={complete ? 'Show your whole walk' : 'Center map on your bruh'}
                disabled={!point}
                onPress={() => setRecenter((value) => value + 1)}
              />
            )}
          </View>
        </View>
        {mapStatus === 'error' ? (
          <View style={[styles.issue, styles.mapIssue]}>
            <Button
              buttonRef={mapReload}
              label="reload map"
              variant="outline"
              icon="refresh"
              onPress={reloadMap}
            />
            {!complete ? <Copy variant="small">GPS recording can continue.</Copy> : null}
          </View>
        ) : null}
        <View
          ref={mapSurface}
          aria-hidden={unavailableMap}
          pointerEvents={unavailableMap ? 'none' : 'auto'}
          style={unavailableMap ? styles.unavailableMap : styles.map}
        >
          <View style={styles.mapContent}>
            <StreetMap
              key={mapAttempt}
              walk={walk}
              skin={game.equipped}
              recenter={recenter}
              onStatus={updateMapStatus}
            />
          </View>
        </View>
      </View>
      {!walk ? <WalkStats key="walk-stats" walk={walk} stamps={earned.length} /> : null}
      <View style={styles.stamps}>
        {STAMPS.map((stamp) => {
          const unlocked = meters >= stamp.meters;
          const status = unlocked ? 'earned' : complete ? 'not reached' : 'locked';
          // The next stamp shows how far there is to go in its own row, while a walk can still earn it.
          const upcoming = !complete && stamp.id === next?.id;
          const left = formatDistance(Math.ceil(Math.max(0, stamp.meters - meters)));
          return (
            <View
              key={stamp.id}
              style={styles.stamp}
              accessible
              accessibilityRole="image"
              accessibilityLabel={`${stamp.name}. ${stamp.meters.toLocaleString()} meters. ${status}${upcoming ? `, ${left} left` : ''}`}
            >
              <View style={styles.stampTop}>
                <View style={[styles.stampBadge, unlocked && styles.earned]}>
                  <Icon name={unlocked ? 'check' : 'lock'} tint={unlocked ? color.success : color.muted} />
                </View>
                <Copy variant="label" style={styles.stampNumber}>
                  {formatDistance(stamp.meters)}
                </Copy>
              </View>
              <Copy style={[styles.stampName, unlocked && { color: color.success }]}>{stamp.name}</Copy>
              {upcoming ? (
                <>
                  <Copy variant="small">{left} left</Copy>
                  <Progress
                    decorative
                    label={`${stamp.name}: ${Math.floor(meters)} of ${stamp.meters} meters`}
                    value={meters / stamp.meters}
                    tint={color.success}
                  />
                </>
              ) : null}
            </View>
          );
        })}
      </View>
      {!active &&
      location.status !== 'requesting' &&
      state.loading !== 'loading' &&
      (walk || state.loading === 'error') ? (
        <View onKeyDownCapture={onKeyDownCapture} onLayout={onControlsLayout}>
          <ConfirmAction
            buttonRef={buttonRefs.delete}
            label="delete saved walk"
            confirmLabel="yes, delete walk"
            cancelLabel="keep my walk"
            description="this removes the GPS route and its stamps from this device. your step progress stays."
            onConfirm={() => void recorder?.clear()}
          />
        </View>
      ) : null}
      <Copy variant="small">
        {demo ? 'GPS is real; step xp is a demo.' : 'GPS earns distance stamps. Health steps earn xp.'} only
        the latest walk is saved.
      </Copy>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.related },
  title: { fontSize: 24, lineHeight: 32, maxWidth: '100%', flexShrink: 1 },
  mapCard: {
    borderWidth: 1,
    borderColor: color.strongBorder,
    borderRadius: radius.mango,
    overflow: 'hidden',
    backgroundColor: color.panel,
  },
  mapHeading: {
    paddingLeft: space.group,
    paddingRight: space.tight,
    paddingVertical: space.tight,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: space.tight,
  },
  mapFocus: { borderRadius: radius.lychee },
  mapLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.tight,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    minWidth: 0,
    maxWidth: '100%',
  },
  mapStatuses: { gap: space.micro, flexShrink: 1, minWidth: 0 },
  mapRecenter: { marginLeft: 'auto' },
  mapStatus: { flexShrink: 1, minWidth: 0, color: color.secondary },
  mapIssue: { paddingHorizontal: space.group, paddingBottom: space.group },
  map: { width: '100%', aspectRatio: 1, minHeight: MIN_MAP_SIZE },
  mapContent: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    aspectRatio: 1,
    minHeight: MIN_MAP_SIZE,
  },
  // Native display:none deletes the map host; clip its existing full-size content instead.
  unavailableMap:
    Platform.OS === 'web'
      ? { display: 'none' }
      : {
          width: '100%',
          height: 0,
          minHeight: 0,
          minWidth: MIN_MAP_SIZE,
          overflow: 'hidden',
        },
  caption: { maxWidth: '100%', flexShrink: 1 },
  stats: { gap: space.micro },
  statsMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.related,
  },
  walkTime: { maxWidth: '100%', flexShrink: 1 },
  stampCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.micro,
    maxWidth: '100%',
    flexShrink: 1,
  },
  stampCountText: { flexShrink: 1 },
  stamps: { gap: space.group },
  stamp: { paddingBottom: space.group, borderBottomWidth: 1, borderColor: color.border, gap: space.tight },
  stampTop: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.related },
  stampBadge: {
    width: 40,
    height: 40,
    borderRadius: radius.lychee,
    backgroundColor: color.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  earned: { backgroundColor: `${color.success}18` },
  stampNumber: { maxWidth: '100%', flexShrink: 1 },
  stampName: { color: color.text },
  controls: { gap: space.tight, minHeight: layout.touch },
  walkActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.tight, minWidth: 0 },
  walkAction: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto', minWidth: 0, maxWidth: '100%' },
  note: { textAlign: 'center' },
  issue: { gap: space.tight },
  error: { color: color.primary },
});
