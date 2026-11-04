import { StyleSheet, Text, View } from 'react-native';
import { type Activity, getItem, QUALITIES } from '../game/content';
import { useGame } from '../game/GameProvider';
import { actionPreview, activityBlocker, available, runsLeft, skillLevel, unspentSteps } from '../game/game';
import { formatPercent, statLabel } from '../game/items';
import { itemArt, SKILL_ART } from '../pixel/art';
import { Panel, QUALITY_TINT, Slot } from '../pixel/chrome';
import { Sprite } from '../pixel/Sprite';
import { color, font, shadow, space } from '../theme/theme';
import { Sheet } from './Sheet';
import { Button } from './ui';

function odds(chance: number): string {
  return chance >= 0.01 ? formatPercent(chance) : `1 in ${Math.round(1 / chance).toLocaleString()}`;
}

function Stat({
  label,
  value,
  good,
}: Readonly<{ label: string; value: string; good?: boolean }>): React.JSX.Element {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, good && { color: color.success }]}>{value}</Text>
    </View>
  );
}

export function ActivitySheet({
  activity,
  onClose,
  canStart = true,
}: Readonly<{ activity: Activity; onClose: () => void; canStart?: boolean }>): React.JSX.Element {
  const { game, act } = useGame();
  const preview = actionPreview(game, activity);
  const blocker = activityBlocker(game, activity);
  const active = game.task?.id === activity.id;
  const efficiency = preview.totals.efficiency + preview.levelEfficiency;
  const perThousand = 1_000 / preview.steps;
  const doubled = 1 + preview.totals.doubleAction;
  const pouch = unspentSteps(game);
  const runs = Math.min(Math.floor(pouch / preview.steps), runsLeft(game, activity));
  return (
    <Sheet
      title={`${activity.verb} ${activity.name}`}
      onClose={onClose}
      footer={
        canStart ? (
          <View style={styles.footer}>
            {!active && !blocker && !game.travel && pouch > 0 ? (
              <Text style={styles.small}>
                uses your {pouch.toLocaleString()} waiting steps: about {runs.toLocaleString()}{' '}
                {runs === 1 ? 'action' : 'actions'}. steps you walk later keep it going.
              </Text>
            ) : null}
            <Button
              label={
                active
                  ? 'already doing this'
                  : (blocker ?? (game.travel ? 'arrive first' : `start ${activity.verb}`))
              }
              icon="arrow"
              disabled={active || !!blocker || !!game.travel}
              onPress={() => {
                act({ type: 'start', activity: activity.id });
                onClose();
              }}
            />
          </View>
        ) : null
      }
    >
      <View style={styles.hero}>
        <Slot art={itemArt(activity.output.item)} size={64} />
        <View style={styles.grow}>
          <View style={styles.row}>
            <Sprite art={SKILL_ART[activity.skill] ?? SKILL_ART.agility} size={18} />
            <Text style={styles.skill}>
              {activity.skill} {activity.level} · you are {skillLevel(game, activity.skill)}
            </Text>
          </View>
          <Text style={styles.big}>{preview.steps} steps</Text>
          <Text style={styles.small}>
            {preview.steps < activity.steps
              ? `per action · ${activity.steps - preview.steps} fewer with your work speed`
              : 'per action'}
          </Text>
        </View>
      </View>
      <Panel title="stats" tone="well">
        <View style={styles.grid}>
          <Stat label="xp per action" value={`${preview.xp}`} good={preview.totals.xp > 0} />
          <Stat label="work speed" value={`+${formatPercent(efficiency)}`} good={efficiency > 0} />
          <Stat label="from levels" value={`+${formatPercent(preview.levelEfficiency)}`} />
          <Stat
            label="extra action chance"
            value={formatPercent(preview.totals.doubleAction)}
            good={preview.totals.doubleAction > 0}
          />
          <Stat
            label="double loot chance"
            value={formatPercent(preview.totals.doubleResult)}
            good={preview.totals.doubleResult > 0}
          />
          {activity.inputs?.length ? (
            <Stat
              label={statLabel('preserve')}
              value={formatPercent(preview.totals.preserve)}
              good={preview.totals.preserve > 0}
            />
          ) : null}
          {activity.burn ? <Stat label="burn chance" value={formatPercent(preview.burn)} /> : null}
          <Stat label="actions per 1,000 steps" value={(perThousand * doubled).toFixed(1)} />
          <Stat
            label="xp per 1,000 steps"
            value={Math.round(perThousand * doubled * preview.xp).toLocaleString()}
          />
        </View>
        <Text style={styles.explain}>
          work speed cuts the steps each action takes. an extra action is a free repeat, and double loot
          doubles what one action gives. levels, tools, gear and food raise them.
        </Text>
      </Panel>
      {activity.inputs?.length ? (
        <View style={styles.section}>
          <Text style={styles.label}>uses each action</Text>
          <View style={styles.slots}>
            {activity.inputs.map((input) => {
              const have = available(game, input.item);
              return (
                <View key={input.item} style={styles.slotCell}>
                  <Slot art={itemArt(input.item)} qty={input.qty} size={44} always />
                  <Text style={[styles.small, { color: have >= input.qty ? color.success : color.danger }]}>
                    have {have}
                  </Text>
                </View>
              );
            })}
          </View>
          <Text style={styles.small}>
            taken from your bag, and from the bank when you are in a bank town.
          </Text>
        </View>
      ) : null}
      <View style={styles.section}>
        <Text style={styles.label}>drops</Text>
        <View style={styles.dropRow}>
          <Slot art={itemArt(activity.output.item)} size={32} />
          <Text style={styles.dropName}>{getItem(activity.output.item)?.name}</Text>
          <Text style={styles.small}>always</Text>
        </View>
        {preview.finds.map((find) => (
          <View key={find.item} style={styles.dropRow}>
            <Slot art={itemArt(find.item)} size={32} />
            <Text style={styles.dropName}>{getItem(find.item)?.name}</Text>
            <Text style={styles.small}>{odds(find.chance)}</Text>
          </View>
        ))}
      </View>
      {activity.quality ? (
        <View style={styles.section}>
          <Text style={styles.label}>quality odds</Text>
          <View style={styles.quality}>
            {QUALITIES.map((tier, index) => (
              <View key={tier.id} style={styles.qualityCell}>
                <Text style={[styles.qualityName, { color: QUALITY_TINT[index] }]}>{tier.name}</Text>
                <Text style={styles.small}>{formatPercent(preview.quality[index] ?? 0)}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.small}>better quality multiplies every stat on the piece, up to ×2.</Text>
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', gap: space.related, alignItems: 'center' },
  grow: { flex: 1, minWidth: 0, gap: 2 },
  footer: { gap: space.tight },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.tight },
  skill: { fontFamily: font.label, fontSize: 10, lineHeight: 14, color: color.secondary, ...shadow },
  big: { fontFamily: font.labelBold, fontSize: 22, lineHeight: 28, color: color.gold, ...shadow },
  small: { fontFamily: font.label, fontSize: 10, lineHeight: 14, color: color.muted, ...shadow },
  label: { fontFamily: font.label, fontSize: 11, lineHeight: 15, color: color.gold, ...shadow },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.tight },
  stat: { width: '50%', gap: 1 },
  statLabel: { fontFamily: font.label, fontSize: 9, lineHeight: 12, color: color.muted, ...shadow },
  statValue: { fontFamily: font.labelBold, fontSize: 14, lineHeight: 18, color: color.text, ...shadow },
  section: { gap: space.tight },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: space.tight },
  slotCell: { alignItems: 'center', gap: 2 },
  dropRow: { flexDirection: 'row', alignItems: 'center', gap: space.tight },
  explain: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: color.secondary },
  dropName: { flex: 1, fontFamily: font.body, fontSize: 14, lineHeight: 18, color: color.text },
  quality: { flexDirection: 'row', flexWrap: 'wrap', gap: space.tight },
  qualityCell: { minWidth: 58, gap: 1 },
  qualityName: { fontFamily: font.bold, fontSize: 13, lineHeight: 17, ...shadow },
});
