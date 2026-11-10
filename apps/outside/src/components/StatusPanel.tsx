import { StyleSheet, Text, View } from 'react-native';
import { getActivity, getItem, getLocation } from '../game/content';
import { useGame } from '../game/GameProvider';
import {
  atBank,
  type NextStep,
  nearestBank,
  nextStep,
  questShortfall,
  route,
  runsLeft,
  skillLevel,
  stepsPerAction,
  travelCost,
  unspentSteps,
} from '../game/game';
import { formatPercent, keyName, statLabel, totalsFor } from '../game/items';
import { stopReasonText } from '../game/session';
import { SKILL_ART } from '../pixel/art';
import { Bar, Panel, Tag } from '../pixel/chrome';
import { Sprite } from '../pixel/Sprite';
import { color, font, space } from '../theme/theme';
import { Button } from './ui';

// What your bruh is doing right now, on the world tab: walking, working, or idle with one clear
// next step.

export function StatusPanel({
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

const styles = StyleSheet.create({
  next: { gap: space.micro },
  nextDetail: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: color.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.related },
  grow: { flex: 1 },
  detail: { fontFamily: font.body, fontSize: 14, lineHeight: 19, color: color.secondary },
  buttons: { flexDirection: 'row', gap: space.tight },
});
