import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getActivity, getItem, type Place } from '../game/content';
import { useGame } from '../game/GameProvider';
import { capacityOf, nextStep, readyMissions } from '../game/game';
import { keyItem, slotsUsed } from '../game/items';
import { Panel } from '../pixel/chrome';
import { color, font, shadow, space } from '../theme/theme';
import { ActivityList } from './ActivityList';
import { ActivitySheet } from './ActivitySheet';
import { Scene } from './Scene';
import { StatusPanel } from './StatusPanel';
import { StepSyncNotice } from './StepSyncNotice';
import { Button } from './ui';

// The world tab's here view: your bruh in its scene, what it's doing, the bag at a glance and the
// work on offer where you stand. The map view lives in PlaceMap.

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

export function WorldHere({
  place,
  onMap,
  sceneLabel,
}: Readonly<{
  place: Place;
  onMap: () => void;
  sceneLabel: string;
}>): React.JSX.Element {
  const { game, today, act } = useGame();
  const [details, setDetails] = useState(false);
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
  section: { gap: space.related },
  strip: { flexDirection: 'row', alignItems: 'center', gap: space.tight, padding: space.tight },
  stripCell: { flex: 1, minWidth: 0 },
  stripLabel: { fontFamily: font.label, fontSize: 9, lineHeight: 12, color: color.muted, ...shadow },
  stripValue: { fontFamily: font.labelBold, fontSize: 11, lineHeight: 15, color: color.text, ...shadow },
  sectionTitle: { fontFamily: font.display, fontSize: 19, lineHeight: 25, color: color.gold, ...shadow },
});
