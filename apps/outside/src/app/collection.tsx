import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ItemSheet } from '../components/ItemSheet';
import { Copy, IconButton, Screen } from '../components/ui';
import { ITEMS, type Item, type ItemKind } from '../game/content';
import { useGame } from '../game/GameProvider';
import { backToAdventure, useScreenFocus } from '../navigation/useScreenFocus';
import { ghost, itemArt } from '../pixel/art';
import { Panel, Slot } from '../pixel/chrome';
import { space } from '../theme/theme';

// Every item in the game, grouped the way a collector thinks of them. Items you haven't found show
// as a faint silhouette; found ones open the item sheet.
const GROUPS: readonly Readonly<{ title: string; kinds: readonly ItemKind[] }>[] = [
  { title: 'wood, ore and bars', kinds: ['log', 'ore', 'bar'] },
  { title: 'fish and food', kinds: ['raw', 'food', 'junk'] },
  { title: 'fruit, fibre and cloth', kinds: ['fruit', 'fiber', 'cloth'] },
  { title: 'gems and treasures', kinds: ['gem', 'valuable', 'chest'] },
  { title: 'tools', kinds: ['tool'] },
  { title: 'gear', kinds: ['gear'] },
];

export default function CollectionScreen(): React.JSX.Element {
  const screen = useScreenFocus();
  const { game } = useGame();
  const [inspect, setInspect] = useState<string | null>(null);
  const seen = new Set(game.seen);
  const found = ITEMS.filter((item) => seen.has(item.id)).length;
  const groups = GROUPS.map((group) => ({
    ...group,
    items: ITEMS.filter((item) => group.kinds.includes(item.kind)),
  }));
  // A kind missing from the groups still shows, so a new item can't vanish from the log.
  const grouped = new Set(GROUPS.flatMap((group) => group.kinds));
  const other = ITEMS.filter((item) => !grouped.has(item.kind));
  const all: readonly Readonly<{ title: string; items: readonly Item[] }>[] = other.length
    ? [...groups, { title: 'other finds', items: other }]
    : groups;
  return (
    <Screen rootRef={screen} bottomSafeArea>
      <View style={styles.navigation}>
        <IconButton
          icon="back"
          label="Back to your adventure"
          onPress={() => backToAdventure('/collection')}
        />
        <Copy variant="title" style={styles.title}>
          collection log
        </Copy>
      </View>
      <Copy variant="small">
        {found} of {ITEMS.length} items found. tap one you have found to read about it.
      </Copy>
      {all.map((group) => (
        <Panel
          key={group.title}
          title={group.title}
          aside={`${group.items.filter((item) => seen.has(item.id)).length}/${group.items.length}`}
        >
          <View style={styles.log}>
            {group.items.map((item) => {
              const has = seen.has(item.id);
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={has ? item.name : 'Not found yet'}
                  disabled={!has}
                  onPress={() => setInspect(item.id)}
                >
                  <Slot art={has ? itemArt(item.id) : ghost(itemArt(item.id))} size={40} />
                </Pressable>
              );
            })}
          </View>
        </Panel>
      ))}
      {inspect ? (
        <ItemSheet itemKey={inspect} origin={{ from: 'inventory' }} onClose={() => setInspect(null)} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  navigation: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.tight,
    marginHorizontal: -space.tight,
  },
  title: { flexGrow: 1, flexShrink: 0, flexBasis: 'auto', maxWidth: '100%' },
  log: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
});
