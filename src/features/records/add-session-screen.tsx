import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { BottomSheet, Button } from '@/components/form-ui';
import { Icon } from '@/components/icons';
import { fontFamily, typography, useTheme } from '@/design';
import { FolderPickerSheet } from '@/features/timer/folder-picker-sheet';
import { SettingsScaffold } from '@/features/settings/settings-ui';

import { useFolderColors } from './folder-colors';
import { buildManualSession, formatClock, formatFullDate, formatMinutes, recentDays } from './manual-session';
import { startOfLocalDay } from './records-logic';
import { useAddSession } from './use-day-record';

/** Figma 02c の入力欄: 52pt, 1.5pt border, radius 16, white fill. */
function FieldBox({
  children,
  onPress,
  label,
}: {
  children: ReactNode;
  onPress?: () => void;
  label: string;
}) {
  const colors = useTheme();
  const style = {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 16,
    paddingRight: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.surface,
  } as const;
  return onPress ? (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={style}>
      {children}
    </Pressable>
  ) : (
    <View style={style}>{children}</View>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  const colors = useTheme();
  return (
    <View style={{ flex: 1, gap: 8 }}>
      <Text style={{ fontFamily: fontFamily.extraBold, ...typography.label, color: colors.textPrimary }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

function TimeInput({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  const colors = useTheme();
  return (
    <Field label={label}>
      <FieldBox label={label}>
        <Icon name="clock" size={18} color={colors.primary} strokeWidth={2} />
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.textPlaceholder}
          keyboardType="numbers-and-punctuation"
          maxLength={5}
          style={{
            flex: 1,
            padding: 0,
            fontFamily: fontFamily.extraBold,
            fontSize: 18,
            lineHeight: 27,
            color: colors.textPrimary,
          }}
        />
      </FieldBox>
    </Field>
  );
}

function ValueText({ children }: { children: string }) {
  const colors = useTheme();
  return (
    <Text
      numberOfLines={1}
      style={{
        flex: 1,
        fontFamily: fontFamily.extraBold,
        fontSize: 16,
        lineHeight: 24,
        color: colors.textPrimary,
      }}
    >
      {children}
    </Text>
  );
}

/**
 * Figma 02c 記録を追加（手入力）: folder, date, start / end, the resulting 学習時間 and 記録する.
 * The date picker and the memo field are not in the data model, so the date is chosen from the last
 * 7 days (sheet) and there is no memo.
 */
export function AddSessionScreen() {
  const colors = useTheme();
  const params = useLocalSearchParams<{ day?: string; folderId?: string }>();
  const { folders, add } = useAddSession();
  const colorFor = useFolderColors(folders);
  // The screen mounts per visit, so "now" is when it was opened (preview only; submit validates again).
  const [openedAt] = useState(() => Date.now());
  const today = startOfLocalDay(openedAt);
  const days = recentDays(today);
  const requested = Number(params.day);
  const initialDay = startOfLocalDay(Number.isFinite(requested) && requested > 0 ? requested : today);

  const [dayStart, setDayStart] = useState(initialDay);
  const [folderId, setFolderId] = useState<string | null>(
    params.folderId && folders.some((f) => f.id === params.folderId) ? params.folderId : null,
  );
  const [start, setStart] = useState('');
  const [end, setEnd] = useState(() => formatClock(openedAt));
  const [error, setError] = useState<string | null>(null);
  const [pickingFolder, setPickingFolder] = useState(false);
  const [pickingDay, setPickingDay] = useState(false);

  // A past day outside the last 7 stays selectable when we were sent here from its daily screen.
  const dayOptions = days.includes(dayStart) ? days : [dayStart, ...days];
  const preview = buildManualSession({ dayStart, start, end }, openedAt);
  const folderName = folders.find((f) => f.id === folderId)?.name ?? '未分類';

  const submit = () => {
    const result = add({ dayStart, start, end, folderId });
    if (result.ok) router.back();
    else setError(result.error);
  };

  return (
    <SettingsScaffold title="記録を追加" closeIcon gap={20}>
      <Text
        style={{
          fontFamily: fontFamily.bold,
          ...typography.label,
          lineHeight: 20,
          color: colors.textSecondary,
        }}
      >
        タイマーを使わなかった学習も、あとから記録できます。
      </Text>
      <View style={{ flexDirection: 'row' }}>
        <Field label="フォルダー">
          <FieldBox label="フォルダーを選択" onPress={() => setPickingFolder(true)}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colorFor(folderId) }} />
            <ValueText>{folderName}</ValueText>
            <Icon name="chevron-down" size={18} color={colors.textSecondary} strokeWidth={2.2} />
          </FieldBox>
        </Field>
      </View>
      <View style={{ flexDirection: 'row' }}>
        <Field label="日付">
          <FieldBox label="日付を選択" onPress={() => setPickingDay(true)}>
            <Icon name="calendar" size={20} color={colors.primary} strokeWidth={2} />
            <ValueText>{formatFullDate(dayStart)}</ValueText>
          </FieldBox>
        </Field>
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <TimeInput
          label="開始"
          value={start}
          placeholder="09:00"
          onChange={(v) => {
            setStart(v);
            setError(null);
          }}
        />
        <TimeInput
          label="終了"
          value={end}
          placeholder="10:00"
          onChange={(v) => {
            setEnd(v);
            setError(null);
          }}
        />
      </View>
      <View
        accessibilityLabel={preview.ok ? `学習時間 ${formatMinutes(preview.durationSeconds)}` : '学習時間'}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderRadius: 16,
          backgroundColor: colors.primarySoft,
        }}
      >
        <Text style={{ fontFamily: fontFamily.bold, ...typography.label, color: colors.primary }}>
          学習時間
        </Text>
        <Text
          style={{ fontFamily: fontFamily.extraBold, fontSize: 20, lineHeight: 30, color: colors.primary }}
        >
          {preview.ok ? formatMinutes(preview.durationSeconds) : '—'}
        </Text>
      </View>
      {error && (
        <Text
          accessibilityRole="alert"
          style={{ fontFamily: fontFamily.bold, ...typography.caption, color: colors.danger }}
        >
          {error}
        </Text>
      )}
      <Button label="記録する" onPress={submit} disabled={!preview.ok} />

      <FolderPickerSheet
        visible={pickingFolder}
        title="フォルダーを選択"
        subtitle={null}
        folders={folders}
        selectedId={folderId}
        onSelect={setFolderId}
        onClose={() => setPickingFolder(false)}
      />
      <BottomSheet visible={pickingDay} onClose={() => setPickingDay(false)} gap={12}>
        <Text
          accessibilityRole="header"
          style={{
            fontFamily: fontFamily.extraBold,
            ...typography.heading,
            lineHeight: 33,
            color: colors.textPrimary,
          }}
        >
          日付を選択
        </Text>
        <View>
          {dayOptions.map((d, i) => {
            const selected = d === dayStart;
            return (
              <Pressable
                key={d}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => {
                  setDayStart(d);
                  setError(null);
                  setPickingDay(false);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 14,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: colors.divider,
                }}
              >
                <Icon name="calendar" size={20} color={selected ? colors.primary : colors.textSecondary} />
                <Text
                  style={{
                    flex: 1,
                    fontFamily: fontFamily.extraBold,
                    fontSize: 16,
                    lineHeight: 24,
                    color: selected ? colors.primary : colors.textPrimary,
                  }}
                >
                  {d === today ? `今日 · ${formatFullDate(d)}` : formatFullDate(d)}
                </Text>
                {selected && <Icon name="check" size={18} color={colors.primary} strokeWidth={2.4} />}
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>
    </SettingsScaffold>
  );
}
