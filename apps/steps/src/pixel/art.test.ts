import assert from 'node:assert/strict';
import test from 'node:test';
import { ITEMS, SKINS } from '../game/content.ts';
import { ALL_ART, type Art, bruhArt, ghost, itemArt, SKILL_ART, SLOT_ART, UI_ART } from './art.ts';

function check(name: string, art: Art): void {
  assert.ok(art.w > 0 && art.h > 0, `${name} is empty`);
  for (const [y, row] of art.rows.entries()) {
    assert.equal(row.length, art.w, `${name} row ${y} is ${row.length} wide, expected ${art.w}`);
    for (const key of row)
      if (key !== '.') assert.ok(art.colors[key], `${name} row ${y} uses unknown colour ${key}`);
  }
}

test('every sprite grid is rectangular and fully coloured', () => {
  for (const [name, art] of Object.entries(ALL_ART)) check(name, art);
  for (const [name, art] of Object.entries(SKILL_ART)) check(name, art);
  for (const [name, art] of Object.entries(UI_ART)) check(name, art);
  for (const [name, art] of Object.entries(SLOT_ART)) {
    check(name, art);
    check(`${name} ghost`, ghost(art));
  }
  for (const item of ITEMS) check(item.id, itemArt(item.id));
  for (const skin of SKINS) {
    check(skin.id, bruhArt(skin.id));
    check(`${skin.id} asleep`, bruhArt(skin.id, true));
  }
});

test('every item has its own drawing or tint', () => {
  const coins = itemArt('coins');
  for (const item of ITEMS) assert.notEqual(itemArt(item.id), coins, `${item.id} fell back to coins`);
});
