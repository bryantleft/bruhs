import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { type ScrollView, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from '../../components/MotionProvider';
import { PageTitle, useTabStat } from '../../components/PageTitle';
import { PlaceCard, PlaceMap } from '../../components/PlaceMap';
import { Screen } from '../../components/ui';
import { WorldHere } from '../../components/WorldHere';
import { getActivity, getLocation, START_LOCATION } from '../../game/content';
import { useGame } from '../../game/GameProvider';
import { useScreenFocus } from '../../navigation/useScreenFocus';
import { Segments } from '../../pixel/chrome';
import { MAP_HEIGHT, MAP_WIDTH, tileCenter } from '../../pixel/world';
import { color, font } from '../../theme/theme';

const VIEWS = ['here', 'map'] as const;
type WorldView = (typeof VIEWS)[number];

export default function WorldScreen(): React.JSX.Element {
  const { game, tracking, syncHealth } = useGame();
  const screen = useScreenFocus({ returnToTab: true });
  const steps = useTabStat('steps');
  // The world tab has two views: here (your bruh and what it's doing) and the map (where to go next).
  const [view, setView] = useState<WorldView>('here');
  const [selected, setSelected] = useState(game.travel?.to ?? game.location);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const reduced = useReducedMotion();
  const mapFrame = useRef<Readonly<{ y: number; width: number }> | null>(null);
  const viewport = useRef({ offset: 0, height: 0 });
  // The place card changes height with the place, which resizes the scroll area after a tap.
  const [viewportHeight, setViewportHeight] = useState(0);
  const [reveal, setReveal] = useState(0);
  const show = (next: WorldView): void => {
    if (next === 'map') setSelected(game.travel?.to ?? game.location);
    setView(next);
    scroll.current?.scrollTo({ y: 0, animated: false });
    viewport.current.offset = 0;
    if (next === 'map') setReveal((count) => count + 1);
  };
  const select = (id: string): void => {
    setSelected(id);
    setReveal((count) => count + 1);
  };
  // Keep the chosen place, its marker above and its label below, inside the scroll area, so a
  // trip's far end or a tap near the bottom edge isn't left under the place card.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs per selection, map open and card resize.
  useEffect(() => {
    const frame = mapFrame.current;
    const { offset, height } = viewport.current;
    if (!reveal || view !== 'map' || !frame || !height) return;
    const y = frame.y + (tileCenter(selected).y / MAP_HEIGHT) * ((frame.width * MAP_HEIGHT) / MAP_WIDTH);
    const top = y - 48;
    const bottom = y + 64;
    const to = bottom > offset + height ? bottom - height : top < offset ? Math.max(0, top) : null;
    if (to !== null) scroll.current?.scrollTo({ y: to, animated: !reduced });
  }, [reveal, viewportHeight]);
  const place = getLocation(game.location) ?? getLocation(START_LOCATION);
  const activity = game.task ? getActivity(game.task.id) : undefined;
  if (!place) return <Screen rootRef={screen}>{null}</Screen>;
  const traveling = !!game.travel;
  const sceneLabel = traveling
    ? `Your bruh walking to ${getLocation(game.travel?.to ?? '')?.name}`
    : activity
      ? `Your bruh ${activity.verb} at ${place.name}`
      : `Your bruh standing in ${place.name}`;
  return (
    <Screen
      rootRef={screen}
      scrollRef={scroll}
      onRefresh={syncHealth}
      refreshing={tracking.status === 'syncing'}
      footer={view === 'map' ? <PlaceCard selected={selected} onTravel={() => show('here')} /> : undefined}
      onViewport={(height) => {
        viewport.current.height = height;
        setViewportHeight(height);
      }}
      onScroll={(event) => {
        viewport.current.offset = event.nativeEvent.contentOffset.y;
      }}
    >
      <View style={styles.header}>
        <PageTitle title={traveling ? 'on the road' : place.name} stat={steps} />
        {view === 'here' ? (
          <Text style={styles.blurb}>{traveling ? 'step by step, the fruitlands go by.' : place.blurb}</Text>
        ) : null}
      </View>
      <Segments value={view} options={VIEWS} onChange={show} />
      {view === 'map' ? (
        <PlaceMap
          selected={selected}
          onSelect={select}
          onMapLayout={(frame) => {
            const first = !mapFrame.current;
            mapFrame.current = frame;
            if (first) setReveal((count) => count + 1);
          }}
        />
      ) : (
        <WorldHere place={place} onMap={() => show('map')} sceneLabel={sceneLabel} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 2 },
  blurb: { fontFamily: font.body, fontSize: 15, lineHeight: 20, color: color.secondary },
});
