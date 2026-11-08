import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { compact, Hud } from '../../components/Hud';
import { Icon } from '../../components/Icon';
import { Screen } from '../../components/ui';
import {
  ACTIVITIES,
  getLocation,
  LOCATIONS,
  METAL_STATS,
  METALS,
  SKILLS,
  type SkillId,
  TOOL_KINDS,
  TOOL_SKILL,
} from '../../game/content';
import { useGame } from '../../game/GameProvider';
import { totalXp } from '../../game/game';
import { levelProgress } from '../../game/xp';
import { useScreenFocus } from '../../navigation/useScreenFocus';
import { itemArt, SKILL_ART } from '../../pixel/art';
import { Bar, bevel, Panel, Slot } from '../../pixel/chrome';
import { Sprite } from '../../pixel/Sprite';
import { color, font, shadow, space } from '../../theme/theme';

type Unlock = Readonly<{ level: number; label: string; item: string; where?: string }>;

function unlocksFor(skill: SkillId): readonly Unlock[] {
  const unlocks: Unlock[] = ACTIVITIES.filter(
    // One row per metal tier instead of one per forged tool.
    (activity) =>
      activity.skill === skill && !(activity.id.startsWith('forge-') && !activity.id.endsWith('-axe')),
  ).map((activity) => {
    const place = LOCATIONS.find((entry) => entry.activities.includes(activity.id) && !activity.station);
    const forge = activity.id.startsWith('forge-');
    return {
      level: activity.level,
      label: forge ? `forge ${activity.name.split(' ')[0]} tools` : `${activity.verb} ${activity.name}`,
      item: activity.output.item,
      where: place?.name ?? (activity.station ? `any ${activity.station}` : undefined),
    };
  });
  const kind = TOOL_KINDS.find((entry) => TOOL_SKILL[entry] === skill);
  if (kind)
    for (const metal of METALS.slice(1))
      unlocks.push({
        level: METAL_STATS[metal].level,
        label: `wield ${metal} ${kind}`,
        item: `${metal}-${kind}`,
      });
  if (skill === 'agility') {
    const peak = getLocation('dragonfruit-peak');
    if (peak?.requires?.type === 'skill')
      unlocks.push({ level: peak.requires.level, label: `climb to ${peak.name}`, item: 'dragonfruit' });
  }
  return unlocks.sort((a, b) => a.level - b.level);
}

export default function SkillsScreen(): React.JSX.Element {
  const { game } = useGame();
  const screen = useScreenFocus();
  const [selected, setSelected] = useState<SkillId>('woodcutting');
  const detail = SKILLS.find((skill) => skill.id === selected) ?? SKILLS[0];
  const progress = levelProgress(game.xp[detail.id] ?? 0);
  return (
    <Screen rootRef={screen}>
      <Hud />
      {/* The HUD shows total level, and the grid's last cell total xp, so the title stands alone. */}
      <Text accessibilityRole="header" aria-level={1} style={styles.title}>
        skills
      </Text>
      <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel="Skills">
        {SKILLS.map((skill) => {
          const level = levelProgress(game.xp[skill.id] ?? 0);
          const active = skill.id === selected;
          return (
            <Pressable
              key={skill.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              aria-checked={active}
              accessibilityLabel={`${skill.name} level ${level.level}`}
              onPress={() => setSelected(skill.id)}
              style={({ pressed }) => [styles.cell, bevel(active ? 'gold' : 'panel', pressed)]}
            >
              <Sprite art={SKILL_ART[skill.id]} size={28} />
              <View style={styles.cellCopy}>
                <Text style={styles.level}>{level.level}</Text>
                <View style={styles.mini}>
                  <View style={[styles.miniFill, { width: `${level.progress * 100}%` }]} />
                </View>
              </View>
            </Pressable>
          );
        })}
        <View
          style={[styles.cell, styles.totalCell, bevel('well')]}
          accessible
          accessibilityLabel={`${totalXp(game).toLocaleString()} xp in all`}
        >
          <Text style={styles.totalLabel}>total xp</Text>
          <Text style={[styles.level, styles.totalValue]}>{compact(totalXp(game))}</Text>
        </View>
      </View>
      <Panel title={detail.name} aside={`level ${progress.level}`}>
        <Text style={styles.body}>{detail.blurb}</Text>
        <Bar value={progress.progress} height={14}>
          <Text style={styles.barText}>
            {progress.next
              ? `${progress.remaining.toLocaleString()} xp to level ${progress.level + 1}`
              : 'maxed. legendary.'}
          </Text>
        </Bar>
        <View style={styles.unlocks}>
          {unlocksFor(detail.id).map((unlock) => {
            const reached = progress.level >= unlock.level;
            return (
              <View key={unlock.label} style={styles.unlock}>
                <Slot art={itemArt(unlock.item)} size={36} dim={!reached} />
                <View style={styles.unlockCopy}>
                  <Text style={[styles.unlockName, !reached && { color: color.muted }]}>{unlock.label}</Text>
                  <Text style={styles.small}>
                    level {unlock.level}
                    {unlock.where ? ` · ${unlock.where}` : ''}
                  </Text>
                </View>
                {reached ? (
                  <Icon name="check" tint={color.success} />
                ) : (
                  <Icon name="lock" tint={color.muted} />
                )}
              </View>
            );
          })}
        </View>
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: font.display, fontSize: 26, lineHeight: 32, color: color.gold, ...shadow },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.tight },
  cell: {
    width: '31.5%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.tight,
    padding: space.tight,
    minHeight: 56,
  },
  cellCopy: { flex: 1, gap: 3 },
  // Label over value: "total xp" and a six-character figure don't fit side by side at 320.
  totalCell: { flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 0 },
  totalValue: { fontSize: 16 },
  totalLabel: { fontFamily: font.label, fontSize: 10, lineHeight: 14, color: color.muted, ...shadow },
  level: { fontFamily: font.labelBold, fontSize: 18, lineHeight: 20, color: color.gold, ...shadow },
  mini: { height: 4, backgroundColor: color.ink },
  miniFill: { height: 4, backgroundColor: color.xp },
  body: { fontFamily: font.body, fontSize: 15, lineHeight: 20, color: color.secondary },
  small: { fontFamily: font.label, fontSize: 10, lineHeight: 14, color: color.muted, ...shadow },
  barText: { fontFamily: font.label, fontSize: 10, lineHeight: 12, color: color.text, ...shadow },
  unlocks: { gap: space.tight },
  unlock: { flexDirection: 'row', alignItems: 'center', gap: space.related },
  unlockCopy: { flex: 1, minWidth: 0 },
  unlockName: { fontFamily: font.bold, fontSize: 15, lineHeight: 19, color: color.text, ...shadow },
});
