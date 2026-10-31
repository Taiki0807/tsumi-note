import { fireEvent, render, screen } from '@testing-library/react-native';

import { ApiKeysScreen } from './api-keys-screen';

const mockOpenLegalUrl = jest.fn();

// reanimated / router を使う実UI部品は、ネイティブ無しの jest では読み込めないため単純な代替に置き換える
jest.mock('@/components/form-ui', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pressable, Text, View } = require('react-native');
  return {
    BottomSheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? <View>{children}</View> : null,
    Button: ({ label, onPress }: { label: string; onPress: () => void }) => (
      <Pressable accessibilityRole="button" onPress={onPress}>
        <Text>{label}</Text>
      </Pressable>
    ),
    ConfirmDeleteSheet: () => null,
    IconButton: () => null,
    TextField: () => null,
  };
});
jest.mock('@/features/settings/settings-ui', () => ({
  SettingsScaffold: ({ children }: { children: React.ReactNode }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { View } = require('react-native');
    return <View>{children}</View>;
  },
}));
jest.mock('@/features/settings/legal-links', () => ({
  API_DOCS_URL: 'https://tsumi-note.hosokawa-lab.dev/api',
  openLegalUrl: (url: string) => mockOpenLegalUrl(url),
}));
jest.mock('./use-api-keys', () => ({
  useApiKeys: () => ({
    available: false,
    state: { status: 'loading' },
    refresh: jest.fn(),
    issue: jest.fn(),
    revoke: jest.fn(),
  }),
}));

describe('ApiKeysScreen', () => {
  beforeEach(() => mockOpenLegalUrl.mockClear());

  it('「APIドキュメントを見る」をタップすると API_DOCS_URL を開く', async () => {
    await render(<ApiKeysScreen />);
    await fireEvent.press(screen.getByRole('link', { name: 'APIドキュメントを見る' }));
    expect(mockOpenLegalUrl).toHaveBeenCalledWith('https://tsumi-note.hosokawa-lab.dev/api');
  });

  it('使い方のサンプルに folderName が含まれる', async () => {
    await render(<ApiKeysScreen />);
    expect(screen.getByText('  "folderName": "英語",')).toBeTruthy();
  });
});
