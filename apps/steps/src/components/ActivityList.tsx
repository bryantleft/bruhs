import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { type Activity, getActivity, type Place, SKILLS, type SkillId } from '../game/content';
import { useGame } from '../game/GameProvider';
import { activityBlocker, skillLevel, stepsPerAction } from '../game/game';
import { itemCount } from '../game/items';
import { itemArt, SKILL_ART } from '../pixel/art';
import { bevel, Slot } from '../pixel/chrome';
import { Sprite } from '../pixel/Sprite';
import { color, font, shadow, space } from '../theme/theme';
import { ActivitySheet } from './ActivitySheet';
import { Icon } from './Icon';

function inputsLabel(activity: Activity): string | null {
  if (!activity.inputs?.length) return null;
  return activity.inputs.map((input) => itemCount(input.qty, input.item)).join(' + ');
}

const SHOWN = 5;

export function ActivityList({ place }: Readonly<{ place: Place }>): React.JSX.Element {
  const { game } = useGame();
  const [open, setOpen] = useState<Activity | null>(null);
  const [chosen, setChosen] = useState<SkillId | null>(null);
  const [expanded, setExpanded] = useState(false);
  const activities = place.activities.flatMap((id) => {
    const activity = getActivity(id);
    return activity ? [activity] : [];
  });
  const ready = (activity: Activity): boolean => !activityBlocker(game, activity);
  // Skills with something startable come first; the current task's skill wins the default.
  const skills = SKILLS.filter((skill) => activities.some((activity) => activity.skill === skill.id)).sort(
    (a, b) =>
      Number(activities.some((x) => x.skill === b.id && ready(x))) -
      Number(activities.some((x) => x.skill === a.id && ready(x))),
  );
  const current = game.task ? getActivity(game.task.id) : undefined;
  const fallback =
    current && skills.some((skill) => skill.id === current.skill) ? current.skill : skills[0]?.id;
  const skill = chosen && skills.some((entry) => entry.id === chosen) ? chosen : fallback;
  if (!skill) return <View />;
  const own = activities.filter((activity) => activity.skill === skill);
  const level = skillLevel(game, skill);
  const byLevel = (a: Activity, b: Activity): number => b.level - a.level;
  const unlocked = own.filter((activity) => activity.level <= level);
  const startable = unlocked.filter(ready).sort(byLevel);
  const blocked = unlocked.filter((activity) => !ready(activity)).sort(byLevel);
  // Lead with the best few you can start now, then the newest recipes that only need materials.
  const picked = startable.slice(0, 3);
  picked.push(...blocked.slice(0, SHOWN - picked.length));
  picked.push(...startable.slice(3, 3 + SHOWN - picked.length));
  const ordered = [...picked, ...[...startable, ...blocked].filter((activity) => !picked.includes(activity))];
  const next = own.filter((activity) => activity.level > level).sort((a, b) => a.level - b.level)[0];
  const shown = expanded ? ordered : picked;
  const folded = unlocked.length - shown.length;
  const later = own.length - unlocked.length - (next ? 1 : 0);
  const choose = (id: SkillId): void => {
    setChosen(id);
    setExpanded(false);
  };
  return (
    <View style={styles.list}>
      {skills.length > 1 ? (
        <View accessibilityRole="tablist" style={styles.chips}>
          {skills.map((entry) => {
            const selected = entry.id === skill;
            return (
              <Pressable
                key={entry.id}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={entry.name}
                onPress={() => choose(entry.id)}
                style={({ pressed }) => [
                  styles.chip,
                  bevel(selected ? 'gold' : 'panel', pressed || selected),
                ]}
              >
                <Sprite art={SKILL_ART[entry.id] ?? SKILL_ART.agility} size={14} />
                <Text numberOfLines={1} style={[styles.chipText, selected && { color: color.text }]}>
                  {entry.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={styles.groupTitle}>
          <Sprite art={SKILL_ART[skill] ?? SKILL_ART.agility} size={18} />
          <Text accessibilityRole="header" style={styles.groupText}>
            {SKILLS.find((entry) => entry.id === skill)?.name}
          </Text>
        </View>
      )}
      <View style={styles.group}>
        {[...shown, ...(next ? [next] : [])].map((activity) => (
          <ActivityRow key={activity.id} activity={activity} onOpen={setOpen} />
        ))}
        {folded > 0 || expanded ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setExpanded(!expanded)}
            style={({ pressed }) => [styles.more, bevel('well', pressed)]}
          >
            <Text style={styles.moreText}>
              {expanded
                ? 'show fewer recipes'
                : `show ${folded} older ${folded === 1 ? 'recipe' : 'recipes'}`}
            </Text>
          </Pressable>
        ) : null}
        {later > 0 ? <Text style={styles.later}>+{later} more unlock at higher levels</Text> : null}
      </View>
      {open ? <ActivitySheet activity={open} onClose={() => setOpen(null)} /> : null}
    </View>
  );
}

function ActivityRow({
  activity,
  onOpen,
}: Readonly<{ activity: Activity; onOpen: (activity: Activity) => void }>): React.JSX.Element {
  const { game } = useGame();
  const blocker = activityBlocker(game, activity);
  const active = game.task?.id === activity.id;
  const inputs = inputsLabel(activity);
  const steps = stepsPerAction(game, activity);
  const levelLocked = skillLevel(game, activity.skill) < activity.level;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityHint="Shows steps, chances and drops"
      accessibilityLabel={`${activity.verb} ${activity.name}. ${steps} steps each, ${activity.xp} xp.${inputs ? ` Uses ${inputs}.` : ''}${blocker ? ` ${blocker}.` : ''}${active ? ' Active.' : ''}`}
      onPress={() => onOpen(activity)}
      style={({ pressed }) => [styles.row, bevel(active ? 'green' : 'panel', pressed)]}
    >
      <Slot art={itemArt(activity.output.item)} size={44} dim={levelLocked} />
      <View style={styles.copy}>
        <Text style={[styles.name, levelLocked && { color: color.muted }]} numberOfLines={1}>
          {activity.name}
        </Text>
        <Text style={styles.meta}>
          lvl {activity.level} · {steps} steps · +{activity.xp} xp
        </Text>
        {activity.inputs?.length ? (
          // Sprites keep recipes on one line at compact widths; the label spells them out.
          <View style={styles.inputs}>
            <Text style={styles.inputsLabel}>uses</Text>
            {activity.inputs.map((input) => (
              <View key={input.item} style={styles.input}>
                <Sprite art={itemArt(input.item)} size={16} />
                <Text style={styles.inputQty}>×{input.qty}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {blocker && !active ? <Text style={styles.blocker}>{blocker}</Text> : null}
      </View>
      {active ? (
        <Text style={styles.active}>active</Text>
      ) : levelLocked ? (
        <Icon name="lock" tint={color.muted} />
      ) : (
        <Icon name="arrow" tint={color.faint} size={16} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.group },
  group: { gap: space.tight },
  groupTitle: { flexDirection: 'row', alignItems: 'center', gap: space.tight },
  groupText: { fontFamily: font.display, fontSize: 16, lineHeight: 22, color: color.gold, ...shadow },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.related,
    padding: space.tight,
    minHeight: 64,
  },
  copy: { flex: 1, minWidth: 0, gap: 1 },
  name: { fontFamily: font.bold, fontSize: 16, lineHeight: 20, color: color.text, ...shadow },
  meta: { fontFamily: font.label, fontSize: 10, lineHeight: 14, color: color.secondary },
  inputs: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.tight },
  inputsLabel: { fontFamily: font.label, fontSize: 10, lineHeight: 16, color: color.muted },
  input: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  inputQty: { fontFamily: font.label, fontSize: 10, lineHeight: 16, color: color.secondary },
  blocker: { fontFamily: font.label, fontSize: 10, lineHeight: 14, color: color.danger },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.micro },
  chip: {
    flexGrow: 1,
    flexBasis: '30%',
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.micro,
    paddingHorizontal: space.micro,
  },
  chipText: { fontFamily: font.label, fontSize: 10, lineHeight: 14, color: color.secondary, ...shadow },
  more: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  moreText: { fontFamily: font.label, fontSize: 11, lineHeight: 15, color: color.secondary, ...shadow },
  later: { fontFamily: font.label, fontSize: 10, lineHeight: 14, color: color.faint, ...shadow },
  active: { fontFamily: font.labelBold, fontSize: 11, color: color.success, ...shadow },
});
