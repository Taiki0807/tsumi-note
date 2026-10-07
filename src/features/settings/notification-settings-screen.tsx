import { useState } from 'react';
import { Linking, Switch, Text, View } from 'react-native';

import { Button, TextField } from '@/components/form-ui';
import { fontFamily, radius, typography, useTheme } from '@/design';
import { formatReminderTime, parseReminderTime } from '@/domain/app-settings';

import { SettingsScaffold } from './settings-ui';
import { useReminderSettings } from './use-settings';

/** PRODUCT_SPEC §17 通知: 毎日の学習リマインダー + 通知時刻. Not designed in Figma → existing components. */
export function NotificationSettingsScreen() {
  const colors = useTheme();
  const { reminder, update } = useReminderSettings();
  const [timeText, setTimeText] = useState(formatReminderTime(reminder));
  const [message, setMessage] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);

  const parsedTime = parseReminderTime(timeText);

  const apply = async (next: typeof reminder) => {
    setBusy(true);
    setMessage(null);
    const result = await update(next);
    setBusy(false);
    setDenied(!result.ok && result.reason === 'permission-denied');
    if (!result.ok) {
      setMessage(
        result.reason === 'permission-denied'
          ? '通知が許可されていません。端末の設定で通知を許可してください。'
          : 'リマインダーを設定できませんでした。',
      );
    }
  };

  return (
    <SettingsScaffold title="通知">
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontFamily: fontFamily.extraBold,
                fontSize: 17,
                lineHeight: 26,
                color: colors.textPrimary,
              }}
            >
              毎日の学習リマインダー
            </Text>
            <Text
              style={{ fontFamily: fontFamily.regular, ...typography.caption, color: colors.textSecondary }}
            >
              決めた時刻に、学習の時間をお知らせします
            </Text>
          </View>
          <Switch
            accessibilityLabel="毎日の学習リマインダー"
            value={reminder.enabled}
            disabled={busy || (reminder.enabled === false && !parsedTime)}
            onValueChange={(enabled) => void apply({ ...reminder, ...(parsedTime ?? {}), enabled })}
            trackColor={{ true: colors.primary, false: colors.border }}
          />
        </View>
        <TextField
          label="通知時刻（24時間表記）"
          value={timeText}
          onChangeText={setTimeText}
          placeholder="21:00"
          keyboardType="numbers-and-punctuation"
          maxLength={5}
        />
        {!parsedTime ? (
          <Text
            accessibilityRole="alert"
            style={{ fontFamily: fontFamily.bold, ...typography.caption, color: colors.danger }}
          >
            00:00〜23:59 の形式で入力してください
          </Text>
        ) : null}
        <Button
          label="時刻を保存"
          variant="secondary"
          disabled={busy || !parsedTime || formatReminderTime(parsedTime) === formatReminderTime(reminder)}
          onPress={() => parsedTime && void apply({ ...reminder, ...parsedTime })}
        />
        {message ? (
          <Text
            accessibilityRole="alert"
            style={{ fontFamily: fontFamily.bold, ...typography.caption, color: colors.danger }}
          >
            {message}
          </Text>
        ) : null}
        {denied ? (
          <Button label="端末の設定を開く" variant="secondary" onPress={() => void Linking.openSettings()} />
        ) : null}
        <Text
          style={{
            fontFamily: fontFamily.regular,
            ...typography.caption,
            lineHeight: 18,
            color: colors.textSecondary,
          }}
        >
          タイマーの終了通知とは別に管理されます。リマインダーを変更してもタイマーの通知には影響しません。
        </Text>
      </View>
    </SettingsScaffold>
  );
}
