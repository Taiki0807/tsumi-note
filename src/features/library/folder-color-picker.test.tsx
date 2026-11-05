import { render, screen } from '@testing-library/react-native';

import { FolderColorPicker, HOLE, PLUS_SIZE, PLUS_STROKE, RAINBOW_STOPS, rainbowColorAt } from './folder-color-picker';

jest.mock('@expo/ui/swift-ui', () => {
  const { View } = jest.requireActual('react-native');
  return { Host: View, ColorPicker: View };
});

jest.mock('react-native', () => {
  const rn = jest.requireActual('react-native');
  rn.Platform.OS = 'ios';
  return rn;
});

describe('FolderColorPicker 「その他の色」', () => {
  it('uses the Figma 197:515 gradient stops and hole size', () => {
    expect(RAINBOW_STOPS.map((s) => [s.position, s.color])).toEqual([
      [0, '#FF4D4D'],
      [0.2, '#FFC400'],
      [0.4, '#3DDC84'],
      [0.6, '#1A96F0'],
      [0.8, '#B44DFF'],
      [1, '#FF4D4D'],
    ]);
    expect(HOLE).toBe(26);
    expect(rainbowColorAt(0.2)).toBe('#ffc400');
    expect(rainbowColorAt(0)).toBe(rainbowColorAt(1));
  });

  it('unselected: shows the rainbow circle, not selected', async () => {
    await render(<FolderColorPicker value="primary" onChange={() => undefined} />);
    expect(screen.getByTestId('rainbow-circle')).toBeTruthy();
    expect(screen.getByTestId('rainbow-plus')).toBeTruthy();
    expect([PLUS_SIZE, PLUS_STROKE]).toEqual([16, 1.6]);
    const cell = screen.getByRole('radio', { name: 'その他の色（カスタム）' });
    expect(cell.props.accessibilityState).toEqual({ selected: false });
    expect(cell.props.accessibilityHint).toBe('タップするとカラーピッカーが開きます');
  });

  it('selected (custom color): no rainbow, selected state', async () => {
    await render(<FolderColorPicker value="#112233" onChange={() => undefined} />);
    expect(screen.queryByTestId('rainbow-circle')).toBeNull();
    expect(screen.queryByTestId('rainbow-plus')).toBeNull();
    const cell = screen.getByRole('radio', { name: 'その他の色（カスタム）' });
    expect(cell.props.accessibilityState).toEqual({ selected: true });
  });
});
