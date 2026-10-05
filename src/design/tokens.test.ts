import { darkColors, layout, lightColors, themes } from './tokens';

describe('design tokens', () => {
  it('defines the same keys for light and dark themes', () => {
    expect(Object.keys(darkColors).sort()).toEqual(Object.keys(lightColors).sort());
    expect(Object.keys(themes)).toEqual(['light', 'dark']);
  });

  it('uses the Figma primary and charcoal colors for the light theme', () => {
    expect(lightColors.primary).toBe('#6949ff');
    expect(lightColors.textPrimary).toBe('#212121');
    expect(lightColors.textSecondary).toBe('#616161');
  });

  it('keeps the center timer button larger than the tab bar icons', () => {
    expect(layout.timerButtonSize).toBe(56);
  });
});
