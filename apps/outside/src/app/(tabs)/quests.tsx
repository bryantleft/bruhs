import { router, useLocalSearchParams } from 'expo-router';
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { Pressable, type ScrollView, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { PageTitle, useTabStat } from '../../components/PageTitle';
import { Button, Screen } from '../../components/ui';
import {
  getItem,
  getLocation,
  getQuest,
  MISSION_PERIODS,
  type Mission,
  type MissionPeriod,
  QUESTS,
  type Quest,
} from '../../game/content';
import { useGame } from '../../game/GameProvider';
import {
  atBank,
  canHandIn,
  itemSource,
  itemSourceText,
  missionClaimed,
  missionProgress,
  missionsFor,
  ownedCount,
  periodDaysLeft,
  questBlocker,
  questState,
  readyMissions,
  skillLevel,
} from '../../game/game';
import { countOf, itemCount } from '../../game/items';
import { useScreenFocus } from '../../navigation/useScreenFocus';
import { itemArt, UI_ART } from '../../pixel/art';
import { Bar, bevel, Panel, Segments, Slot } from '../../pixel/chrome';
import { Sprite } from '../../pixel/Sprite';
import { palette } from '../../theme/palette';
import { color, font, shadow, space } from '../../theme/theme';

const STATE_COLOR = {
  // Neutral: a new quest is an invitation, not a warning.
  new: color.text,
  started: palette['durian-400'],
  done: palette['pandan-300'],
} as const;

function missionGoal(mission: Mission, target: number): string {
  const amount = target.toLocaleString();
  switch (mission.kind) {
    case 'steps':
      return `walk ${amount} steps`;
    case 'actions':
      return mission.skill ? `${amount} ${mission.skill} actions` : `${amount} actions of any kind`;
    case 'road':
      return `walk ${amount} steps on the road`;
    case 'chests':
      return `find ${amount} ${target === 1 ? 'chest' : 'chests'}`;
    case 'quests':
      return `complete ${amount} ${target === 1 ? 'quest' : 'quests'}`;
  }
}

function resetLabel(period: MissionPeriod, today: string): string {
  if (period === 'daily') return 'resets at midnight';
  const left = periodDaysLeft(period, today);
  return left === 0 ? 'last day' : `${left} ${left === 1 ? 'day' : 'days'} left`;
}

function Missions(): React.JSX.Element {
  const { game, today, claimMission } = useGame();
  const [period, setPeriod] = useState<MissionPeriod>('daily');
  const ready = (option: MissionPeriod): number =>
    readyMissions(game, today).filter((mission) => mission.period === option).length;
  return (
    <Panel title={`${period} missions`} aside={resetLabel(period, today)}>
      <Segments
        value={period}
        options={MISSION_PERIODS}
        onChange={setPeriod}
        label={(option) => (ready(option) ? `${option} · ${ready(option)}` : option)}
      />
      {missionsFor(game, period, today).map((mission) => {
        const { value, target } = missionProgress(game, mission, today);
        const claimed = missionClaimed(game, mission, today);
        const done = value >= target && !claimed;
        const items = (mission.items ?? []).map((stack) => itemCount(stack.qty, stack.item));
        return (
          <View key={mission.id} style={styles.task}>
            <View style={styles.taskTop}>
              <View style={styles.grow}>
                <Text style={[styles.taskName, claimed && { color: color.muted }]}>{mission.name}</Text>
                <Text style={styles.small}>{missionGoal(mission, target)}</Text>
              </View>
              {/* Once it's done, the collect button names the reward instead. */}
              {done ? null : (
                <View style={styles.reward}>
                  <Sprite art={UI_ART.coins} size={14} />
                  <Text style={styles.rewardText}>{mission.coins.toLocaleString()}</Text>
                  {mission.items?.map((stack) => (
                    <Sprite key={stack.item} art={itemArt(stack.item)} size={16} />
                  ))}
                </View>
              )}
            </View>
            {done ? (
              <Button
                label={`collect ${mission.coins.toLocaleString()} coins${items.length ? ` + ${items.join(', ')}` : ''}`}
                icon="chest"
                onPress={() => claimMission(mission.period, mission.id)}
              />
            ) : (
              <Bar value={value / target} fill={claimed ? color.faint : color.xp} height={8}>
                <Text style={styles.barText}>
                  {claimed
                    ? 'collected'
                    : `${Math.min(value, target).toLocaleString()} / ${target.toLocaleString()}`}
                </Text>
              </Bar>
            )}
          </View>
        );
      })}
    </Panel>
  );
}

function QuestDetail({ quest }: Readonly<{ quest: Quest }>): React.JSX.Element {
  const { game, act } = useGame();
  const state = questState(game, quest.id);
  const blocker = questBlocker(game, quest);
  const ready = state === 'started' && !blocker && canHandIn(game, quest);
  const here = !game.travel && game.location === quest.location;
  const place = getLocation(quest.location);
  // Items in the bank only count when the hand-in town has one; otherwise carry them.
  const carried = quest.deliver.every((stack) => countOf(game.inventory, stack.item) >= stack.qty);
  const gathered = quest.deliver.every((stack) => ownedCount(game, stack.item) >= stack.qty);
  return (
    <View style={styles.detail}>
      <Text style={styles.giver}>
        from {quest.giver}
        {/* Said once: a quest in progress names its hand-in town in the row above, and a giver's
            description, like "madame plum at blueberry bay", often names it already. */}
        {state === 'started' || !place || quest.giver.includes(place.name)
          ? ''
          : ` · hand in at ${place.name}`}
      </Text>
      <Text style={styles.body}>{state === 'done' ? quest.done : quest.blurb}</Text>
      {state !== 'done' ? (
        <>
          {quest.requires.skills?.length || quest.requires.quests?.length ? (
            <View style={styles.list}>
              <Text style={styles.small}>requirements</Text>
              {quest.requires.skills?.map(({ skill, level }) => {
                const met = skillLevel(game, skill) >= level;
                return (
                  <View key={skill} style={styles.req}>
                    <Icon
                      name={met ? 'check' : 'close'}
                      tint={met ? color.success : color.danger}
                      size={14}
                    />
                    <Text style={[styles.reqText, { color: met ? color.success : color.danger }]}>
                      {skill} {level}
                    </Text>
                  </View>
                );
              })}
              {quest.requires.quests?.map((id) => {
                const met = game.quests[id] === 'done';
                return (
                  <View key={id} style={styles.req}>
                    <Icon
                      name={met ? 'check' : 'close'}
                      tint={met ? color.success : color.danger}
                      size={14}
                    />
                    <Text style={[styles.reqText, { color: met ? color.success : color.danger }]}>
                      {getQuest(id)?.name}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : null}
          <View style={styles.list}>
            <Text style={styles.small}>bring</Text>
            <View style={styles.slots}>
              {quest.deliver.map((stack) => {
                const have = ownedCount(game, stack.item);
                return (
                  <View key={stack.item} style={styles.deliver}>
                    <Slot art={itemArt(stack.item)} size={44} />
                    <Text
                      style={[styles.small, { color: have >= stack.qty ? color.success : color.secondary }]}
                    >
                      {Math.min(have, stack.qty)}/{stack.qty}
                    </Text>
                  </View>
                );
              })}
            </View>
            {quest.deliver
              .filter((stack) => ownedCount(game, stack.item) < stack.qty)
              .map((stack) => (
                <Text key={stack.item} style={styles.where}>
                  {getItem(stack.item)?.name}: {itemSourceText(itemSource(game, stack.item))}
                </Text>
              ))}
          </View>
        </>
      ) : null}
      <View style={styles.list}>
        <Text style={styles.small}>rewards</Text>
        <Text style={styles.body}>
          {[
            `${quest.points} quest ${quest.points === 1 ? 'point' : 'points'}`,
            ...(quest.rewards.xp ?? []).map(({ skill, amount }) => `${amount.toLocaleString()} ${skill} xp`),
            ...(quest.rewards.coins ? [`${quest.rewards.coins.toLocaleString()} coins`] : []),
            ...(quest.rewards.items ?? []).map((stack) => itemCount(stack.qty, stack.item)),
            ...(quest.rewards.unlock ? [`access to ${quest.rewards.unlock}`] : []),
          ].join(' · ')}
        </Text>
      </View>
      {state === 'new' ? (
        <Button
          label={blocker ?? 'start quest'}
          disabled={!!blocker}
          onPress={() => act({ type: 'quest-start', quest: quest.id })}
        />
      ) : state === 'started' ? (
        here ? (
          <Button
            label={ready ? 'hand in quest' : (blocker ?? 'gather the items first')}
            icon="check"
            disabled={!ready}
            onPress={() => act({ type: 'quest-complete', quest: quest.id })}
          />
        ) : (
          <>
            <Button
              label={game.travel ? 'arrive first' : `travel to ${place?.name}`}
              icon="trail"
              disabled={!!game.travel}
              onPress={() => act({ type: 'travel', to: quest.location })}
            />
            {gathered && !carried && !place?.bank ? (
              <Text style={styles.small}>
                {place?.name} has no bank. withdraw the items into your bag first
                {atBank(game) ? '' : ' at a bank town'}.
              </Text>
            ) : null}
          </>
        )
      ) : null}
    </View>
  );
}

function QuestRow({
  quest,
  open,
  onToggle,
}: Readonly<{ quest: Quest; open: boolean; onToggle: (id: string) => void }>): React.JSX.Element {
  const { game } = useGame();
  const state = questState(game, quest.id);
  const blocker = state === 'new' ? questBlocker(game, quest) : null;
  const status =
    state === 'done'
      ? { text: 'complete', ready: false }
      : state === 'started'
        ? { text: `in progress · hand in at ${getLocation(quest.location)?.name}`, ready: false }
        : blocker
          ? { text: blocker, ready: false }
          : { text: 'ready to start', ready: true };
  return (
    <View style={[styles.quest, bevel('well')]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${quest.name}, ${status.text}`}
        onPress={() => onToggle(quest.id)}
        style={styles.questHead}
      >
        <View style={styles.grow}>
          <Text style={[styles.questName, { color: STATE_COLOR[state] }]}>{quest.name}</Text>
          <Text style={[styles.small, status.ready && { color: color.success }]}>{status.text}</Text>
        </View>
        <Icon name={open ? 'close' : 'plus'} tint={color.muted} size={14} />
      </Pressable>
      {open ? <QuestDetail quest={quest} /> : null}
    </View>
  );
}

// Two views, so neither long list pushes the other below the fold: the journal of quests, and the
// daily, weekly and monthly missions. The world tab's "missions ready" button opens the second.
const VIEWS = ['journal', 'missions'] as const;
type QuestView = (typeof VIEWS)[number];

export default function QuestsScreen(): React.JSX.Element {
  const { game, today } = useGame();
  const screen = useScreenFocus();
  const { view: asked } = useLocalSearchParams<{ view?: string }>();
  const [view, setView] = useState<QuestView>(asked === 'missions' ? 'missions' : 'journal');
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const show = (next: QuestView): void => {
    setView(next);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  // A link that asks for a view opens it once; the param is cleared so a later tab tap keeps the
  // view you last chose.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when a link asks for a view.
  useEffect(() => {
    if (asked !== 'missions' && asked !== 'journal') return;
    show(asked);
    router.setParams({ view: undefined });
  }, [asked]);
  const ready = readyMissions(game, today).length;
  const [open, setOpen] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const toggle = (id: string): void => setOpen(open === id ? null : id);
  // In progress first, then ready to start, then locked; finished quests fold away at the end.
  const rank = (quest: Quest): number => {
    const state = questState(game, quest.id);
    return state === 'started' ? 0 : questBlocker(game, quest) ? 2 : 1;
  };
  const active = QUESTS.filter((quest) => questState(game, quest.id) !== 'done')
    .map((quest, index) => ({ quest, index }))
    .sort((a, b) => rank(a.quest) - rank(b.quest) || a.index - b.index)
    .map((entry) => entry.quest);
  const finished = QUESTS.filter((quest) => questState(game, quest.id) === 'done');
  const done = finished.length;
  const points = useTabStat('quest-points');
  return (
    <Screen rootRef={screen} scrollRef={scroll}>
      {/* Quest points sit beside the title and progress in the journal's header. */}
      <PageTitle title="quests" stat={points} />
      <Segments
        value={view}
        options={VIEWS}
        onChange={show}
        label={(option) => (option === 'missions' && ready ? `missions · ${ready}` : option)}
      />
      {view === 'missions' ? (
        <Missions />
      ) : (
        <Panel title="open quests" aside={`${QUESTS.length - done} to go`}>
          {active.map((quest) => (
            <QuestRow key={quest.id} quest={quest} open={open === quest.id} onToggle={toggle} />
          ))}
          {done > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: showDone }}
              onPress={() => setShowDone(!showDone)}
              style={({ pressed }) => [styles.doneToggle, bevel('well', pressed)]}
            >
              <Text style={styles.doneText}>
                {showDone ? 'hide' : 'show'} {done} completed {done === 1 ? 'quest' : 'quests'}
              </Text>
              <Icon name={showDone ? 'close' : 'plus'} tint={color.muted} size={14} />
            </Pressable>
          ) : null}
          {showDone
            ? finished.map((quest) => (
                <QuestRow key={quest.id} quest={quest} open={open === quest.id} onToggle={toggle} />
              ))
            : null}
        </Panel>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: font.display, fontSize: 26, lineHeight: 32, color: color.gold, ...shadow },
  small: { fontFamily: font.label, fontSize: 10, lineHeight: 14, color: color.muted, ...shadow },
  body: { fontFamily: font.body, fontSize: 14, lineHeight: 19, color: color.secondary },
  task: { gap: space.micro },
  taskTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.tight },
  grow: { flex: 1, minWidth: 0 },
  taskName: { fontFamily: font.bold, fontSize: 15, lineHeight: 20, color: color.text, ...shadow },
  reward: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rewardText: { fontFamily: font.labelBold, fontSize: 11, color: palette['durian-300'], ...shadow },
  barText: { fontFamily: font.label, fontSize: 9, lineHeight: 10, color: color.text, ...shadow },
  quest: { padding: 0 },
  doneToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: space.related,
    minHeight: 48,
  },
  doneText: { fontFamily: font.label, fontSize: 11, lineHeight: 15, color: color.secondary, ...shadow },
  questHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: space.related,
    minHeight: 48,
  },
  questName: { flex: 1, fontFamily: font.bold, fontSize: 16, lineHeight: 21, ...shadow },
  detail: { paddingHorizontal: space.related, paddingBottom: space.related, gap: space.related },
  giver: { fontFamily: font.label, fontSize: 10, lineHeight: 14, color: color.gold, ...shadow },
  list: { gap: space.micro },
  req: { flexDirection: 'row', alignItems: 'center', gap: space.tight },
  reqText: { fontFamily: font.body, fontSize: 14, lineHeight: 18 },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: space.tight },
  deliver: { alignItems: 'center', gap: 2 },
  where: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: color.muted },
});
