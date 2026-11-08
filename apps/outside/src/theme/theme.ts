import { Easing, Platform, StyleSheet } from 'react-native';
import { palette } from './palette';

// Pixel MMO chrome built from the bruhs fruit palette: longan browns for stone-and-wood
// panels, durian gold for headings, pandan green for XP, persimmon for actions.
export const color = {
  canvas: palette['longan-950'],
  panel: palette['longan-800'],
  raised: palette['longan-700'],
  well: palette['longan-900'],
  text: palette['rambutan-100'],
  secondary: palette['rambutan-300'],
  muted: palette['rambutan-500'],
  faint: palette['longan-500'],
  primary: palette['persimmon-400'],
  primaryFill: palette['persimmon-500'],
  gold: palette['durian-400'],
  success: palette['pandan-300'],
  xp: palette['pandan-400'],
  danger: palette['lychee-400'],
  info: palette['blueberry-300'],
  ink: '#0a0a0a',
  bevelLight: palette['longan-600'],
  bevelDark: palette['longan-950'],
  border: '#0a0a0a',
  strongBorder: '#0a0a0a',
} as const;

function fontFamily(name: string): string {
  return Platform.OS === 'web' ? `${name}, monospace` : name;
}

export const font = {
  body: fontFamily('PixelifySans-Regular'),
  bold: fontFamily('PixelifySans-Bold'),
  label: fontFamily('Silkscreen-Regular'),
  labelBold: fontFamily('Silkscreen-Bold'),
  display: fontFamily('PixelifySans-Bold'),
} as const;

// Pixel art has no rounded corners. Fruit names stay so shared components keep compiling.
export const radius = { seed: 0, grape: 0, lychee: 0, mango: 0, pomelo: 0, orb: 0 } as const;

export const space = {
  micro: 4,
  tight: 8,
  related: 12,
  group: 16,
  page: 16,
  section: 20,
  chapter: 32,
} as const;
export const layout = { touch: 48, button: 52, navigation: 68, border: 2 } as const;
// UI motion stays under 300 ms. Things that appear start fast and settle (ease-out), so a tap
// answers at once; nothing in the UI eases in. Ambient loops, like the scene's sprite frames,
// keep their own pace.
export const motion = { fast: 120, standard: 200 } as const;
export const easeOut = Easing.bezier(0.2, 0, 0, 1);

// One-pixel drop shadow, the classic MMO text treatment.
export const shadow = {
  textShadowColor: '#0a0a0a',
  textShadowOffset: { width: 1, height: 1 },
  textShadowRadius: 0,
} as const;

export const typography = StyleSheet.create({
  body: { fontFamily: font.body, fontSize: 16, lineHeight: 22, color: color.secondary },
  small: { fontFamily: font.body, fontSize: 14, lineHeight: 19, color: color.muted },
  label: { fontFamily: font.label, fontSize: 11, lineHeight: 16, color: color.muted },
  title: { fontFamily: font.display, fontSize: 26, lineHeight: 32, color: color.gold, ...shadow },
  heading: { fontFamily: font.display, fontSize: 19, lineHeight: 25, color: color.gold, ...shadow },
  number: { fontFamily: font.labelBold, color: color.text, fontVariant: ['tabular-nums'], ...shadow },
});
