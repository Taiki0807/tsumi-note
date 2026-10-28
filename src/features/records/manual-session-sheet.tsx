import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { BottomSheet, Button, TextField } from '@/components/form-ui';
import { fontFamily, radius, typography, useTheme } from '@/design';

import { buildManualSession, formatClock, recentDays, type ManualSessionResult } from './manual-session';
import { WEEKDAY_LABELS } from './records-logic';

type Props = {
  visible: boolean;
  folders: { id: string; name: string }[];
  /** Local 00:00 of today. */
  today: number;
  /** Defaults the folder chip (the active filter of the records screen). */
  defaultFolderId?: string;
  onSubmit: (input: {
    dayStart: number;
    start: string;
    end: string;
    folderId: string | null;
  }) => ManualSessionResult;
  onClose: () => void;
};

function dayLabel(dayStart: number, today: number): string {
  if (dayStart === today) return '今日';
  const d = new Date(dayStart);
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAY_LABELS[(d.getDay() + 6) % 7]}）`;
}

/** 学習記録をフォームから登録する (v1.1.0): タイマーを使わず、日付・開始/終了時刻・フォルダーを入力する。 */
export function ManualSessionSheet({ visible, ...rest }: Props) {
  return (
    <BottomSheet visible={visible} onClose={rest.onClose}>
      {visible && <ManualSessionForm {...rest} />}
    </BottomSheet>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const colors = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        height: 36,
        paddingHorizontal: 16,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.full,
        backgroundColor: selected ? colors.primary : colors.primarySoft,
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          fontFamily: fontFamily.extraBold,
          fontSize: typography.bodySm.fontSize,
          lineHeight: typography.bodySm.lineHeight,
          color: selected ? colors.textOnPrimary : colors.primary,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ManualSessionForm({ folders, today, defaultFolderId, onSubmit, onClose }: Omit<Props, 'visible'>) {
  const colors = useTheme();
  const days = recentDays(today);
  const [dayStart, setDayStart] = useState(today);
  const [folderId, setFolderId] = useState<string | null>(defaultFolderId ?? null);
  const [start, setStart] = useState('');
  // The form is remounted per open, so "now" is the moment the sheet was opened (used for the preview only;
  // the hook validates again against the real clock on submit).
  const [openedAt] = useState(() => Date.now());
  const [end, setEnd] = useState(() => formatClock(openedAt));
  const [error, setError] = useState<string | null>(null);

  const preview = buildManualSession({ dayStart, start, end }, openedAt);

  const submit = () => {
    const result = onSubmit({ dayStart, start, end, folderId });
    if (result.ok) onClose();
    else setError(result.error);
  };

  const label = {
    fontFamily: fontFamily.extraBold,
    ...typography.bodySm,
    color: colors.textPrimary,
  } as const;

  return (
    <>
      <Text
        accessibilityRole="header"
        style={{
          fontFamily: fontFamily.extraBold,
          ...typography.heading,
          lineHeight: 32,
          color: colors.textPrimary,
        }}
      >
        学習を記録
      </Text>
      <View style={{ gap: 8 }}>
        <Text style={label}>日付</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {days.map((d) => (
            <Chip
              key={d}
              label={dayLabel(d, today)}
              selected={d === dayStart}
              onPress={() => {
                setDayStart(d);
                setError(null);
              }}
            />
          ))}
        </ScrollView>
      </View>
      <View style={{ gap: 8 }}>
        <Text style={label}>フォルダー</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {[{ id: null as string | null, name: '未分類' }, ...folders].map((f) => (
            <Chip
              key={f.id ?? 'none'}
              label={f.name}
              selected={f.id === folderId}
              onPress={() => setFolderId(f.id)}
            />
          ))}
        </ScrollView>
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <TextField
            label="開始時刻"
            placeholder="09:00"
            value={start}
            onChangeText={(v) => {
              setStart(v);
              setError(null);
            }}
            keyboardType="numbers-and-punctuation"
            maxLength={5}
          />
        </View>
        <View style={{ flex: 1 }}>
          <TextField
            label="終了時刻"
            placeholder="10:00"
            value={end}
            onChangeText={(v) => {
              setEnd(v);
              setError(null);
            }}
            keyboardType="numbers-and-punctuation"
            maxLength={5}
          />
        </View>
      </View>
      {preview.ok && (
        <Text style={{ fontFamily: fontFamily.bold, ...typography.label, color: colors.textSecondary }}>
          {`学習時間 ${Math.floor(preview.durationSeconds / 60)}分`}
        </Text>
      )}
      {error && (
        <Text
          accessibilityRole="alert"
          style={{ fontFamily: fontFamily.bold, ...typography.caption, color: colors.danger }}
        >
          {error}
        </Text>
      )}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Button label="キャンセル" variant="secondary" onPress={onClose} flex />
        <Button label="記録する" onPress={submit} disabled={!preview.ok} flex />
      </View>
    </>
  );
}
