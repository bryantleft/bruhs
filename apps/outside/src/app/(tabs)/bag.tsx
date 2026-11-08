import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { type ItemOrigin, ItemSheet } from '../../components/ItemSheet';
import { PageTitle, useTabStat } from '../../components/PageTitle';
import { Sheet } from '../../components/Sheet';
import { type Cell, SlotGrid } from '../../components/SlotGrid';
import { Button, Screen } from '../../components/ui';
import {
  BAG_UPGRADE_SLOTS,
  BAG_UPGRADES,
  GEAR_SLOTS,
  type GearSlot,
  getItem,
  getLocation,
  ITEMS,
  METALS,
  SKILLS,
  STAT_IDS,
  STORE_STOCK,
  slotFits,
  stackSize,
  TOOL_KINDS,
  TOOL_SKILL,
} from '../../game/content';
import { useGame } from '../../game/GameProvider';
import { atBank, atStore, capacityOf, nextBagUpgrade, townsWith } from '../../game/game';
import {
  countOf,
  formatMod,
  formatPercent,
  keyItem,
  keyMods,
  keyName,
  keyValue,
  parseKey,
  slotsUsed,
  statLabel,
  totalsFor,
} from '../../game/items';
import { useScreenFocus } from '../../navigation/useScreenFocus';
import { ghost, itemArt, SLOT_ART, UI_ART } from '../../pixel/art';
import { bevel, Panel, QUALITY_TINT, Segments, Slot } from '../../pixel/chrome';
import { Sprite } from '../../pixel/Sprite';
import { palette } from '../../theme/palette';
import { color, font, shadow, space } from '../../theme/theme';

const ORDER = new Map(ITEMS.map((item, index) => [item.id, index]));
function byOrder(a: string, b: string): number {
  const left = parseKey(a);
  const right = parseKey(b);
  return (ORDER.get(left.id) ?? 0) - (ORDER.get(right.id) ?? 0) || left.quality - right.quality;
}

type Segment = 'items' | 'gear' | 'bank' | 'store';
type Open = Readonly<{ key: string; origin: ItemOrigin }> | null;

function Inventory({ onOpen }: Readonly<{ onOpen: (open: Open) => void }>): React.JSX.Element {
  const { game, act } = useGame();
  const capacity = capacityOf(game);
  const used = slotsUsed(game.inventory);
  const keys = Object.keys(game.inventory).sort(byOrder);
  const chests = keys.filter((key) => keyItem(key)?.kind === 'chest');
  const cells: Cell[] = [];
  for (const key of keys) {
    const item = keyItem(key);
    if (!item || item.kind === 'chest') continue;
    let left = game.inventory[key] ?? 0;
    const size = stackSize(item);
    while (left > 0) {
      cells.push({ key, qty: Math.min(size, left) });
      left -= size;
    }
  }
  while (cells.length < capacity) cells.push(null);
  const buff = game.buff ? getItem(game.buff.item) : undefined;
  return (
    <>
      {/* The grid below shows every slot, so a fill bar would only repeat the count. */}
      <Panel title="in your bag" aside={`${used}/${capacity} slots`}>
        {used >= capacity ? (
          <Text style={[styles.small, { color: color.danger }]}>
            full. gathering stops until you bank, sell, drop or wear a bigger pack.
          </Text>
        ) : null}
        <SlotGrid
          cells={cells}
          label="Bag"
          onPress={(key) => onOpen({ key, origin: { from: 'inventory' } })}
        />
        {atBank(game) && keys.length ? (
          <Button label="bank everything" icon="chest" onPress={() => act({ type: 'deposit-all' })} />
        ) : null}
      </Panel>
      <Panel title="treasury" aside="chests take no space">
        {chests.length ? (
          <View style={styles.wrap}>
            {chests.map((key) => (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={`${keyName(key)}, ${game.inventory[key]}. Open.`}
                onPress={() => onOpen({ key, origin: { from: 'inventory' } })}
              >
                <Slot art={itemArt(key)} qty={game.inventory[key]} size={56} always />
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={styles.body}>no chests yet. every action has a small chance to find one.</Text>
        )}
      </Panel>
      <Panel title="food bonus" aside={buff ? `${game.buff?.actions} actions left` : undefined}>
        {buff ? (
          <View style={styles.row}>
            <Slot art={itemArt(buff.id)} size={44} />
            <Text style={[styles.body, styles.grow]}>
              {buff.name}:{' '}
              {buff.buff?.mods.map((mod) => `+${formatPercent(mod.value)} ${statLabel(mod.stat)}`).join(', ')}
            </Text>
          </View>
        ) : (
          <Text style={styles.body}>none. tap cooked fish or fruit in your bag to eat it.</Text>
        )}
      </Panel>
    </>
  );
}

// Paper-doll layout; "-" cells are spacers with their own stable ids.
const DOLL: readonly (readonly string[])[] = [
  ['-a', 'head', '-b'],
  ['cape', 'neck', 'back'],
  ['hands', 'chest', 'ring1'],
  ['-c', 'legs', 'ring2'],
  ['-d', 'feet', '-e'],
];
function isSlot(cell: string): cell is GearSlot {
  return (GEAR_SLOTS as readonly string[]).includes(cell);
}

function Gear({ onOpen }: Readonly<{ onOpen: (open: Open) => void }>): React.JSX.Element {
  const { game, act } = useGame();
  const [picking, setPicking] = useState<GearSlot | null>(null);
  const global = totalsFor(game, null);
  const owned = (slot: GearSlot): string[] =>
    [
      ...Object.keys(game.inventory),
      ...(atBank(game) ? Object.keys(game.bank).filter((key) => !(key in game.inventory)) : []),
    ]
      .filter((key) => {
        const item = keyItem(key);
        return item?.slot ? slotFits(slot, item.slot) : false;
      })
      .sort(byOrder);
  return (
    <>
      <Panel title="equipment">
        <View style={styles.doll}>
          {DOLL.map((row) => (
            <View key={row.join()} style={styles.dollRow}>
              {row.map((slot) => {
                if (!isSlot(slot)) return <View key={slot} style={styles.dollGap} />;
                const key = game.gear[slot];
                return (
                  <Pressable
                    key={slot}
                    accessibilityRole="button"
                    accessibilityLabel={key ? `${slot}: ${keyName(key)}` : `${slot}: empty. Choose gear.`}
                    onPress={() => (key ? onOpen({ key, origin: { from: 'gear', slot } }) : setPicking(slot))}
                    style={styles.dollCell}
                  >
                    <Slot art={key ? itemArt(parseKey(key).id) : ghost(SLOT_ART[slot])} size={60} />
                    {key && parseKey(key).quality > 0 ? (
                      <View
                        style={[styles.qualityDot, { backgroundColor: QUALITY_TINT[parseKey(key).quality] }]}
                      />
                    ) : null}
                    <Text style={styles.slotName}>{slot.replace(/\d/, '')}</Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </Panel>
      <Panel title="toolbelt">
        <View style={styles.tools}>
          {TOOL_KINDS.map((kind) => (
            <Pressable
              key={kind}
              accessibilityRole="button"
              accessibilityLabel={`${keyName(game.tools[kind])} for ${TOOL_SKILL[kind]}`}
              onPress={() => onOpen({ key: game.tools[kind], origin: { from: 'tool' } })}
              style={styles.tool}
            >
              <Slot art={itemArt(parseKey(game.tools[kind]).id)} size={56} />
              <Text style={styles.slotName}>{keyItem(game.tools[kind])?.tool?.metal}</Text>
            </Pressable>
          ))}
        </View>
      </Panel>
      <Panel title="stats" aside="from gear, tools and food">
        <View style={styles.statGrid}>
          {STAT_IDS.filter((stat) => stat !== 'quality').map((stat) => (
            <View key={stat} style={styles.statCell}>
              <Text style={styles.small}>{statLabel(stat)}</Text>
              <Text style={[styles.statValue, global[stat] > 0 && { color: color.success }]}>
                {stat === 'slots' ? `${capacityOf(game)}` : `+${formatPercent(global[stat])}`}
              </Text>
            </View>
          ))}
        </View>
        <Text style={styles.label}>per skill</Text>
        {SKILLS.filter((skill) => skill.id !== 'agility').map((skill) => {
          const totals = totalsFor(game, skill.id);
          const parts = (['efficiency', 'doubleAction', 'doubleResult', 'preserve', 'find'] as const)
            .filter(
              (stat) => totals[stat] - global[stat] > 0.0001 || (stat === 'efficiency' && totals[stat] > 0),
            )
            .map((stat) => `+${formatPercent(totals[stat])} ${statLabel(stat)}`);
          return (
            <View key={skill.id} style={styles.skillRow}>
              <Text style={styles.skillName}>{skill.name}</Text>
              <Text style={[styles.small, styles.grow, parts.length > 0 && { color: color.success }]}>
                {parts.length ? parts.join(' · ') : 'no bonuses'}
              </Text>
            </View>
          );
        })}
      </Panel>
      {picking ? (
        <Sheet title={`${picking.replace(/\d/, '')} slot`} onClose={() => setPicking(null)}>
          {owned(picking).length ? (
            owned(picking).map((key) => (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={`Wear ${keyName(key)}`}
                onPress={() => {
                  act({ type: 'wear', item: key, slot: picking });
                  setPicking(null);
                }}
                style={({ pressed }) => [styles.pick, bevel('panel', pressed)]}
              >
                <Slot art={itemArt(parseKey(key).id)} size={44} />
                <View style={styles.grow}>
                  <Text style={[styles.pickName, { color: QUALITY_TINT[parseKey(key).quality] }]}>
                    {keyName(key)}
                  </Text>
                  <Text style={styles.small}>{keyMods(key).map(formatMod).join(' · ')}</Text>
                </View>
              </Pressable>
            ))
          ) : (
            <Text style={styles.body}>
              nothing for this slot{atBank(game) ? '' : ' in your bag'}. craft gear at a workbench or forge,
              or find it in chests.
            </Text>
          )}
        </Sheet>
      ) : null}
    </>
  );
}

function Bank({ onOpen }: Readonly<{ onOpen: (open: Open) => void }>): React.JSX.Element {
  const { game, act } = useGame();
  const here = atBank(game);
  const keys = Object.keys(game.bank).sort(byOrder);
  const worth = keys.reduce((sum, key) => sum + keyValue(key) * (game.bank[key] ?? 0), 0);
  const towns = townsWith('bank');
  return (
    <Panel title="bank" aside={`worth ${worth.toLocaleString()}`}>
      {here ? (
        Object.keys(game.inventory).length ? (
          <Button
            label="bank everything in my bag"
            icon="chest"
            onPress={() => act({ type: 'deposit-all' })}
          />
        ) : null
      ) : (
        <Text style={[styles.body, { color: palette['durian-300'] }]}>
          look only. the bank opens in {towns.join(' and ')}.
        </Text>
      )}
      {keys.length ? (
        <SlotGrid
          columns={5}
          cells={keys.map((key) => ({ key, qty: game.bank[key] ?? 0 }))}
          label="Bank"
          onPress={(key) => onOpen({ key, origin: { from: 'bank' } })}
        />
      ) : (
        <Text style={styles.body}>empty.</Text>
      )}
    </Panel>
  );
}

function BagUpgrade(): React.JSX.Element {
  const { game, act } = useGame();
  const price = nextBagUpgrade(game);
  const slots = capacityOf(game);
  return (
    <Panel title="bag upgrades" aside={`${game.bagUpgrades}/${BAG_UPGRADES.length} bought`}>
      <View style={styles.pickRow}>
        <Sprite art={UI_ART.bag} size={32} />
        <Text style={[styles.body, styles.grow]}>
          {price === null
            ? `your bag is fully upgraded: ${slots} slots.`
            : `stitch in ${BAG_UPGRADE_SLOTS} more slots, from ${slots} to ${slots + BAG_UPGRADE_SLOTS}.`}
        </Text>
      </View>
      {price !== null ? (
        <Button
          label={
            game.coins >= price
              ? `upgrade for ${price.toLocaleString()} coins`
              : `needs ${price.toLocaleString()} coins`
          }
          icon="plus"
          disabled={game.coins < price}
          onPress={() => act({ type: 'upgrade-bag' })}
        />
      ) : null}
    </Panel>
  );
}

function Store(): React.JSX.Element {
  const { game, act } = useGame();
  const place = getLocation(game.location);
  return (
    <Panel title={`${place?.name} store`} aside="tap to buy">
      {STORE_STOCK.map((offer) => {
        const affordable = game.coins >= offer.price;
        // Tools you already hold (or out-class) say so instead of looking merely unaffordable.
        const tool = getItem(offer.item)?.tool;
        const wielded = tool ? keyItem(game.tools[tool.kind])?.tool : undefined;
        const owned =
          !!tool &&
          (game.tools[tool.kind] === offer.item ||
            countOf(game.inventory, offer.item) + countOf(game.bank, offer.item) > 0);
        const outclassed = !!tool && !!wielded && METALS.indexOf(wielded.metal) > METALS.indexOf(tool.metal);
        return (
          <Pressable
            key={offer.item}
            accessibilityRole="button"
            accessibilityLabel={`Buy ${getItem(offer.item)?.name} for ${offer.price} coins`}
            accessibilityState={{ disabled: !affordable }}
            disabled={!affordable}
            onPress={() => act({ type: 'buy', item: offer.item })}
            style={({ pressed }) => [styles.pick, bevel('well', pressed), !affordable && { opacity: 0.5 }]}
          >
            <Slot art={itemArt(offer.item)} size={40} />
            <Text style={[styles.pickName, styles.grow]}>{getItem(offer.item)?.name}</Text>
            {owned || outclassed ? (
              <Text style={styles.ownedTag}>{owned ? 'owned' : 'have better'}</Text>
            ) : null}
            <Text style={[styles.price, !affordable && { color: color.danger }]}>{offer.price}</Text>
          </Pressable>
        );
      })}
      <Text style={styles.small}>sell anything from its item sheet while you are in town.</Text>
    </Panel>
  );
}

export default function BagScreen(): React.JSX.Element {
  const { game } = useGame();
  const screen = useScreenFocus();
  const [segment, setSegment] = useState<Segment>('items');
  const [open, setOpen] = useState<Open>(null);
  const options: Segment[] = ['items', 'gear', 'bank', ...(atStore(game) ? (['store'] as const) : [])];
  const current = options.includes(segment) ? segment : 'items';
  const coins = useTabStat('coins');
  return (
    <Screen rootRef={screen}>
      <PageTitle title="bag" stat={coins} />
      <Segments value={current} options={options} onChange={setSegment} />
      {current === 'items' ? <Inventory onOpen={setOpen} /> : null}
      {current === 'gear' ? <Gear onOpen={setOpen} /> : null}
      {current === 'bank' ? <Bank onOpen={setOpen} /> : null}
      {current === 'store' ? <BagUpgrade /> : null}
      {current === 'store' ? <Store /> : null}
      {open ? <ItemSheet itemKey={open.key} origin={open.origin} onClose={() => setOpen(null)} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: font.display, fontSize: 26, lineHeight: 32, color: color.gold, ...shadow },
  small: { fontFamily: font.label, fontSize: 10, lineHeight: 14, color: color.muted, ...shadow },
  label: { fontFamily: font.label, fontSize: 11, lineHeight: 15, color: color.gold, ...shadow },
  body: { fontFamily: font.body, fontSize: 14, lineHeight: 19, color: color.secondary },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: space.related },
  ownedTag: { fontFamily: font.label, fontSize: 10, lineHeight: 14, color: color.success, ...shadow },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.related },
  grow: { flex: 1, minWidth: 0 },
  doll: { gap: space.tight, alignItems: 'center' },
  dollRow: { flexDirection: 'row', gap: space.related },
  dollCell: { width: 64, alignItems: 'center', gap: 2 },
  dollGap: { width: 64 },
  slotName: { fontFamily: font.label, fontSize: 9, lineHeight: 12, color: color.muted, ...shadow },
  qualityDot: {
    position: 'absolute',
    right: 6,
    top: 48,
    width: 6,
    height: 6,
    borderWidth: 1,
    borderColor: color.ink,
  },
  tools: { flexDirection: 'row', justifyContent: 'space-between' },
  tool: { alignItems: 'center', gap: 2 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.tight },
  statCell: { width: '33.33%', gap: 1 },
  statValue: { fontFamily: font.labelBold, fontSize: 13, lineHeight: 17, color: color.text, ...shadow },
  skillRow: { flexDirection: 'row', gap: space.tight, alignItems: 'flex-start' },
  skillName: { width: 92, fontFamily: font.bold, fontSize: 13, lineHeight: 17, color: color.text, ...shadow },
  pick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.related,
    padding: space.micro,
    paddingRight: space.related,
  },
  pickName: { fontFamily: font.bold, fontSize: 15, lineHeight: 20, color: color.text, ...shadow },
  price: { fontFamily: font.labelBold, fontSize: 13, lineHeight: 18, color: color.gold, ...shadow },
});
