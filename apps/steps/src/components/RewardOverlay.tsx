import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getActivity, getItem, getLocation, getQuest } from '../game/content';
import { useGame } from '../game/GameProvider';
import { getSkin, unlocksBetween } from '../game/game';
import { itemCount, parseKey } from '../game/items';
import type { Report } from '../game/session';
import { itemArt, SKILL_ART, UI_ART } from '../pixel/art';
import { Panel, Slot } from '../pixel/chrome';
import { Sprite } from '../pixel/Sprite';
import { color, font, shadow, space } from '../theme/theme';
import { Bruh } from './Bruh';
import { Button } from './ui';

function headline(report: Report): string {
  if (report.quest) return 'quest complete!';
  if (report.opened > 0 && report.actions === 0)
    return report.opened === 1 ? 'chest opened!' : `${report.opened} chests opened!`;
  if (report.levels.length) return 'level up!';
  if (report.arrived && report.actions === 0) return 'you have arrived';
  if (report.stopped && report.actions === 0)
    return report.stopped.missing === 'inventory' ? 'your bag is full' : 'your bruh stopped';
  return report.walked ? 'while you walked…' : 'your bruh got to work';
}

function levelLine(skill: string, from: number, level: number): string {
  const jump = level - from > 1 ? ` (+${level - from} levels)` : '';
  return `${skill} level ${level}${jump}`;
}

export function RewardOverlay(): React.JSX.Element | null {
  const { reward, dismissReward, game } = useGame();
  const insets = useSafeAreaInsets();
  const rewardId = reward?.id;
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
      animationType="fade"
      accessibilityLabel={title}
      statusBarTranslucent
      onRequestClose={() => dismissReward()}
    >
      {/* Modals don't give SafeAreaView its insets on iOS; use the app provider's. */}
      <View style={[styles.backdrop, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View accessibilityViewIsModal style={styles.card}>
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
              {reward.levels.map(({ skill, from, level }) => {
                const unlocks = unlocksBetween(skill, from, level);
                return (
                  <View key={skill} style={styles.level}>
                    <Sprite art={SKILL_ART[skill] ?? SKILL_ART.agility} size={32} />
                    <View style={styles.levelCopy}>
                      <Text style={styles.levelText}>{levelLine(skill, from, level)}</Text>
                      {unlocks.length ? (
                        <Text style={styles.unlocks}>
                          new: {unlocks.slice(0, 4).join(', ')}
                          {unlocks.length > 4 ? ` and ${unlocks.length - 4} more` : ''}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                );
              })}
              {reward.xp.length ? (
                <View style={styles.rows}>
                  {reward.xp.map(({ skill, amount }) => (
                    <View key={skill} style={styles.row}>
                      <Sprite art={SKILL_ART[skill] ?? SKILL_ART.agility} size={18} />
                      <Text style={styles.rowLabel}>{skill}</Text>
                      <Text style={styles.xp}>+{amount.toLocaleString()} xp</Text>
                    </View>
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
              {reward.gained.length ? (
                <Text style={styles.note}>
                  got {reward.gained.map((stack) => itemCount(stack.qty, stack.item)).join(', ')}
                </Text>
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
                <Text style={[styles.note, { color: color.danger }]}>
                  {reward.stopped?.missing === 'inventory'
                    ? `stopped ${stopped.verb} ${stopped.name}: your bag is full. bank, sell or drop items, then start again.`
                    : `stopped ${stopped.verb} ${stopped.name}: out of ${getItem(reward.stopped?.missing ?? '')?.name ?? 'materials'}.`}{' '}
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
                      router.push('/character');
                    }}
                  />
                ) : null}
                <Button
                  key={reward.id}
                  label="continue"
                  variant={newSkin ? 'outline' : 'primary'}
                  icon="arrow"
                  onPress={() => dismissReward()}
                />
              </View>
            </Panel>
          </ScrollView>
        </View>
      </View>
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
  level: { flexDirection: 'row', alignItems: 'center', gap: space.related },
  levelCopy: { flex: 1, gap: 2 },
  levelText: { fontFamily: font.bold, fontSize: 16, lineHeight: 21, color: color.info, ...shadow },
  unlocks: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: color.gold },
  rows: { gap: space.micro },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.tight },
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
