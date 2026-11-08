import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Hud } from '../../components/Hud';
import { Icon } from '../../components/Icon';
import { Button, Screen } from '../../components/ui';
import { WorldMap } from '../../components/WorldMap';
import { type Activity, getActivity, getItem, getLocation, LOCATIONS } from '../../game/content';
import { useGame } from '../../game/GameProvider';
import { activityBlocker, locationBlocker, route, skillLevel, travelCost } from '../../game/game';
import { useScreenFocus } from '../../navigation/useScreenFocus';
import { itemArt, SKILL_ART } from '../../pixel/art';
import { bevel, Panel, Slot } from '../../pixel/chrome';
import { Sprite } from '../../pixel/Sprite';
import { color, font, shadow, space } from '../../theme/theme';

export default function MapScreen(): React.JSX.Element {
  const { game, act } = useGame();
  const screen = useScreenFocus();
  const [selected, setSelected] = useState(game.travel?.to ?? game.location);
  const place = getLocation(selected) ?? getLocation(game.location);
  const locked = new Set(LOCATIONS.filter((entry) => locationBlocker(game, entry)).map((entry) => entry.id));
  const travelRoute = game.travel ? route(game.travel.from, game.travel.to) : null;
  if (!place) return <Screen rootRef={screen}>{null}</Screen>;
  const path = route(game.location, place.id);
  const cost = path ? travelCost(game, path.distance) : 0;
  const blocker = locationBlocker(game, place);
  const here = place.id === game.location && !game.travel;
  const reachable = !game.travel && !here && !blocker;
  const gathering = place.activities
    .map((id) => getActivity(id))
    .filter((activity): activity is Activity => !!activity && !activity.station);
  const stationOf = (id: string): string | undefined => getActivity(id)?.station;
  const stations = [
    ...(place.activities.some((id) => stationOf(id) === 'forge') ? ['forge: smelt & smith'] : []),
    ...(place.activities.some((id) => stationOf(id) === 'range') ? ['range: cook'] : []),
    ...(place.activities.some((id) => stationOf(id) === 'workbench') ? ['workbench: craft'] : []),
    ...(place.bank ? ['bank'] : []),
    ...(place.store ? ['general store'] : []),
  ];
  const go = (next?: string): void => {
    act({ type: 'travel', to: place.id, next });
    router.navigate('/');
  };
  // The selected place's travel button stays pinned, so a tap on the map always shows its action.
  const footer =
    game.travel || here ? undefined : blocker ? (
      <Text style={[styles.body, { color: color.danger }]}>
        {place.name}: {blocker}
      </Text>
    ) : (
      <Button
        label={`travel to ${place.name} · ${cost.toLocaleString()} steps`}
        icon="trail"
        onPress={() => go()}
      />
    );
  return (
    <Screen rootRef={screen} footer={footer}>
      <Hud />
      <Text accessibilityRole="header" aria-level={1} style={styles.title}>
        the fruitlands
      </Text>
      <WorldMap
        location={game.location}
        selected={place.id}
        onSelect={setSelected}
        skin={game.equipped}
        travel={
          game.travel && travelRoute
            ? { path: travelRoute.path, progress: game.travel.progress / game.travel.cost }
            : null
        }
        locked={locked}
      />
      {/* The pinned footer says the trip's cost or why the place is locked, so the panel doesn't repeat it. */}
      <Panel title={place.name} aside={here ? 'you are here' : blocker ? 'locked' : undefined}>
        <Text style={styles.body}>{place.blurb}</Text>
        {reachable ? null : (
          // A reachable place lists these below as travel-and-start rows instead.
          <View style={styles.resources}>
            {gathering.map((activity) => (
              <View key={activity.id} style={styles.resource}>
                <Slot
                  art={itemArt(activity.output.item)}
                  size={36}
                  dim={skillLevel(game, activity.skill) < activity.level}
                />
                <View style={styles.tag}>
                  <Sprite art={SKILL_ART[activity.skill]} size={12} />
                  <Text style={styles.small}>{activity.level}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
        {stations.length ? <Text style={styles.small}>{stations.join(' · ')}</Text> : null}
        {game.travel ? (
          <Text style={styles.body}>
            you are walking to {getLocation(game.travel.to)?.name}. arrive first, or turn back from the world
            tab.
          </Text>
        ) : here ? null : blocker ? null : (
          <View style={styles.actions}>
            {path && path.path.length > 2 ? (
              <Text style={styles.small}>
                via{' '}
                {path.path
                  .slice(1, -1)
                  .map((id) => getLocation(id)?.name ?? id)
                  .join(', ')}
              </Text>
            ) : null}
          </View>
        )}
        {reachable && gathering.length ? (
          <View style={styles.queue}>
            <Text style={styles.small}>
              {gathering.some((activity) => !activityBlocker(game, activity))
                ? 'or travel and start:'
                : 'found here:'}
            </Text>
            {gathering.map((activity) => {
              const name = `${activity.verb} ${getItem(activity.output.item)?.name}`;
              const reason = activityBlocker(game, activity);
              return reason ? (
                <View
                  key={activity.id}
                  accessible
                  accessibilityLabel={`${name}: ${reason}`}
                  style={[styles.queueRow, bevel('well')]}
                >
                  <Slot art={itemArt(activity.output.item)} size={32} dim />
                  <View style={styles.grow}>
                    <Text style={[styles.queueName, { color: color.muted }]}>{name}</Text>
                    <Text style={styles.small}>{reason}</Text>
                  </View>
                  <Icon name="lock" tint={color.muted} />
                </View>
              ) : (
                <Pressable
                  key={activity.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Travel to ${place.name} and start ${activity.verb} ${activity.name}`}
                  onPress={() => go(activity.id)}
                  style={({ pressed }) => [styles.queueRow, bevel('panel', pressed)]}
                >
                  <Slot art={itemArt(activity.output.item)} size={32} />
                  <Text style={[styles.queueName, styles.grow]}>{name}</Text>
                  <Icon name="arrow" tint={color.gold} />
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </Panel>
      <View style={styles.legend}>
        <Text style={styles.small}>
          ■ green: you are here · ■ gold: town with a bank · ■ red: wilds · ■ grey: locked
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: font.display, fontSize: 26, lineHeight: 32, color: color.gold, ...shadow },
  body: { fontFamily: font.body, fontSize: 15, lineHeight: 20, color: color.secondary },
  small: { fontFamily: font.label, fontSize: 10, lineHeight: 14, color: color.muted, ...shadow },
  resources: { flexDirection: 'row', flexWrap: 'wrap', gap: space.tight },
  resource: { alignItems: 'center', gap: 2 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  actions: { gap: space.tight },
  queue: { gap: space.tight },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.related,
    padding: space.micro,
    paddingRight: space.related,
  },
  grow: { flex: 1, minWidth: 0 },
  queueName: { fontFamily: font.bold, fontSize: 15, lineHeight: 20, color: color.text, ...shadow },
  legend: { alignItems: 'center' },
});
