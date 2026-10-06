import { useColorScheme } from 'react-native';

import { themes, type ThemeColors, type ThemeName } from './tokens';

export function useThemeName(): ThemeName {
  return useColorScheme() === 'dark' ? 'dark' : 'light';
}

/** Theme-aware color tokens (Light / Dark follow the system setting for now). */
export function useTheme(): ThemeColors {
  return themes[useThemeName()];
}
