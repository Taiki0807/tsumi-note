import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/form-ui';
import { fontFamily, typography, useTheme } from '@/design';
import { SettingsScaffold } from '@/features/settings/settings-ui';

import { useFolderColors } from './folder-colors';
import { formatClock, formatMinutes, formatMonthDay, formatSessionRange } from './manual-session';
import { startOfLocalDay } from './records-logic';
import { useDayRecord } from './use-day-record';

const CARD = 24;

/** Figma 02b 日別の記録（時刻）: the day's total, its split by folder and every session with start / end. */
export function DayRecordScreen() {
  const colors = useTheme();
  const params = useLocalSearchParams<{ day?: string }>();
  const parsed = Number(params.day);
  const [fallbackDay] = useState(() => startOfLocalDay(Date.now()));
  const dayStart = Number.isFinite(parsed) && parsed > 0 ? startOfLocalDay(parsed) : fallbackDay;
  const view = useDayRecord(dayStart);
  const folders = view?.folders ?? [];
  const colorFor = useFolderColors(folders);
  const nameOf = (folderId: string | null) =>
    folderId === null ? '未分類' : (folders.find((f) => f.id === folderId)?.name ?? '未分類');

  const card = {
    borderRadius: CARD,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surface,
  } as const;

  return (
    <SettingsScaffold title={`${formatMonthDay(dayStart)}の記録`} gap={16}>
      {view && view.sessions.length > 0 && (
        <View style={{ ...card, gap: 14, padding: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ gap: 2 }}>
              <Text
                style={{ fontFamily: fontFamily.bold, ...typography.caption, color: colors.textSecondary }}
              >
                この日の学習時間
              </Text>
              <Text
                style={{
                  fontFamily: fontFamily.extraBold,
                  fontSize: 30,
                  lineHeight: 45,
                  color: colors.textPrimary,
                }}
              >
                {formatMinutes(view.totalSeconds)}
              </Text>
            </View>
            <View
              style={{
                height: 26,
                justifyContent: 'center',
                paddingHorizontal: 10,
                borderRadius: 999,
                backgroundColor: colors.primarySoft,
              }}
            >
              <Text style={{ fontFamily: fontFamily.bold, ...typography.caption, color: colors.primary }}>
                {`${view.sessions.length}件の記録`}
              </Text>
            </View>
          </View>
          {/* Folder split: a 12pt pill, one segment per folder sized by its share, 3pt apart. */}
          <View style={{ height: 12, flexDirection: 'row', gap: 3, borderRadius: 999, overflow: 'hidden' }}>
            {view.shares.map((share) => (
              <View
                key={share.folderId ?? 'none'}
                style={{ flex: share.seconds, backgroundColor: colorFor(share.folderId) }}
              />
            ))}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
            {view.shares.map((share) => (
              <View
                key={share.folderId ?? 'none'}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
              >
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: colorFor(share.folderId),
                  }}
                />
                <Text
                  style={{ fontFamily: fontFamily.bold, ...typography.caption, color: colors.textSecondary }}
                >
                  {`${nameOf(share.folderId)} ${formatMinutes(share.seconds)}`}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <Text
        accessibilityRole="header"
        style={{ fontFamily: fontFamily.extraBold, fontSize: 16, lineHeight: 24, color: colors.textPrimary }}
      >
        時刻ごとの記録
      </Text>
      {view && view.sessions.length === 0 ? (
        <View style={{ ...card, padding: 20 }}>
          <Text
            style={{
              textAlign: 'center',
              fontFamily: fontFamily.bold,
              ...typography.bodySm,
              color: colors.textSecondary,
            }}
          >
            この日の記録はまだありません
          </Text>
        </View>
      ) : (
        <View style={{ ...card, paddingHorizontal: 20, paddingVertical: 6 }}>
          {view?.sessions.map((s, i) => (
            <View
              key={s.id}
              accessibilityLabel={`${formatSessionRange(s.startedAt, s.endedAt)} ${nameOf(s.folderId)} ${formatMinutes(s.durationSeconds)}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 14,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: colors.divider,
              }}
            >
              <View style={{ width: 52 }}>
                <Text
                  style={{
                    fontFamily: fontFamily.extraBold,
                    fontSize: 15,
                    lineHeight: 22,
                    color: colors.textPrimary,
                  }}
                >
                  {formatClock(s.startedAt)}
                </Text>
                <Text
                  style={{ fontFamily: fontFamily.bold, ...typography.caption, color: colors.textSecondary }}
                >
                  {formatClock(s.endedAt)}
                </Text>
              </View>
              <View
                style={{ width: 4, height: 36, borderRadius: 2, backgroundColor: colorFor(s.folderId) }}
              />
              <Text
                numberOfLines={1}
                style={{
                  flex: 1,
                  fontFamily: fontFamily.extraBold,
                  fontSize: 15,
                  lineHeight: 22,
                  color: colors.textPrimary,
                }}
              >
                {nameOf(s.folderId)}
              </Text>
              <Text
                style={{
                  fontFamily: fontFamily.extraBold,
                  fontSize: 15,
                  lineHeight: 22,
                  color: colors.textPrimary,
                }}
              >
                {formatMinutes(s.durationSeconds)}
              </Text>
            </View>
          ))}
        </View>
      )}

      <Button
        label="＋ 記録を追加"
        variant="secondary"
        onPress={() => router.push({ pathname: '/records/add', params: { day: String(dayStart) } })}
      />
    </SettingsScaffold>
  );
}
