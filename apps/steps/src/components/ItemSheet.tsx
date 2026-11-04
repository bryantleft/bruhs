import { StyleSheet, Text, View } from 'react-native';
import { type GearSlot, getItem, QUALITIES, stackSize } from '../game/content';
import { useGame } from '../game/GameProvider';
import {
  actionRejection,
  atBank,
  atStore,
  type GameAction,
  orList,
  questsNeeding,
  type Rejection,
  requirementText,
  townsWith,
} from '../game/game';
import { formatMod, keyItem, keyMods, keyName, keyValue, parseKey } from '../game/items';
import { itemArt } from '../pixel/art';
import { QUALITY_TINT, Slot, Tag } from '../pixel/chrome';
import { color, font, shadow, space } from '../theme/theme';
import { Sheet } from './Sheet';
import { Button } from './ui';

export type ItemOrigin =
  | Readonly<{ from: 'inventory' }>
  | Readonly<{ from: 'bank' }>
  | Readonly<{ from: 'gear'; slot: GearSlot }>
  | Readonly<{ from: 'tool' }>;

function percent(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}

export function ItemSheet({
  itemKey,
  origin,
  onClose,
}: Readonly<{ itemKey: string; origin: ItemOrigin; onClose: () => void }>): React.JSX.Element | null {
  const { game, act } = useGame();
  const item = keyItem(itemKey);
  if (!item) return null;
  const { quality } = parseKey(itemKey);
  const inBag = game.inventory[itemKey] ?? 0;
  const inBank = game.bank[itemKey] ?? 0;
  const bank = atBank(game);
  const store = atStore(game);
  const owned = origin.from === 'bank' ? inBank : inBag;
  const mods = keyMods(itemKey);
  // Warn before eating, selling or dropping something an active quest is waiting for.
  const neededBy = questsNeeding(game, item.id)[0];
  const banks = townsWith('bank');
  const stores = townsWith('store');
  const townsHint =
    orList(banks) === orList(stores)
      ? `bank and sell in ${orList(banks)}.`
      : `bank in ${orList(banks)}. sell in ${orList(stores)}.`;
  // Buttons ask the rules themselves, so they never offer what the rules would refuse.
  const wearRejection = actionRejection(game, { type: 'wear', item: itemKey });
  const wearBlocker = wearRejection?.kind === 'requires' ? requirementText(wearRejection.requirement) : null;
  const takeQty = Math.min(inBank, Number.isFinite(stackSize(item)) ? stackSize(item) : inBank);
  const bagFull =
    origin.from === 'bank' &&
    inBank > 0 &&
    actionRejection(game, { type: 'withdraw', item: itemKey, qty: 1 })?.kind === 'bag-full';
  const wearable =
    (item.kind === 'gear' || item.kind === 'tool') &&
    (origin.from === 'inventory' || (origin.from === 'bank' && bank));
  const lootWeight = item.loot?.table.reduce((sum, entry) => sum + entry.weight, 0) ?? 1;
  // A refused action leaves the sheet open; the session explains why in a notice.
  const run = (action: GameAction, close = false): void => {
    const rejection: Rejection | null = act(action);
    if (close && (!rejection || rejection.kind === 'no-change')) onClose();
  };
  const left = (qty: number): boolean => owned - qty <= 0;
  // The main action rides in the sheet's pinned footer so it stays in reach above long loot tables.
  const primary = (
    <>
      {wearable ? (
        <Button
          label={wearBlocker ?? (item.tool ? 'wield' : 'wear')}
          icon="check"
          disabled={!!wearBlocker}
          onPress={() => run({ type: 'wear', item: itemKey }, left(1))}
        />
      ) : null}
      {origin.from === 'gear' ? (
        <Button
          label="take off"
          icon="back"
          onPress={() => run({ type: 'unwear', slot: origin.slot }, true)}
        />
      ) : null}
      {item.buff && owned > 0 ? (
        <Button label="eat" icon="health" onPress={() => run({ type: 'eat', item: item.id }, left(1))} />
      ) : null}
      {item.loot && origin.from === 'inventory' && inBag > 0 ? (
        <View style={styles.row}>
          <View style={styles.grow}>
            <Button
              label="open 1"
              icon="chest"
              onPress={() => run({ type: 'open', item: item.id, count: 1 }, left(1))}
            />
          </View>
          {inBag > 1 ? (
            <View style={styles.grow}>
              <Button
                label={`open all ${inBag}`}
                variant="outline"
                onPress={() => run({ type: 'open', item: item.id, count: inBag }, true)}
              />
            </View>
          ) : null}
        </View>
      ) : null}
    </>
  );
  const hasPrimary =
    wearable ||
    origin.from === 'gear' ||
    (!!item.buff && owned > 0) ||
    (!!item.loot && origin.from === 'inventory' && inBag > 0);
  return (
    <Sheet
      title={keyName(itemKey)}
      titleTint={QUALITY_TINT[quality]}
      onClose={onClose}
      footer={hasPrimary ? <View style={styles.actions}>{primary}</View> : undefined}
    >
      <View style={styles.hero}>
        <Slot art={itemArt(item.id)} size={72} />
        <View style={styles.grow}>
          <View style={styles.tags}>
            <Tag tint={color.secondary}>{item.slot ?? item.kind}</Tag>
            {quality > 0 ? <Tag tint={QUALITY_TINT[quality]}>{QUALITIES[quality].name}</Tag> : null}
          </View>
          <Text style={styles.body}>{item.blurb}</Text>
          <Text style={styles.small}>
            worth {keyValue(itemKey).toLocaleString()} coins
            {Number.isFinite(stackSize(item)) ? ` · stacks ${stackSize(item)}` : ' · treasury'}
          </Text>
          <Text style={styles.small}>
            bag {inBag.toLocaleString()} · bank {inBank.toLocaleString()}
          </Text>
          {neededBy ? (
            <Text style={styles.quest}>
              {neededBy.quest.name} needs {neededBy.qty}. keep them before eating, selling or dropping.
            </Text>
          ) : null}
        </View>
      </View>
      {mods.length ? (
        <View style={styles.list}>
          <Text style={styles.label}>stats{quality > 0 ? ` (×${QUALITIES[quality].mult})` : ''}</Text>
          {mods.map((mod) => (
            <Text key={`${mod.stat}-${mod.skill ?? 'all'}`} style={styles.stat}>
              {formatMod(mod)}
            </Text>
          ))}
        </View>
      ) : null}
      {item.buff ? (
        <View style={styles.list}>
          <Text style={styles.label}>eat for {item.buff.actions} actions</Text>
          {item.buff.mods.map((mod) => (
            <Text key={mod.stat} style={styles.stat}>
              {formatMod(mod)}
            </Text>
          ))}
          {game.buff ? (
            <Text style={styles.small}>replaces your {getItem(game.buff.item)?.name} bonus.</Text>
          ) : null}
        </View>
      ) : null}
      {item.loot ? (
        <View style={styles.list}>
          <Text style={styles.label}>
            contains {item.loot.coins[0]}–{item.loot.coins[1]} coins and one of
          </Text>
          {item.loot.table.map((entry) => (
            <View key={entry.item} style={styles.lootRow}>
              <Slot art={itemArt(entry.item)} size={28} />
              <Text style={styles.lootName}>
                {entry.min === entry.max ? entry.min : `${entry.min}–${entry.max}`}{' '}
                {getItem(entry.item)?.name}
              </Text>
              <Text style={styles.small}>{percent(entry.weight / lootWeight)}</Text>
            </View>
          ))}
          <Text style={styles.small}>a quarter of chests roll twice.</Text>
        </View>
      ) : null}
      <View style={styles.actions}>
        {bank && origin.from === 'inventory' && inBag > 0 ? (
          <View style={styles.row}>
            <View style={styles.grow}>
              <Button
                label="bank 1"
                variant="outline"
                onPress={() => run({ type: 'deposit', item: itemKey, qty: 1 }, left(1))}
              />
            </View>
            <View style={styles.grow}>
              <Button
                label="bank all"
                variant="outline"
                onPress={() => run({ type: 'deposit', item: itemKey, qty: inBag }, true)}
              />
            </View>
          </View>
        ) : null}
        {bank && origin.from === 'bank' && inBank > 0 ? (
          <View style={styles.row}>
            <View style={styles.grow}>
              <Button
                label="take 1"
                variant="outline"
                disabled={bagFull}
                onPress={() => run({ type: 'withdraw', item: itemKey, qty: 1 }, left(1))}
              />
            </View>
            <View style={styles.grow}>
              <Button
                label={`take ${takeQty}`}
                variant="outline"
                disabled={bagFull}
                onPress={() => run({ type: 'withdraw', item: itemKey, qty: takeQty }, false)}
              />
            </View>
          </View>
        ) : null}
        {bagFull ? <Text style={styles.small}>your bag is full. bank or drop something first.</Text> : null}
        {store && (origin.from === 'inventory' || origin.from === 'bank') && owned > 0 ? (
          <View style={styles.row}>
            <View style={styles.grow}>
              <Button
                label={`sell 1 · ${keyValue(itemKey)}`}
                variant="outline"
                onPress={() => run({ type: 'sell', item: itemKey, qty: 1 }, left(1))}
              />
            </View>
            {owned > 1 ? (
              <View style={styles.grow}>
                <Button
                  label={`sell all · ${(keyValue(itemKey) * owned).toLocaleString()}`}
                  variant="outline"
                  onPress={() => run({ type: 'sell', item: itemKey, qty: owned }, true)}
                />
              </View>
            ) : null}
          </View>
        ) : null}
        {origin.from === 'inventory' && inBag > 0 && !bank ? (
          <Button
            label={`drop ${inBag > 1 ? `all ${inBag}` : ''}`.trim()}
            variant="ghost"
            onPress={() => run({ type: 'drop', item: itemKey, qty: inBag }, true)}
          />
        ) : null}
        {!bank && origin.from === 'inventory' && !store ? (
          <Text style={styles.small}>{townsHint}</Text>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', gap: space.related, alignItems: 'flex-start' },
  grow: { flex: 1, minWidth: 0, gap: space.micro },
  tags: { flexDirection: 'row', gap: space.tight, flexWrap: 'wrap' },
  body: { fontFamily: font.body, fontSize: 15, lineHeight: 20, color: color.secondary },
  small: { fontFamily: font.label, fontSize: 10, lineHeight: 14, color: color.muted, ...shadow },
  label: { fontFamily: font.label, fontSize: 11, lineHeight: 15, color: color.gold, ...shadow },
  quest: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: color.gold },
  list: { gap: space.micro },
  stat: { fontFamily: font.bold, fontSize: 15, lineHeight: 20, color: color.success, ...shadow },
  lootRow: { flexDirection: 'row', alignItems: 'center', gap: space.tight },
  lootName: { flex: 1, fontFamily: font.body, fontSize: 14, lineHeight: 18, color: color.text },
  actions: { gap: space.tight },
  row: { flexDirection: 'row', gap: space.tight },
});
