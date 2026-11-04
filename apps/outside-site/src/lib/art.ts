// Build-time lookups for game art that fail instead of falling back. The game's own helpers
// draw coins for an unknown item and leave skill art optional; on a static page a silent
// substitute would ship the wrong picture with nobody noticing.
import { getItem, type SkillId } from '@steps/src/game/content.ts';
import { type Art, itemArt, SKILL_ART } from '@steps/src/pixel/art.ts';

export function itemSprite(id: string): Art {
  if (!getItem(id)) throw new Error(`No item "${id}" in the game content; the page would draw coins instead.`);
  return itemArt(id);
}

export function skillSprite(skill: SkillId): Art {
  const art = SKILL_ART[skill];
  if (!art) throw new Error(`Skill "${skill}" has no art in SKILL_ART.`);
  return art;
}
