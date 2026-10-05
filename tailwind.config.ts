import type { Config } from 'tailwindcss';
// @ts-expect-error nativewind ships an empty type declaration for its preset
import nativewindPreset from 'nativewind/preset';

import { fontFamily, lightColors, radius, spacing, typography } from './src/design/tokens';

type FontSizeEntry = [string, { lineHeight: string }];

// Colors here are the light theme. Theme-aware colors are resolved at runtime via `useTheme()`.
const fontSize = Object.fromEntries(
  Object.entries(typography).map(([key, { fontSize: size, lineHeight }]): [string, FontSizeEntry] => [
    key,
    [`${size}px`, { lineHeight: `${lineHeight}px` }],
  ]),
);

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [nativewindPreset],
  theme: {
    extend: {
      colors: lightColors,
      fontFamily: {
        regular: [fontFamily.regular],
        bold: [fontFamily.bold],
        extrabold: [fontFamily.extraBold],
        numeric: [fontFamily.numeric],
      },
      fontSize,
      spacing: Object.fromEntries(Object.entries(spacing).map(([k, v]) => [k, `${v}px`])),
      borderRadius: Object.fromEntries(Object.entries(radius).map(([k, v]) => [k, `${v}px`])),
    },
  },
  plugins: [],
};

export default config;
