import type { SkinId } from '../game/content';
import { bruhArt } from '../pixel/art';
import { Sprite } from '../pixel/Sprite';

export function Bruh({
  skin = 'original',
  size = 100,
  asleep = false,
  flip = false,
}: Readonly<{ skin?: SkinId; size?: number | '100%'; asleep?: boolean; flip?: boolean }>): React.JSX.Element {
  // Keep whole-pixel scaling so the 16×16 sprite stays crisp.
  const pixels = typeof size === 'number' ? Math.max(16, Math.round(size / 16) * 16) : 128;
  return <Sprite art={bruhArt(skin, asleep)} size={pixels} flip={flip} />;
}
