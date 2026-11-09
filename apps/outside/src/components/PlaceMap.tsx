import { Pressable, StyleSheet, Text, View } from 'react-native';
import { type Activity, getActivity, getItem, getLocation, LOCATIONS, type Place } from '../game/content';
import { useGame } from '../game/GameProvider';
import { activityBlocker, locationBlocker, route, travelCost } from '../game/game';
import { type Art, itemArt, SKILL_ART, UI_ART } from '../pixel/art';
import { Panel, Slot } from '../pixel/chrome';
import { Sprite } from '../pixel/Sprite';
import { palette } from '../theme/palette';
import { color, font, layout, shadow, space } from '../theme/theme';
import { Icon } from './Icon';
import { Button } from './ui';
import { WorldMap } from './WorldMap';

// The world tab's map view: the map and legend in the page, and the selected place in a card pinned
// above the tabs, so a tap on the map shows what's there, what it costs and the way to go without
// scrolling past the map.

type Station = Readonly<{ label: string; art: Art }>;

function stationsAt(place: Place): readonly Station[] {
  const has = (station: string): boolean =>
    place.activities.some((id) => getActivity(id)?.station === station);
  return [
    ...(has('forge') ? [{ label: 'forge', art: SKILL_ART.smithing }] : []),
    ...(has('range') ? [{ label: 'range', art: SKILL_ART.cooking }] : []),
    ...(has('workbench') ? [{ label: 'workbench', art: SKILL_ART.crafting }] : []),
    ...(place.bank ? [{ label: 'bank', art: UI_ART.bank }] : []),
    ...(place.store ? [{ label: 'store', art: UI_ART.coins }] : []),
  ];
}

// The colours of the map's place markers, drawn as the markers are rather than named in text.
const LEGEND = [
  { label: 'you', fill: palette['pandan-300'] },
  { label: 'town with a bank', fill: palette['durian-400'] },
  { label: 'wilds', fill: palette['lychee-400'] },
  { label: 'locked', fill: palette['rambutan-600'] },
] as const;

function usePlace(selected: string) {
  const { game } = useGame();
  const place = getLocation(selected) ?? getLocation(game.location);
  if (!place) return null;
  const path = route(game.location, place.id);
  const blocker = locationBlocker(game, place);
  const here = place.id === game.location && !game.travel;
  return {
    place,
    path,
    cost: path ? travelCost(game, path.distance) : 0,
    blocker,
    here,
    reachable: !game.travel && !here && !blocker,
  };
}

export function PlaceMap({
  selected,
  onSelect,
  onMapLayout,
}: Readonly<{
  selected: string;
  onSelect: (id: string) => void;
  // Where the map sits in the page, so the screen can scroll a chosen place into view.
  onMapLayout?: (frame: Readonly<{ y: number; width: number }>) => void;
}>): React.JSX.Element | null {
  const { game } = useGame();
  const view = usePlace(selected);
  if (!view) return null;
  const { place, path, reachable } = view;
  const locked = new Set(LOCATIONS.filter((entry) => locationBlocker(game, entry)).map((entry) => entry.id));
  const travelRoute = game.travel ? route(game.travel.from, game.travel.to) : null;
  const via =
    path && path.path.length > 2 ? path.path.slice(1, -1).map((id) => getLocation(id)?.name ?? id) : [];
  return (
    <>
      <View
        style={styles.mapBlock}
        onLayout={(event) =>
          onMapLayout?.({ y: event.nativeEvent.layout.y, width: event.nativeEvent.layout.width })
        }
      >
        <WorldMap
          location={game.location}
          selected={place.id}
          onSelect={onSelect}
          skin={game.equipped}
          travel={
            game.travel && travelRoute
              ? { path: travelRoute.path, progress: game.travel.progress / game.travel.cost }
              : null
          }
          preview={reachable && path ? path.path : null}
          locked={locked}
        />
        <View
          style={styles.legend}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {LEGEND.map((entry) => (
            <View key={entry.label} style={styles.key}>
              <View style={[styles.swatch, { backgroundColor: entry.fill }]} />
              <Text style={styles.small}>{entry.label}</Text>
            </View>
          ))}
        </View>
      </View>
      <Panel>
        <Text style={styles.body}>{place.blurb}</Text>
        {via.length && reachable ? (
          <Text style={styles.body}>the road runs through {via.join(', ')}.</Text>
        ) : null}
      </Panel>
    </>
  );
}

export function PlaceCard({
  selected,
  onTravel,
}: Readonly<{ selected: string; onTravel: () => void }>): React.JSX.Element | null {
  const { game, act } = useGame();
  const view = usePlace(selected);
  if (!view) return null;
  const { place, cost, blocker, here, reachable } = view;
  const gathering = place.activities
    .map((id) => getActivity(id))
    .filter((activity): activity is Activity => !!activity && !activity.station);
  const stations = stationsAt(place);
  const startable = reachable && gathering.some((activity) => !activityBlocker(game, activity));
  const go = (next?: string): void => {
    act({ type: 'travel', to: place.id, next });
    onTravel();
  };

  const aside = here ? (
    <Text style={[styles.aside, { color: color.success }]}>you are here</Text>
  ) : blocker ? (
    <View style={styles.asideRow}>
      <Icon name="lock" tint={color.muted} />
      <Text style={styles.aside}>locked</Text>
    </View>
  ) : game.travel ? null : (
    <View style={styles.asideRow} accessible accessibilityLabel={`${cost.toLocaleString()} steps away`}>
      <Sprite art={UI_ART.steps} size={14} />
      <Text style={[styles.aside, { color: color.text }]}>{cost.toLocaleString()}</Text>
    </View>
  );

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text accessibilityRole="header" aria-level={2} style={styles.name} numberOfLines={1}>
          {place.name}
        </Text>
        {aside}
      </View>
      {gathering.length || stations.length ? (
        <View style={styles.offers}>
          {gathering.map((activity) => {
            const name = `${activity.verb} ${getItem(activity.output.item)?.name}`;
            const reason = activityBlocker(game, activity);
            const slot = (
              <>
                <Slot art={itemArt(activity.output.item)} size={40} dim={!!reason} />
                <View style={styles.tag}>
                  <Sprite art={SKILL_ART[activity.skill]} size={12} />
                  <Text style={[styles.small, reason ? null : { color: color.text }]}>{activity.level}</Text>
                </View>
              </>
            );
            return reachable && !reason ? (
              <Pressable
                key={activity.id}
                accessibilityRole="button"
                accessibilityLabel={`Travel to ${place.name} and start ${name}`}
                onPress={() => go(activity.id)}
                hitSlop={4}
                style={({ pressed }) => [styles.offer, pressed && styles.pressed]}
              >
                {slot}
              </Pressable>
            ) : (
              <View
                key={activity.id}
                accessible
                accessibilityLabel={reason ? `${name}: ${reason}` : name}
                style={styles.offer}
              >
                {slot}
              </View>
            );
          })}
          {stations.map((station) => (
            <View key={station.label} style={styles.station}>
              <Sprite art={station.art} size={18} />
              <Text style={styles.small}>{station.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {game.travel ? (
        <Text style={styles.note}>
          you are walking to {getLocation(game.travel.to)?.name}. arrive, or turn back, before picking
          somewhere new.
        </Text>
      ) : blocker ? (
        <Text style={[styles.note, { color: color.danger }]}>{blocker}</Text>
      ) : reachable ? (
        <>
          {startable ? <Text style={styles.note}>tap a find to travel there and start it.</Text> : null}
          <Button
            label={`travel to ${place.name}`}
            icon="trail"
            accessibilityHint={`${cost.toLocaleString()} steps`}
            onPress={() => go()}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  mapBlock: { gap: space.tight },
  body: { fontFamily: font.body, fontSize: 15, lineHeight: 20, color: color.secondary },
  small: { fontFamily: font.label, fontSize: 10, lineHeight: 14, color: color.muted, ...shadow },
  note: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: color.secondary },
  card: { gap: space.tight },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.related },
  name: {
    flex: 1,
    minWidth: 0,
    fontFamily: font.display,
    fontSize: 19,
    lineHeight: 25,
    color: color.gold,
    ...shadow,
  },
  asideRow: { flexDirection: 'row', alignItems: 'center', gap: space.micro },
  aside: { fontFamily: font.labelBold, fontSize: 11, lineHeight: 16, color: color.muted, ...shadow },
  offers: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: space.tight },
  offer: { alignItems: 'center', gap: 2, minWidth: layout.touch },
  pressed: { opacity: 0.7 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  station: { alignItems: 'center', justifyContent: 'center', gap: 2, minWidth: 44, height: 56 },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: space.related,
    rowGap: 2,
  },
  key: { flexDirection: 'row', alignItems: 'center', gap: space.micro },
  swatch: { width: 8, height: 8, borderWidth: 1, borderColor: color.ink },
});
