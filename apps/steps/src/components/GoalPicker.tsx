import { type ComponentRef, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { GOALS, type Goal } from '../game/game';
import { color, layout, radius, space } from '../theme/theme';
import { Copy } from './ui';

function goalForKey(key: string, index: number): Goal | undefined {
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return GOALS[(index + 1) % GOALS.length];
    case 'ArrowLeft':
    case 'ArrowUp':
      return GOALS[(index - 1 + GOALS.length) % GOALS.length];
    case 'Home':
      return GOALS[0];
    case 'End':
      return GOALS.at(-1);
    case ' ':
      return GOALS[index];
    default:
      return undefined;
  }
}

export function GoalPicker({
  value,
  onChange,
}: Readonly<{ value: Goal; onChange: (goal: Goal) => void }>): React.JSX.Element {
  const buttons = useRef<Partial<Record<Goal, ComponentRef<typeof View> | null>>>({});
  const [focused, setFocused] = useState<Goal | null>(null);
  const widthSample = Math.max(...GOALS).toLocaleString();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Daily step goal" style={styles.goals}>
      {GOALS.map((goal, index) => {
        const selected = value === goal;
        return (
          <Pressable
            key={goal}
            ref={(element) => {
              buttons.current[goal] = element;
            }}
            accessibilityRole="radio"
            aria-checked={selected}
            accessibilityState={{ checked: selected }}
            accessibilityLabel={`${goal.toLocaleString()} steps per day`}
            tabIndex={Platform.OS === 'web' ? (selected ? 0 : -1) : undefined}
            onKeyDown={
              Platform.OS === 'web'
                ? (event) => {
                    if (event.nativeEvent.altKey || event.nativeEvent.ctrlKey || event.nativeEvent.metaKey)
                      return;
                    const next = goalForKey(event.nativeEvent.key, index);
                    if (next === undefined) return;
                    event.preventDefault();
                    onChange(next);
                    buttons.current[next]?.focus();
                  }
                : undefined
            }
            onFocus={() => setFocused(goal)}
            onBlur={() => setFocused(null)}
            onPress={() => onChange(goal)}
            style={({ pressed }) => [
              styles.goal,
              selected && styles.selected,
              focused === goal && styles.focused,
              pressed && { backgroundColor: color.raised },
            ]}
          >
            <View>
              {/* Equal intrinsic labels keep wrapped column edges aligned as text grows. */}
              <Copy aria-hidden accessible={false} style={[styles.goalText, styles.widthSample]}>
                {widthSample}
              </Copy>
              <Copy style={[styles.goalText, styles.goalValue, selected && { color: color.primary }]}>
                {goal.toLocaleString()}
              </Copy>
            </View>
            <Copy variant="label">steps</Copy>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  goals: { flexDirection: 'row', flexWrap: 'wrap', gap: space.tight },
  goal: {
    flexBasis: 'auto',
    flexGrow: 1,
    minWidth: '45%',
    maxWidth: '100%',
    minHeight: layout.touch,
    paddingVertical: space.group,
    paddingHorizontal: space.group,
    alignItems: 'center',
    gap: space.micro,
    borderRadius: radius.grape,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.panel,
  },
  selected: { borderColor: `${color.primary}88`, backgroundColor: `${color.primary}12` },
  focused: { outlineColor: color.primary, outlineWidth: 2, outlineOffset: 2, outlineStyle: 'solid' },
  goalText: { fontSize: 14, color: color.text },
  widthSample: { opacity: 0 },
  goalValue: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, textAlign: 'center' },
});
