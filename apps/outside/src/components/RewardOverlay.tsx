import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Animated, Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getActivity, getLocation, getQuest, type SkillId } from '../game/content';
import { useGame, useGameFeedback } from '../game/GameProvider';
import { getSkin, unlocksBetween } from '../game/game';
import { itemCount, parseKey } from '../game/items';
import { type Report, stopReasonText } from '../game/session';
import { levelProgress } from '../game/xp';
import { itemArt, SKILL_ART, UI_ART } from '../pixel/art';
import { Bar, Panel, Slot } from '../pixel/chrome';
import { Sprite } from '../pixel/Sprite';
import { color, font, shadow, space } from '../theme/theme';
import { Bruh } from './Bruh';
import { useEntrance } from './MotionProvider';
import { RollingNumber } from './RollingNumber';
import { Button } from './ui';

function headline(report: Report): string {
  if (report.quest) return 'quest complete!';
  if (report.opened > 0 && report.actions === 0)
    return report.opened === 1 ? 'chest opened!' : `${report.opened} chests opened!`;
  if (report.levels.length) return 'level up!';
  if (report.arrived && report.actions === 0) return 'you have arrived';
  if (report.stopped && report.actions === 0)
    return report.stopped.kind === 'bag-full'
      ? 'your bag is full'
      : report.stopped.kind === 'enough'
        ? 'that’s enough'
        : 'your bruh stopped';
  return report.walked ? 'while you walked…' : 'your bruh got to work';
}

// One row per skill the report touched: the xp it earned, its level, and a bar to the next level whose bright
// part is this report's xp. A level-up in the report says the jump and what it unlocked.
function SkillRow({
  skill,
  amount,
  levelUp,
}: Readonly<{
  skill: SkillId;
  amount: number;
  levelUp?: Readonly<{ from: number; level: number }>;
}>): React.JSX.Element {
  const { game } = useGame();
  const xp = game.xp[skill] ?? 0;
  const progress = levelProgress(xp);
  const span = (progress.next ?? xp) - progress.current;
  const earlier = levelUp || span <= 0 ? 0 : (xp - amount - progress.current) / span;
  const unlocks = levelUp ? unlocksBetween(skill, levelUp.from, levelUp.level) : [];
  const level = levelUp ? `lvl ${levelUp.from} to ${levelUp.level}` : `lvl ${progress.level}`;
  const toNext = progress.next
    ? `${progress.remaining.toLocaleString()} xp to level ${progress.level + 1}`
    : 'max level';
  return (
    <View
      accessible
      accessibilityLabel={`${skill}, plus ${amount.toLocaleString()} xp. ${levelUp ? `level ${levelUp.from} to ${levelUp.level}` : `level ${progress.level}`}. ${toNext}.${unlocks.length ? ` new: ${unlocks.join(', ')}.` : ''}`}
      style={styles.skill}
    >
      <View style={styles.row}>
        <Sprite art={SKILL_ART[skill]} size={18} />
        <Text style={styles.rowLabel}>{skill}</Text>
        <RollingNumber value={amount} from={0} format={gained} style={styles.xp} />
      </View>
      <View style={styles.progress}>
        <View style={styles.grow}>
          <Bar value={progress.progress} from={earlier} height={6} />
        </View>
        <Text style={[styles.level, levelUp && styles.levelUp]}>{level}</Text>
      </View>
      {unlocks.length ? (
        <Text style={[styles.unlocks, styles.indent]}>
          new: {unlocks.slice(0, 4).join(', ')}
          {unlocks.length > 4 ? ` and ${unlocks.length - 4} more` : ''}
        </Text>
      ) : null}
    </View>
  );
}

function gained(amount: number): string {
  return `+${amount.toLocaleString()} xp`;
}

export function RewardOverlay(): React.JSX.Element | null {
  const { game } = useGame();
  const { reward, dismissReward } = useGameFeedback();
  const insets = useSafeAreaInsets();
  const rewardId = reward?.id;
  // Each report fades in and settles from 96%, in 200 ms, instead of the system's slower fade.
  const enter = useEntrance(rewardId);
  const scale = enter.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] });
  const celebrate = !!reward && (reward.levels.length > 0 || reward.quest !== null);
  useEffect(() => {
    if (rewardId === undefined || Platform.OS === 'web') return;
    const feedback = celebrate
      ? Platform.OS === 'android'
        ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm)
        : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      : Haptics.selectionAsync();
    void feedback.catch((error: unknown) => console.warn('Report haptic could not play:', error));
  }, [rewardId, celebrate]);
  if (!reward) return null;
  const title = headline(reward);
  const quest = reward.quest ? getQuest(reward.quest) : undefined;
  const stopped = reward.stopped ? getActivity(reward.stopped.activity) : undefined;
  const newSkin = reward.skins.at(-1);
  return (
    <Modal
      visible
      transparent
      animationType="none"
      accessibilityLabel={title}
      statusBarTranslucent
      onRequestClose={() => dismissReward()}
    >
      {/* Modals don't give SafeAreaView its insets on iOS; use the app provider's. */}
      <Animated.View
        style={[styles.backdrop, { paddingTop: insets.top, paddingBottom: insets.bottom, opacity: enter }]}
      >
        <Animated.View accessibilityViewIsModal style={[styles.card, { transform: [{ scale }] }]}>
          <ScrollView contentContainerStyle={styles.content}>
            <Panel tone="panel" inner={styles.inner}>
              <View style={styles.hero}>
                <Bruh skin={game.equipped} size={64} />
                <Text accessibilityRole="header" style={styles.title}>
                  {title}
                </Text>
                {quest ? <Text style={styles.subtitle}>{quest.name}</Text> : null}
                {quest ? (
                  <Text style={styles.unlock}>
                    +{quest.points} quest {quest.points === 1 ? 'point' : 'points'}
                  </Text>
                ) : null}
                {reward.steps > 0 ? (
                  <View style={styles.spent}>
                    <Sprite art={UI_ART.steps} size={16} />
                    <Text style={styles.spentText}>
                      {reward.steps.toLocaleString()} steps
                      {reward.actions > 0
                        ? ` · ${reward.actions.toLocaleString()} ${reward.actions === 1 ? 'action' : 'actions'}`
                        : ''}
                    </Text>
                  </View>
                ) : null}
              </View>
              {reward.xp.length ? (
                <View style={styles.rows}>
                  {reward.xp.map(({ skill, amount }) => (
                    <SkillRow
                      key={skill}
                      skill={skill}
                      amount={amount}
                      levelUp={reward.levels.find((entry) => entry.skill === skill)}
                    />
                  ))}
                </View>
              ) : null}
              {reward.gained.length || reward.coins > 0 ? (
                <View style={styles.loot} accessibilityLabel="Loot">
                  {reward.coins > 0 ? (
                    <Slot art={itemArt('coins')} qty={reward.coins} size={48} always />
                  ) : null}
                  {reward.gained.map((stack) => (
                    <View key={stack.item} accessible accessibilityLabel={itemCount(stack.qty, stack.item)}>
                      <Slot art={itemArt(parseKey(stack.item).id)} qty={stack.qty} size={48} always />
                    </View>
                  ))}
                </View>
              ) : null}
              {reward.gained.some((stack) => stack.item === 'burnt-fish') ? (
                <Text style={styles.note}>some fish burnt. higher cooking levels burn less.</Text>
              ) : null}
              {reward.used.length ? (
                <Text style={styles.note}>
                  used {reward.used.map((stack) => itemCount(stack.qty, stack.item)).join(', ')}
                </Text>
              ) : null}
              {reward.arrived ? (
                <Text style={styles.note}>
                  arrived at {getLocation(reward.arrived)?.name ?? reward.arrived}.
                </Text>
              ) : null}
              {stopped ? (
                <Text
                  style={[
                    styles.note,
                    { color: reward.stopped?.kind === 'enough' ? color.success : color.danger },
                  ]}
                >
                  {reward.stopped?.kind === 'bag-full'
                    ? `stopped ${stopped.verb} ${stopped.name}: your bag is full. bank, sell or drop items, then start again.`
                    : `stopped ${stopped.verb} ${stopped.name}: ${reward.stopped ? stopReasonText(reward.stopped) : 'out of materials'}.`}{' '}
                  leftover steps wait in your pouch.
                </Text>
              ) : null}
              {quest ? <Text style={styles.note}>{quest.done}</Text> : null}
              {newSkin ? (
                <Text style={styles.unlock}>new outfit unlocked: {getSkin(newSkin).name}!</Text>
              ) : null}
              <View style={styles.actions}>
                {newSkin ? (
                  <Button
                    label="try it on"
                    icon="bruh"
                    onPress={() => {
                      dismissReward({ restoreFocus: false });
                      router.navigate('/you');
                    }}
                  />
                ) : null}
                <Button
                  key={reward.id}
                  label="continue"
                  variant={newSkin ? 'outline' : 'primary'}
                  onPress={() => dismissReward()}
                />
              </View>
            </Panel>
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(10,8,6,0.82)',
    padding: space.page,
  },
  card: { width: '100%', maxWidth: 380, maxHeight: '100%' },
  content: { flexGrow: 0 },
  inner: { padding: space.group, gap: space.group },
  hero: { alignItems: 'center', gap: space.tight },
  title: {
    fontFamily: font.display,
    fontSize: 26,
    lineHeight: 32,
    color: color.gold,
    textAlign: 'center',
    ...shadow,
  },
  subtitle: {
    fontFamily: font.bold,
    fontSize: 17,
    lineHeight: 22,
    color: color.text,
    textAlign: 'center',
    ...shadow,
  },
  spent: { flexDirection: 'row', alignItems: 'center', gap: space.micro },
  spentText: { fontFamily: font.label, fontSize: 11, lineHeight: 16, color: color.secondary, ...shadow },
  unlocks: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: color.gold },
  rows: { gap: space.related },
  skill: { gap: space.micro },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.tight },
  // Lines under a skill start where its name does: past the 18-point sprite and the row gap.
  indent: { paddingLeft: 18 + space.tight },
  progress: { flexDirection: 'row', alignItems: 'center', gap: space.tight, paddingLeft: 18 + space.tight },
  grow: { flex: 1 },
  // Wide enough for "lvl 22 to 24", so every skill's bar ends at the same place.
  level: {
    minWidth: 92,
    textAlign: 'right',
    fontFamily: font.label,
    fontSize: 10,
    lineHeight: 14,
    color: color.secondary,
    ...shadow,
  },
  levelUp: { color: color.info },
  rowLabel: { flex: 1, fontFamily: font.body, fontSize: 15, lineHeight: 20, color: color.text },
  xp: { fontFamily: font.labelBold, fontSize: 12, lineHeight: 16, color: color.xp, ...shadow },
  loot: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  note: { fontFamily: font.body, fontSize: 14, lineHeight: 19, color: color.secondary, textAlign: 'center' },
  unlock: {
    fontFamily: font.bold,
    fontSize: 15,
    lineHeight: 20,
    color: color.gold,
    textAlign: 'center',
    ...shadow,
  },
  actions: { gap: space.tight },
});
