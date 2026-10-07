import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/form-ui';
import { fontFamily, radius, typography, useTheme } from '@/design';

import { SettingsScaffold } from './settings-ui';
import { useDataExport } from './use-settings';

function Row({ title, note }: { title: string; note: string }) {
  const colors = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
      }}
    >
      <Text style={{ fontFamily: fontFamily.extraBold, ...typography.body, color: colors.textPrimary }}>
        {title}
      </Text>
      <Text style={{ fontFamily: fontFamily.bold, ...typography.label, color: colors.textSecondary }}>
        {note}
      </Text>
    </View>
  );
}

/** PRODUCT_SPEC §17 Privacy / Data: データ書き出し, Privacy Policy, Terms of Service. */
export function PrivacyScreen() {
  const colors = useTheme();
  const exportData = useDataExport();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onExport = async () => {
    setBusy(true);
    setError(null);
    try {
      await exportData();
    } catch {
      setError('データを書き出せませんでした');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsScaffold title="プライバシーとデータ">
      <View
        style={{
          gap: 14,
          padding: 20,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.divider,
          backgroundColor: colors.surface,
        }}
      >
        <Text
          style={{
            fontFamily: fontFamily.extraBold,
            fontSize: 17,
            lineHeight: 26,
            color: colors.textPrimary,
          }}
        >
          データを書き出す
        </Text>
        <Text
          style={{
            fontFamily: fontFamily.regular,
            ...typography.caption,
            lineHeight: 18,
            color: colors.textSecondary,
          }}
        >
          フォルダー・ノート・問題・復習履歴・学習記録・目標・設定をJSONファイルで書き出します。ノートの画像ファイルは含まれません。
        </Text>
        {error ? (
          <Text
            accessibilityRole="alert"
            style={{ fontFamily: fontFamily.bold, ...typography.caption, color: colors.danger }}
          >
            {error}
          </Text>
        ) : null}
        <Button
          label={busy ? '書き出し中…' : 'データを書き出す'}
          onPress={() => void onExport()}
          disabled={busy}
        />
      </View>
      <View
        style={{
          paddingHorizontal: 20,
          paddingVertical: 4,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.divider,
          backgroundColor: colors.surface,
        }}
      >
        <Row title="プライバシーポリシー" note="公開準備中" />
        <Row title="利用規約" note="公開準備中" />
      </View>
    </SettingsScaffold>
  );
}
