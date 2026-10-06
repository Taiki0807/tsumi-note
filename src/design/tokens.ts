/**
 * Design Tokens.
 *
 * Source of truth: Figma「学習アプリ｜Blue & Charcoal」(file 2YR8QWeewgVF9tIM9yfLu7, node 190:32).
 * Light values are taken directly from Figma. Dark values are derived from the same
 * palette because Figma defines no dark theme (see docs/DESIGN.md §16).
 *
 * This file is plain data so that `tailwind.config.ts` can consume it as well.
 */

const palette = {
  white: '#ffffff',
  charcoal900: '#212121',
  charcoal700: '#616161',
  gray300: '#e0e0e0',
  gray200: '#eeeeee',
  gray100: '#f5f5f7',
  primary: '#6949ff',
  primary100: '#f0edff',
  primary200: '#d4ccff',
  primary300: '#a391ff',
  success: '#12d18e',
  successText: '#087a52',
  successBg: '#e6f9f2',
  danger: '#c62828',
  dangerAccent: '#f75555',
  dangerBg: '#ffeded',
  warning: '#ff9800',
  warningText: '#b45309',
  warningBg: '#fff4e5',
  info: '#1a96f0',
  infoText: '#0b6bb5',
  infoBg: '#e7f4fe',
  accentYellow: '#ffc107',
} as const;

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceMuted: string;
  textPrimary: string;
  textSecondary: string;
  textOnPrimary: string;
  border: string;
  divider: string;
  primary: string;
  primarySoft: string;
  primaryMuted: string;
  success: string;
  successText: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningText: string;
  warningSoft: string;
  info: string;
  infoText: string;
  infoSoft: string;
  accent: string;
};

export const lightColors: ThemeColors = {
  background: palette.white,
  surface: palette.white,
  surfaceMuted: palette.gray100,
  textPrimary: palette.charcoal900,
  textSecondary: palette.charcoal700,
  textOnPrimary: palette.white,
  border: palette.gray300,
  divider: palette.gray200,
  primary: palette.primary,
  primarySoft: palette.primary100,
  primaryMuted: palette.primary200,
  success: palette.success,
  successText: palette.successText,
  successSoft: palette.successBg,
  danger: palette.danger,
  dangerSoft: palette.dangerBg,
  warning: palette.warning,
  warningText: palette.warningText,
  warningSoft: palette.warningBg,
  info: palette.info,
  infoText: palette.infoText,
  infoSoft: palette.infoBg,
  accent: palette.accentYellow,
};

/** Derived from the Blue & Charcoal palette: charcoal surfaces, lighter primary. */
export const darkColors: ThemeColors = {
  ...lightColors,
  background: palette.charcoal900,
  surface: '#2b2b2b',
  surfaceMuted: '#333333',
  textPrimary: palette.white,
  textSecondary: palette.gray300,
  border: palette.charcoal700,
  divider: '#3a3a3a',
  primary: palette.primary300,
  primarySoft: '#2f2a4d',
  primaryMuted: palette.primary,
  dangerSoft: '#3d2323',
  successSoft: '#17332a',
  warningSoft: '#3a2f1c',
  infoSoft: '#1b3040',
};

export const themes = { light: lightColors, dark: darkColors } as const;
export type ThemeName = keyof typeof themes;

export const fontFamily = {
  /** Rounded Mplus 1c (Japanese UI text) */
  regular: 'MPLUSRounded1c_500Medium',
  bold: 'MPLUSRounded1c_700Bold',
  extraBold: 'MPLUSRounded1c_800ExtraBold',
  /** Nunito (numerals such as timer digits) */
  numeric: 'Nunito_800ExtraBold',
} as const;

/** fontSize / lineHeight pairs used in Figma. */
export const typography = {
  tabLabel: { fontSize: 10, lineHeight: 16 },
  caption: { fontSize: 12, lineHeight: 16 },
  label: { fontSize: 13, lineHeight: 16 },
  bodySm: { fontSize: 14, lineHeight: 22 },
  body: { fontSize: 15, lineHeight: 24 },
  button: { fontSize: 16, lineHeight: 24 },
  headingSm: { fontSize: 18, lineHeight: 26 },
  heading: { fontSize: 22, lineHeight: 28 },
  title: { fontSize: 26, lineHeight: 34 },
  display: { fontSize: 32, lineHeight: 40 },
  timer: { fontSize: 56, lineHeight: 60 },
} as const;

export const spacing = {
  0: 0,
  0.5: 2,
  1: 4,
  1.5: 6,
  2: 8,
  3: 12,
  3.5: 14,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
} as const;

export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  '2xl': 28,
  full: 100,
} as const;

export const shadow = {
  /** Primary button / center timer tab: 0 4 8 #6949ff @ 25% */
  primary: {
    shadowColor: palette.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  /** Card: 0 4 40 #04060f @ 6% */
  card: {
    shadowColor: '#04060f',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 40,
    elevation: 2,
  },
} as const;

export const iconSize = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 28,
} as const;

/** Layout constants taken from the Figma TabBar component. */
export const layout = {
  /** Figma TabBar › Background (390x76). Includes the area below the tab items. */
  tabBarHeight: 76,
  /** Tab items area: 2 (offset below divider) + 48 (Tab frame height). */
  tabContentHeight: 50,
  tabItemOffset: 2,
  tabItemPaddingTop: 6,
  tabItemGap: 2,
  timerButtonSize: 56,
  /** Stroke is drawn OUTSIDE the 56pt fill in Figma (visual diameter 64). */
  timerButtonBorder: 4,
  /** Distance the 56pt button rises above the top edge of the bar. */
  timerButtonProtrusion: 24,
  /** Content max width on iPad (Figma frames are 390pt wide). */
  contentMaxWidth: 640,
} as const;
