import assert from 'node:assert/strict';
import test from 'node:test';
import { ITEMS } from './content.ts';
import { itemCount, pluralName } from './items.ts';

test('item counts read as English for every item', () => {
  assert.equal(itemCount(1, 'raw-minnow'), '1 raw minnow');
  assert.equal(itemCount(98, 'raw-minnow'), '98 raw minnows');
  assert.equal(itemCount(1_200, 'coal'), '1,200 coal');
  assert.equal(itemCount(3, 'pandan-logs'), '3 pandan logs');
  const expected: Readonly<Record<string, string>> = {
    ruby: 'rubies',
    trout: 'trout',
    'iron ore': 'iron ore',
    'bronze pickaxe': 'bronze pickaxes',
    'message in a bottle': 'messages in a bottle',
    'adventurer’s chest': 'adventurer’s chests',
    'seven-league boots': 'seven-league boots',
    lychee: 'lychees',
  };
  for (const [name, plural] of Object.entries(expected)) assert.equal(pluralName(name), plural);
  // Guards the rule for new items: no "bootss", "axeses" or "rubys".
  for (const item of ITEMS) assert.doesNotMatch(pluralName(item.name), /(ss|eses|[^aeiou]ys)$/, item.name);
});
