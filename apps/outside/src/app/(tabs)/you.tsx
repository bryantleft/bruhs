import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Bruh } from '../../components/Bruh';
import { ConfirmAction } from '../../components/ConfirmAction';
import { Icon } from '../../components/Icon';
import { TrackingControl } from '../../components/TrackingControl';
import { Screen } from '../../components/ui';
import { WeekHistory } from '../../components/WeekHistory';
import { useParty } from '../../friends/PartyProvider';
import { ITEMS, SKINS } from '../../game/content';
import { useGame } from '../../game/GameProvider';
import { getSkin, questPoints, streak, totalLevel, totalSteps, totalXp } from '../../game/game';
import { useScreenFocus, useScreenLink } from '../../navigation/useScreenFocus';
import { bevel, Panel } from '../../pixel/chrome';
import { color, font, shadow, space } from '../../theme/theme';

function LinkRow({
  icon,
  label,
  detail,
  link,
}: Readonly<{
  icon: 'chest' | 'party' | 'map' | 'settings';
  label: string;
  detail: string;
  link: ReturnType<typeof useScreenLink>;
}>): React.JSX.Element {
  return (
    <Pressable
      ref={link.buttonRef}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${detail}`}
      onPress={link.open}
      onKeyDownCapture={link.onKeyDownCapture}
      style={({ pressed }) => [styles.link, bevel('panel', pressed)]}
    >
      <Icon name={icon} tint={color.gold} />
      <View style={styles.grow}>
        <Text style={styles.linkLabel}>{label}</Text>
        <Text style={styles.small}>{detail}</Text>
      </View>
      <Icon name="arrow" tint={color.muted} />
    </Pressable>
  );
}

export default function YouScreen(): React.JSX.Element {
  const screen = useScreenFocus();
  const { game, today, demo, equip, reset, resetting, resetError } = useGame();
  const { available: hasParties } = useParty();
  const partyLink = useScreenLink('/party');
  const walkLink = useScreenLink('/explore');
  const healthLink = useScreenLink('/health');
  const collectionLink = useScreenLink('/collection');
  const total = totalLevel(game);
  const stats = [
    ['total level', total.toLocaleString()],
    ['total xp', totalXp(game).toLocaleString()],
    ['quest points', String(questPoints(game))],
    ['lifetime steps', totalSteps(game).toLocaleString()],
    ['actions done', game.actions.toLocaleString()],
    ['goal streak', `${streak(game, today)} days`],
  ] as const;
  // Lifetime counters fold away; the headline stats stay in view.
  const [records, setRecords] = useState(false);
  const seen = new Set(game.seen);
  const found = ITEMS.filter((item) => seen.has(item.id)).length;
  const counters = [
    ['chests found while working', game.stats.chestsFound ?? 0],
    ['chests opened', game.stats.chestsOpened ?? 0],
    ['gear crafted', game.stats.crafted ?? 0],
    ['rare finds', game.stats.finds ?? 0],
    ['extra actions', game.stats.doubleActions ?? 0],
    ['double loot', game.stats.doubleResults ?? 0],
    ['materials saved', game.stats.preserved ?? 0],
    ['food eaten', game.stats.eaten ?? 0],
    ['fish burnt', game.stats.burnt ?? 0],
  ] as const;
  return (
    <Screen rootRef={screen}>
      <View style={styles.hero}>
        <View style={[styles.portrait, bevel('well')]}>
          <Bruh skin={game.equipped} size={96} />
        </View>
        <View style={styles.grow}>
          <Text accessibilityRole="header" aria-level={1} style={styles.title}>
            {getSkin(game.equipped).name}
          </Text>
          <Text style={styles.small}>adventurer of the fruitlands</Text>
        </View>
      </View>
      <Panel title="stats">
        <View style={styles.stats}>
          {stats.map(([label, value]) => (
            <View key={label} style={styles.stat}>
              <Text style={styles.small}>{label}</Text>
              <Text style={styles.value}>{value}</Text>
            </View>
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: records }}
          aria-expanded={records}
          onPress={() => setRecords(!records)}
          style={({ pressed }) => [styles.toggle, bevel('well', pressed)]}
        >
          <Text style={styles.toggleText}>{records ? 'hide' : 'show'} lifetime records</Text>
          <Icon name={records ? 'close' : 'plus'} tint={color.muted} size={14} />
        </Pressable>
        {records ? (
          <View style={styles.stats}>
            {counters.map(([label, value]) => (
              <View key={label} style={styles.stat}>
                <Text style={styles.small}>{label}</Text>
                <Text style={styles.value}>{value.toLocaleString()}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </Panel>
      <LinkRow
        icon="chest"
        label="collection log"
        detail={`${found} of ${ITEMS.length} items found`}
        link={collectionLink}
      />
      <Panel title="outfits" aside="unlock with total level">
        <View style={styles.outfits} accessibilityRole="radiogroup" accessibilityLabel="Outfits">
          {SKINS.map((skin) => {
            const unlocked = total >= skin.total;
            const active = game.equipped === skin.id;
            return (
              <Pressable
                key={skin.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: active, disabled: !unlocked }}
                aria-checked={active}
                accessibilityLabel={`${skin.name}${unlocked ? '' : `, unlocks at total level ${skin.total}`}`}
                disabled={!unlocked}
                onPress={() => equip(skin.id)}
                style={({ pressed }) => [styles.outfit, bevel(active ? 'gold' : 'well', pressed)]}
              >
                <View style={!unlocked && styles.locked}>
                  <Bruh skin={skin.id} size={48} asleep={!unlocked} />
                </View>
                <Text
                  style={[styles.small, { color: active ? color.text : color.secondary }]}
                  numberOfLines={1}
                >
                  {unlocked ? skin.name : `lvl ${skin.total}`}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Panel>
      <WeekHistory />
      {/* The browser demo's only way to get steps. */}
      {demo ? <TrackingControl /> : null}
      <View style={styles.links}>
        {hasParties ? (
          <LinkRow
            icon="party"
            label="party races"
            detail="private weekly step races with friends"
            link={partyLink}
          />
        ) : null}
        <LinkRow icon="map" label="real-world walk" detail="map a gps walk and earn stamps" link={walkLink} />
        <LinkRow
          icon="settings"
          label="settings"
          detail={
            demo
              ? 'daily goal, sample steps and privacy'
              : 'daily goal, step sync, privacy and erasing your journey'
          }
          link={healthLink}
        />
      </View>
      <Text style={styles.small}>
        {demo ? 'adventure saved in this browser.' : 'adventure saved on this device.'}
      </Text>
      {demo ? (
        <ConfirmAction
          label={resetting ? 'resetting demo…' : 'reset demo'}
          confirmLabel="yes, reset"
          cancelLabel="keep my demo"
          description="skills, bank and quests are erased."
          icon="refresh"
          onConfirm={reset}
          disabled={resetting}
        />
      ) : null}
      {demo && resetError ? (
        <Text accessibilityLiveRegion="polite" style={[styles.small, { color: color.danger }]}>
          {resetError}
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: space.group },
  portrait: { padding: space.tight },
  grow: { flex: 1, minWidth: 0 },
  title: { fontFamily: font.display, fontSize: 26, lineHeight: 32, color: color.gold, ...shadow },
  small: { fontFamily: font.label, fontSize: 10, lineHeight: 14, color: color.muted, ...shadow },
  stats: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.related },
  stat: { width: '50%', gap: 2 },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: space.related,
    minHeight: 48,
  },
  toggleText: { fontFamily: font.label, fontSize: 11, lineHeight: 15, color: color.secondary, ...shadow },
  value: { fontFamily: font.labelBold, fontSize: 15, lineHeight: 19, color: color.text, ...shadow },
  outfits: { flexDirection: 'row', flexWrap: 'wrap', gap: space.tight },
  outfit: { width: '31%', flexGrow: 1, alignItems: 'center', gap: space.micro, padding: space.tight },
  locked: { opacity: 0.35 },
  links: { gap: space.tight },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.related,
    padding: space.related,
    minHeight: 56,
  },
  linkLabel: { fontFamily: font.bold, fontSize: 16, lineHeight: 21, color: color.text, ...shadow },
});
