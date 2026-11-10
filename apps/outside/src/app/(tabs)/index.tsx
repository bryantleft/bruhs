import { router } from 'expo-router';
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { type ScrollView, StyleSheet, Text, View } from 'react-native';
import { ActivityList } from '../../components/ActivityList';
import { ActivitySheet } from '../../components/ActivitySheet';
import { useReducedMotion } from '../../components/MotionProvider';
import { PageTitle, useTabStat } from '../../components/PageTitle';
import { PlaceCard, PlaceMap } from '../../components/PlaceMap';
import { Scene } from '../../components/Scene';
import { StepSyncNotice } from '../../components/StepSyncNotice';
import { Button, Screen } from '../../components/ui';
import { getActivity, getItem, getLocation, type Place, START_LOCATION } from '../../game/content';
import { useGame } from '../../game/GameProvider';
import {
  atBank,
  capacityOf,
  type NextStep,
  nearestBank,
  nextStep,
  questShortfall,
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
import { Bar, Panel, Segments, Tag } from '../../pixel/chrome';
import { Sprite } from '../../pixel/Sprite';
import { MAP_HEIGHT, MAP_WIDTH, tileCenter } from '../../pixel/world';
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
    </Panel>
  );
}

function StatusPanel({
  onDetails,
  onMap,
}: Readonly<{ onDetails: () => void; onMap: () => void }>): React.JSX.Element {
  const { game, act } = useGame();
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
  // One clear next step: quests first, then steady work here, then a walk to somewhere useful. The HUD
  // already shows the waiting steps, so the panel doesn't repeat the count.
  const next = nextStep(game);
  return (
    <Panel title="your bruh is idle">
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
        <Text
          style={[styles.detail, { color: game.stopped?.kind === 'enough' ? color.success : color.danger }]}
        >
          stopped {stopped.verb} {stopped.name}: {game.stopped ? stopReasonText(game.stopped) : null}.
        </Text>
      ) : null}
      {full ? null : next ? (
        <NextStepButton step={next} />
      ) : (
        <Button label="find work on the map" icon="map" onPress={onMap} />
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
  let icon: 'trail' | 'check' | 'plus' | undefined;
  let onPress: () => void;
  let detail: string | null = why;
  // Work for a quest stops once the quest has enough, so the estimate counts only what it needs.
  const goal =
    'activity' in step && step.activity && 'quest' in step && step.quest
      ? questShortfall(game, step.quest.id, step.activity.output.item)
      : Number.POSITIVE_INFINITY;
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
      // Starting spends the pouch until the work runs out or a quest has enough, so say how far it goes.
      const each = stepsPerAction(game, step.activity);
      const runs = Math.min(Math.floor(pouch / each), runsLeft(game, step.activity), goal);
      const actions = `${runs.toLocaleString()} ${runs === 1 ? 'action' : 'actions'}`;
      const cost =
        pouch <= 0
          ? null
          : runs === goal && runs * each < pouch
            ? `about ${actions}; the rest of your steps wait in your pouch`
            : `uses your waiting steps: about ${actions}`;
      detail = [why, cost].filter(Boolean).join(' · ') || null;
      onPress = () =>
        act({ type: 'start', activity: step.activity.id, ...(step.quest ? { quest: step.quest.id } : {}) });
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
        ? Math.min(
            Math.floor(rest / stepsPerAction(game, step.activity)),
            runsLeft(game, step.activity),
            goal,
          )
        : 0;
      const actions = `${runs.toLocaleString()} ${runs === 1 ? 'action' : 'actions'}`;
      const capped = step.activity && runs === goal && runs * stepsPerAction(game, step.activity) < rest;
      const cost = `${road.toLocaleString()} steps on the road${
        step.activity && runs > 0
          ? capped
            ? `, then about ${actions}; the rest waits in your pouch`
            : `, then about ${actions} with the rest`
          : ''
      }`;
      detail = [why, cost].filter(Boolean).join(' · ');
      onPress = () =>
        act({
          type: 'travel',
          to: step.place.id,
          ...(step.activity ? { next: step.activity.id } : {}),
          ...(step.activity && step.quest ? { quest: step.quest.id } : {}),
        });
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

const VIEWS = ['here', 'map'] as const;
type WorldView = (typeof VIEWS)[number];

export default function WorldScreen(): React.JSX.Element {
  const { game, tracking, syncHealth } = useGame();
  const screen = useScreenFocus({ returnToTab: true });
  const steps = useTabStat('steps');
  const [details, setDetails] = useState(false);
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
        <Here
          place={place}
          details={details}
          setDetails={setDetails}
          onMap={() => show('map')}
          sceneLabel={sceneLabel}
        />
      )}
    </Screen>
  );
}

function Here({
  place,
  details,
  setDetails,
  onMap,
  sceneLabel,
}: Readonly<{
  place: Place;
  details: boolean;
  setDetails: (open: boolean) => void;
  onMap: () => void;
  sceneLabel: string;
}>): React.JSX.Element {
  const { game, today, act } = useGame();
  const activity = game.task ? getActivity(game.task.id) : undefined;
  const ready = readyMissions(game, today).length;
  // While working, a quest ready to hand in right here still gets a button (idle shows it anyway).
  const handIn = game.task ? nextStep({ ...game, task: null }) : null;
  const traveling = !!game.travel;
  return (
    <>
      <Scene
        biome={traveling ? 'forest' : place.biome}
        skin={game.equipped}
        working={!!activity}
        walking={traveling}
        tool={activity?.tool ? game.tools[activity.tool] : activity ? activity.output.item : undefined}
        label={sceneLabel}
      />
      <StepSyncNotice />
      <StatusPanel onDetails={() => setDetails(true)} onMap={onMap} />
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
          onPress={() => router.navigate({ pathname: '/quests', params: { view: 'missions' } })}
        />
      ) : null}
      {!traveling ? (
        <View style={styles.section}>
          <Text accessibilityRole="header" aria-level={2} style={styles.sectionTitle}>
            activities here
          </Text>
          <ActivityList place={place} />
          {place.store ? (
            <Button label="visit the store" variant="outline" onPress={() => router.navigate('/bag')} />
          ) : null}
        </View>
      ) : null}
      {details && activity ? (
        <ActivitySheet activity={activity} canStart={false} onClose={() => setDetails(false)} />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  next: { gap: space.micro },
  nextDetail: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: color.muted },
  header: { gap: 2 },
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
  sectionTitle: { fontFamily: font.display, fontSize: 19, lineHeight: 25, color: color.gold, ...shadow },
});
