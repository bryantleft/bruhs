import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ActivityList } from '../../components/ActivityList';
import { ActivitySheet } from '../../components/ActivitySheet';
import { Hud } from '../../components/Hud';
import { Scene } from '../../components/Scene';
import { TrackingControl } from '../../components/TrackingControl';
import { Button, Screen } from '../../components/ui';
import { getActivity, getItem, getLocation, START_LOCATION } from '../../game/content';
import { useGame } from '../../game/GameProvider';
import {
  atBank,
  capacityOf,
  type NextStep,
  nearestBank,
  nextStep,
  readyMissions,
  route,
  runsLeft,
  skillLevel,
  stepsPerAction,
  travelCost,
  unspentSteps,
} from '../../game/game';
import { formatPercent, keyItem, keyName, slotsUsed, statLabel, totalsFor } from '../../game/items';
import { stopReasonText } from '../../game/session';
import { useScreenFocus } from '../../navigation/useScreenFocus';
import { SKILL_ART } from '../../pixel/art';
import { Bar, Panel, Tag } from '../../pixel/chrome';
import { Sprite } from '../../pixel/Sprite';
import { color, font, shadow, space } from '../../theme/theme';

function BagStrip(): React.JSX.Element {
  const { game } = useGame();
  const used = slotsUsed(game.inventory);
  const capacity = capacityOf(game);
  const chests = Object.entries(game.inventory)
    .filter(([key]) => keyItem(key)?.kind === 'chest')
    .reduce((sum, [, qty]) => sum + qty, 0);
  const buff = game.buff ? getItem(game.buff.item) : undefined;
  return (
    <Panel tone="well" inner={styles.strip}>
      <View style={styles.stripCell}>
        <Text style={styles.stripLabel}>bag</Text>
        <Text style={[styles.stripValue, used >= capacity && { color: color.danger }]}>
          {used}/{capacity}
        </Text>
      </View>
      <View style={styles.stripCell}>
        <Text style={styles.stripLabel}>food</Text>
        <Text style={[styles.stripValue, buff ? { color: color.success } : null]} numberOfLines={2}>
          {buff ? `${buff.name} ×${game.buff?.actions}` : 'none'}
        </Text>
      </View>
      <View style={styles.stripCell}>
        <Text style={styles.stripLabel}>chests</Text>
        <Text style={[styles.stripValue, chests > 0 && { color: color.gold }]}>{chests}</Text>
      </View>
      <View style={styles.stripButton}>
        <Button label="bag" variant="outline" onPress={() => router.navigate('/bag')} />
      </View>
    </Panel>
  );
}

function StatusPanel({ onDetails }: Readonly<{ onDetails: () => void }>): React.JSX.Element {
  const { game, act } = useGame();
  const pouch = unspentSteps(game);
  if (game.travel) {
    const { travel } = game;
    const destination = getLocation(travel.to)?.name ?? travel.to;
    const left = travel.cost - travel.progress;
    const next = travel.next ? getActivity(travel.next) : undefined;
    return (
      <Panel title={`walking to ${destination}`} aside={`${left.toLocaleString()} steps left`}>
        <Bar value={travel.progress / travel.cost} fill={color.info} />
        <Text style={styles.detail}>
          every step you take moves your bruh along the road
          {next ? `, then it starts ${next.verb} ${next.name}` : ''}.
        </Text>
        <Button
          label="turn back"
          variant="outline"
          icon="back"
          onPress={() => act({ type: 'cancel-travel' })}
        />
      </Panel>
    );
  }
  const activity = game.task ? getActivity(game.task.id) : undefined;
  if (game.task && activity) {
    const cost = stepsPerAction(game, activity);
    const tool = activity.tool ? keyName(game.tools[activity.tool]) : undefined;
    const totals = totalsFor(game, activity.skill);
    return (
      <Panel
        title={`${activity.verb} ${activity.name}`}
        aside={<Tag tint={color.success}>{`${activity.skill} ${skillLevel(game, activity.skill)}`}</Tag>}
      >
        <View style={styles.row}>
          <Sprite art={SKILL_ART[activity.skill]} size={28} />
          <View style={styles.grow}>
            <Bar value={game.task.progress / cost} />
          </View>
        </View>
        <Text style={styles.detail}>
          {cost - game.task.progress} steps to the next {getItem(activity.output.item)?.name ?? 'item'} ·{' '}
          {cost} per action
          {tool ? ` · ${tool}` : ''}
        </Text>
        {totals.doubleAction + totals.doubleResult + totals.preserve > 0 ? (
          <Text style={[styles.detail, { color: color.success }]}>
            {[
              totals.doubleAction > 0
                ? `${formatPercent(totals.doubleAction)} ${statLabel('doubleAction')}`
                : null,
              totals.doubleResult > 0
                ? `${formatPercent(totals.doubleResult)} ${statLabel('doubleResult')}`
                : null,
              totals.preserve > 0 && activity.inputs
                ? `${formatPercent(totals.preserve)} ${statLabel('preserve')}`
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        ) : null}
        <View style={styles.buttons}>
          <View style={styles.grow}>
            <Button label="details" variant="outline" onPress={onDetails} />
          </View>
          <View style={styles.grow}>
            <Button label="stop" variant="outline" icon="stop" onPress={() => act({ type: 'stop' })} />
          </View>
        </View>
      </Panel>
    );
  }
  const stopped = game.stopped ? getActivity(game.stopped.activity) : undefined;
  const full = game.stopped?.kind === 'bag-full';
  const bank = full ? nearestBank(game)?.place : null;
  // One clear next step: quests first, then steady work here, then a walk to somewhere useful.
  const next = nextStep(game);
  return (
    <Panel title="your bruh is idle" aside={pouch ? `${pouch.toLocaleString()} steps waiting` : undefined}>
      {stopped && full ? (
        <>
          <Text style={[styles.detail, { color: color.danger }]}>
            stopped {stopped.verb} {stopped.name}: your bag is full.
          </Text>
          {atBank(game) ? (
            <Button label="bank everything" icon="chest" onPress={() => act({ type: 'deposit-all' })} />
          ) : bank ? (
            <Button
              label={`walk to the ${bank.name} bank`}
              icon="trail"
              onPress={() => act({ type: 'travel', to: bank.id })}
            />
          ) : null}
        </>
      ) : stopped ? (
        <Text style={[styles.detail, { color: color.danger }]}>
          stopped {stopped.verb} {stopped.name}: {game.stopped ? stopReasonText(game.stopped) : null}.
        </Text>
      ) : null}
      {full ? null : next ? (
        <NextStepButton step={next} />
      ) : (
        <Button label="find work on the map" icon="map" onPress={() => router.navigate('/map')} />
      )}
      <Text style={styles.detail}>
        steps you walk wait in your pouch until your bruh has something to do.
      </Text>
    </Panel>
  );
}

function NextStepButton({ step }: Readonly<{ step: NextStep }>): React.JSX.Element {
  const { game, act } = useGame();
  const pouch = unspentSteps(game);
  const why = 'quest' in step && step.quest ? `for ${step.quest.name}` : null;
  let label: string;
  let icon: 'arrow' | 'trail' | 'check' | 'plus' = 'arrow';
  let onPress: () => void;
  let detail: string | null = why;
  switch (step.kind) {
    case 'hand-in':
      label = `hand in ${step.quest.name}`;
      icon = 'check';
      onPress = () => act({ type: 'quest-complete', quest: step.quest.id });
      detail = null;
      break;
    case 'start-quest':
      label = `start quest: ${step.quest.name}`;
      icon = 'plus';
      onPress = () => act({ type: 'quest-start', quest: step.quest.id });
      detail = step.quest.blurb;
      break;
    case 'start': {
      label = `start ${step.activity.verb} ${step.activity.name}`;
      // Starting spends the whole pouch, so say how far it goes.
      const each = stepsPerAction(game, step.activity);
      const runs = Math.min(Math.floor(pouch / each), runsLeft(game, step.activity));
      const cost =
        pouch > 0
          ? `uses your ${pouch.toLocaleString()} waiting steps: about ${runs.toLocaleString()} ${runs === 1 ? 'action' : 'actions'}`
          : null;
      detail = [why, cost].filter(Boolean).join(' · ') || null;
      onPress = () => act({ type: 'start', activity: step.activity.id });
      break;
    }
    case 'travel': {
      label = step.activity
        ? `walk to ${step.place.name} · ${step.activity.verb}`
        : `walk to ${step.place.name}`;
      icon = 'trail';
      const path = route(game.location, step.place.id);
      const road = path ? travelCost(game, path.distance) : 0;
      const rest = Math.max(0, pouch - road);
      const runs = step.activity
        ? Math.min(Math.floor(rest / stepsPerAction(game, step.activity)), runsLeft(game, step.activity))
        : 0;
      const cost = `${road.toLocaleString()} steps on the road${
        step.activity && runs > 0
          ? `, then about ${runs.toLocaleString()} ${runs === 1 ? 'action' : 'actions'} with the rest`
          : ''
      }`;
      detail = [why, cost].filter(Boolean).join(' · ');
      onPress = () =>
        act({ type: 'travel', to: step.place.id, ...(step.activity ? { next: step.activity.id } : {}) });
      break;
    }
  }
  return (
    <View style={styles.next}>
      <Button label={label} icon={icon} onPress={onPress} />
      {detail ? <Text style={styles.nextDetail}>{detail}</Text> : null}
    </View>
  );
}

export default function WorldScreen(): React.JSX.Element {
  const { game, today, act } = useGame();
  const screen = useScreenFocus({ returnToTab: true });
  const [details, setDetails] = useState(false);
  const place = getLocation(game.location) ?? getLocation(START_LOCATION);
  const activity = game.task ? getActivity(game.task.id) : undefined;
  const ready = readyMissions(game, today).length;
  // While working, a quest ready to hand in right here still gets a button (idle shows it anyway).
  const handIn = game.task ? nextStep({ ...game, task: null }) : null;
  if (!place) return <Screen rootRef={screen}>{null}</Screen>;
  const traveling = !!game.travel;
  const sceneLabel = traveling
    ? `Your bruh walking to ${getLocation(game.travel?.to ?? '')?.name}`
    : activity
      ? `Your bruh ${activity.verb} at ${place.name}`
      : `Your bruh standing in ${place.name}`;
  return (
    <Screen rootRef={screen} footer={<TrackingControl adventure />}>
      <Hud />
      <View style={styles.header}>
        <Text accessibilityRole="header" aria-level={1} style={styles.place}>
          {traveling ? 'on the road' : place.name}
        </Text>
        <Text style={styles.blurb}>{traveling ? 'step by step, the fruitlands go by.' : place.blurb}</Text>
      </View>
      <Scene
        biome={traveling ? 'forest' : place.biome}
        skin={game.equipped}
        working={!!activity}
        walking={traveling}
        tool={activity?.tool ? game.tools[activity.tool] : activity ? activity.output.item : undefined}
        label={sceneLabel}
      />
      <StatusPanel onDetails={() => setDetails(true)} />
      <BagStrip />
      {handIn?.kind === 'hand-in' ? (
        <Button
          label={`hand in ${handIn.quest.name}`}
          icon="check"
          onPress={() => act({ type: 'quest-complete', quest: handIn.quest.id })}
        />
      ) : null}
      {ready ? (
        <Button
          label={`${ready} ${ready === 1 ? 'mission' : 'missions'} ready to collect`}
          icon="chest"
          onPress={() => router.navigate('/quests')}
        />
      ) : null}
      {!traveling ? (
        <View style={styles.section}>
          <Text accessibilityRole="header" aria-level={2} style={styles.sectionTitle}>
            activities here
          </Text>
          <ActivityList place={place} />
          {place.store ? (
            <Button
              label="visit the store"
              variant="outline"
              icon="arrow"
              onPress={() => router.navigate('/bag')}
            />
          ) : null}
          <Button
            label="open the world map"
            variant="outline"
            icon="map"
            onPress={() => router.navigate('/map')}
          />
        </View>
      ) : null}
      {details && activity ? (
        <ActivitySheet activity={activity} canStart={false} onClose={() => setDetails(false)} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  next: { gap: space.micro },
  nextDetail: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: color.muted },
  header: { gap: 2 },
  place: { fontFamily: font.display, fontSize: 26, lineHeight: 32, color: color.gold, ...shadow },
  blurb: { fontFamily: font.body, fontSize: 15, lineHeight: 20, color: color.secondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.related },
  grow: { flex: 1 },
  detail: { fontFamily: font.body, fontSize: 14, lineHeight: 19, color: color.secondary },
  section: { gap: space.related },
  buttons: { flexDirection: 'row', gap: space.tight },
  strip: { flexDirection: 'row', alignItems: 'center', gap: space.tight, padding: space.tight },
  stripCell: { flex: 1, minWidth: 0 },
  stripLabel: { fontFamily: font.label, fontSize: 9, lineHeight: 12, color: color.muted, ...shadow },
  stripValue: { fontFamily: font.labelBold, fontSize: 11, lineHeight: 15, color: color.text, ...shadow },
  stripButton: { width: 84 },
  sectionTitle: { fontFamily: font.display, fontSize: 19, lineHeight: 25, color: color.gold, ...shadow },
});
