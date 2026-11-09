import assert from 'node:assert/strict';
import test from 'node:test';
import { LOCATIONS } from '../game/content.ts';
import { itemArt } from './art.ts';
import { SCENE_HEIGHT, SCENE_WIDTH, sceneShapes, toolScale } from './scene.ts';

const still = { skin: 'original', night: false, frame: 0, working: false, walking: false } as const;

test('every place draws a scene inside the frame, with the bruh standing at the centre', () => {
  for (const place of LOCATIONS)
    for (const night of [false, true]) {
      const shapes = sceneShapes({ ...still, night, biome: place.biome });
      assert.ok(shapes.length > 0, place.id);
      for (const shape of shapes) assert.match(shape.d, /^M[-\d.]+ [-\d.]+/, place.id);
    }
  const town = sceneShapes({ ...still, biome: 'town' });
  // 16-px bruh on the ground line (36), centred in the 96-px frame.
  assert.ok(town.some((shape) => shape.transform === 'translate(40 24)'));
  assert.equal(SCENE_WIDTH, SCENE_HEIGHT * 2);
});

test('a working bruh holds its tool, drawn smaller than the bruh; an idle one does not', () => {
  const idle = sceneShapes({ ...still, biome: 'forest', tool: 'bronze-axe' });
  const working = sceneShapes({ ...still, biome: 'forest', tool: 'bronze-axe', working: true });
  assert.ok(working.length > idle.length);
  const axe = itemArt('bronze-axe');
  const scale = toolScale(axe);
  // Whatever the tool's canvas, it is drawn 10 scene pixels across, under the bruh's 16.
  assert.ok(Math.abs(Math.max(axe.w, axe.h) * scale - 10) < 0.05);
  assert.ok(working.some((shape) => shape.transform === `translate(52 23) scale(${scale} ${scale})`));
  // On the swing frame it is raised and mirrored.
  const swing = sceneShapes({ ...still, biome: 'forest', tool: 'bronze-axe', working: true, frame: 1 });
  assert.ok(
    swing.some(
      (shape) => shape.transform === `translate(${52 + axe.w * scale} 21) scale(${-scale} ${scale})`,
    ),
  );
});

test('a wider canvas keeps the biome centred and the default frame unchanged', () => {
  const town = sceneShapes({ ...still, biome: 'town' });
  assert.deepEqual(sceneShapes({ ...still, biome: 'town', width: SCENE_WIDTH }), town);
  const wide = sceneShapes({ ...still, biome: 'town', width: SCENE_WIDTH * 2 });
  // Shifted right by half the extra width: 48 + 40.
  assert.ok(wide.some((shape) => shape.transform === 'translate(88 24)'));
  assert.ok(wide[0]?.d.includes(`h${SCENE_WIDTH * 2}`));
});

test('the grove keeps its night sky by day, and only the bruh moves between hop frames', () => {
  const grove = sceneShapes({ ...still, biome: 'grove' });
  assert.deepEqual(grove.slice(0, 4), sceneShapes({ ...still, biome: 'grove', night: true }).slice(0, 4));
  // The landing page hero splits the scene at the first shape whose transform changes.
  const hop = (frame: number) =>
    sceneShapes({ ...still, biome: 'town', working: true, frame, width: SCENE_WIDTH * 2 });
  const [first, second] = [hop(0), hop(1)];
  const split = first.findIndex((shape, index) => shape.transform !== second[index]?.transform);
  assert.ok(split > 0);
  assert.ok(first[split]?.transform?.startsWith('translate(88 '));
});
