import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { Button } from '@/components/form-ui';
import { Icon } from '@/components/icons';
import { fontFamily, layout, radius, shadow, typography, useTheme } from '@/design';

import { ManualSessionSheet } from './manual-session-sheet';
import { formatSessionRange } from './manual-session';
import {
  chartMaxHours,
  folderColorIndex,
  formatDayLabel,
  formatCorrectRate,
  formatDiff,
  formatNeedsReviewDetail,
  formatShortWeekRange,
  formatWeekRange,
  splitDuration,
  WEEKDAY_LABELS,
  type DayRecord,
} from './records-logic';
import { useWeeklyRecord } from './use-weekly-record';

/** Figma 02 学習記録 › Weekly chart: 150pt frame, baseline 120pt below the top gridline. */
const CHART_HEIGHT = 120;
const BAR_WIDTH = 24;
/** 「学習の記録」 list viewport (~5 rows); longer lists scroll inside the card. */
const SESSION_LIST_MAX_HEIGHT = 260;

/** Folder → chart color: the same primary → warning → info cycle as the folder list; 未分類 is success. */
function useFolderColors(folders: { id: string }[]) {
  const colors = useTheme();
  const order = folders.map((f) => f.id);
  const palette = [colors.primary, colors.warning, colors.info];
  return (folderId: string | null) => {
    const index = folderColorIndex(order, folderId);
    return index < 0 ? colors.success : (palette[index % palette.length] ?? colors.primary);
  };
}

function WeekChart({
  days,
  maxHours,
  today,
  colorFor,
}: {
  days: DayRecord[];
  maxHours: number;
  today: number;
  colorFor: (folderId: string | null) => string;
}) {
  const colors = useTheme();
  const gridLines = [maxHours, maxHours / 2, 0];

  return (
    <View style={{ height: 150 }}>
      {gridLines.map((hours) => (
        <View
          key={hours}
          style={{
            position: 'absolute',
            left: 0,
            right: 40,
            top: CHART_HEIGHT - (hours / maxHours) * CHART_HEIGHT,
            height: 1,
            backgroundColor: colors.divider,
          }}
        >
          <Text
            style={{
              position: 'absolute',
              left: '100%',
              marginLeft: 10,
              top: -8,
              width: 30,
              fontFamily: fontFamily.bold,
              fontSize: 11,
              lineHeight: 16,
              color: colors.textSecondary,
            }}
          >
            {hours === 0 ? '0' : `${hours}h`}
          </Text>
        </View>
      ))}
      <View style={{ position: 'absolute', left: 0, right: 40, top: 0, bottom: 0, flexDirection: 'row' }}>
        {days.map((day) => {
          const isToday = day.dayStart === today;
          const height = (day.seconds / 3600 / maxHours) * CHART_HEIGHT;
          const label = formatDayLabel(day.seconds);
          return (
            <View key={day.dayStart} style={{ flex: 1, alignItems: 'center' }}>
              <View style={{ height: CHART_HEIGHT, justifyContent: 'flex-end' }}>
                {label && (
                  <Text
                    numberOfLines={1}
                    style={{
                      marginBottom: 4,
                      fontFamily: fontFamily.extraBold,
                      fontSize: 11,
                      lineHeight: 16,
                      color: isToday ? colors.primary : colors.textSecondary,
                    }}
                  >
                    {label}
                  </Text>
                )}
                {/* Stacked by folder (v1.1.0): each segment uses its folder's color. */}
                <View
                  accessibilityLabel={`${WEEKDAY_LABELS[day.weekdayIndex]}曜日 ${Math.floor(day.seconds / 60)}分`}
                  style={{
                    width: BAR_WIDTH,
                    height,
                    borderRadius: radius.sm,
                    overflow: 'hidden',
                    flexDirection: 'column-reverse',
                  }}
                >
                  {day.segments.map((segment) => (
                    <View
                      key={segment.folderId ?? 'none'}
                      style={{
                        height: day.seconds > 0 ? (segment.seconds / day.seconds) * height : 0,
                        backgroundColor: colorFor(segment.folderId),
                      }}
                    />
                  ))}
                </View>
              </View>
              <Text
                style={{
                  marginTop: 10,
                  fontFamily: isToday ? fontFamily.extraBold : fontFamily.bold,
                  fontSize: typography.caption.fontSize,
                  lineHeight: typography.caption.lineHeight,
                  color: isToday ? colors.primary : colors.textSecondary,
                }}
              >
                {WEEKDAY_LABELS[day.weekdayIndex]}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** Figma 02 › StatCard (Tone=primary / success / danger): label row, then icon + value. */
function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: 'target' | 'check' | 'clock';
  tone: 'primary' | 'success' | 'danger';
}) {
  const colors = useTheme();
  const palette = {
    primary: { bg: colors.primarySoft, fg: colors.primary },
    success: { bg: colors.successSoft, fg: colors.successText },
    danger: { bg: colors.dangerSoft, fg: colors.danger },
  }[tone];
  return (
    <View
      accessibilityLabel={`${label} ${value}`}
      style={{ flex: 1, gap: 6, padding: 12, borderRadius: 12, backgroundColor: palette.bg }}
    >
      <Text
        style={{
          fontFamily: fontFamily.extraBold,
          fontSize: 12,
          lineHeight: 16,
          color: colors.textSecondary,
        }}
      >
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name={icon} size={18} color={palette.fg} />
        <Text style={{ fontFamily: fontFamily.extraBold, fontSize: 18, lineHeight: 24, color: palette.fg }}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function IconButton({
  name,
  label,
  onPress,
  disabled,
}: {
  name: 'chevron-left' | 'chevron-right';
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const colors = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceMuted,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Icon name={name} size={22} color={colors.textPrimary} />
    </Pressable>
  );
}

export function RecordsScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const {
    view,
    weekStart,
    folderId,
    today,
    isCurrentWeek,
    selectFolder,
    previousWeek,
    nextWeek,
    addManualSession,
  } = useWeeklyRecord();

  const record = view?.record;
  const total = splitDuration(record?.totalSeconds ?? 0);
  const diff =
    record && (record.totalSeconds > 0 || record.previousTotalSeconds > 0)
      ? formatDiff(record.diffSeconds)
      : null;
  const chip =
    diff?.kind === 'down'
      ? { bg: colors.dangerSoft, fg: colors.danger, icon: 'arrow-down' as const }
      : diff?.kind === 'same'
        ? { bg: colors.surfaceMuted, fg: colors.textSecondary, icon: null }
        : { bg: colors.successSoft, fg: colors.successText, icon: 'arrow-up' as const };
  const folders = view?.folders ?? [];
  const understanding = view?.understanding;
  const needsReview = view?.needsReview ?? null;
  const [adding, setAdding] = useState(false);
  const sessions = view?.sessions ?? [];
  const colorFor = useFolderColors(folders);
  // Only folders that appear in this week's bars, in the order of the folder list.
  const usedFolderIds = new Set(record?.days.flatMap((d) => d.segments.map((s) => s.folderId)));
  const legend = [
    ...folders
      .filter((f) => usedFolderIds.has(f.id))
      .map((f) => ({ folderId: f.id as string | null, name: f.name })),
    ...(usedFolderIds.has(null) ? [{ folderId: null, name: '未分類' }] : []),
  ];
  const selectedFolderName = folders.find((f) => f.id === folderId)?.name ?? 'すべて';

  const numeric = {
    fontFamily: fontFamily.numeric,
    fontSize: 40,
    lineHeight: 44,
    color: colors.textPrimary,
  } as const;
  const unit = {
    fontFamily: fontFamily.extraBold,
    fontSize: typography.button.fontSize,
    lineHeight: typography.button.lineHeight,
    color: colors.textPrimary,
    marginBottom: 2,
  } as const;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <View
        style={{
          height: 64,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingLeft: 24,
          paddingRight: 16,
          paddingTop: 12,
          paddingBottom: 8,
        }}
      >
        {/* Figma 192:257 › AppIcon (200:496): 32×32, cornerRadius 8 (of 32) → 200-grid radius 50. */}
        <AppIcon size={32} cornerRadius={8 * (200 / 32)} />
        <Text
          accessibilityRole="header"
          style={{
            flex: 1,
            fontFamily: fontFamily.extraBold,
            fontSize: typography.heading.fontSize,
            lineHeight: typography.heading.lineHeight,
            color: colors.textPrimary,
          }}
        >
          学習記録
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          width: '100%',
          maxWidth: layout.contentMaxWidth,
          alignSelf: 'center',
          paddingHorizontal: 24,
          paddingTop: 8,
          paddingBottom: 24,
          gap: 14,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <IconButton name="chevron-left" label="前の週" onPress={previousWeek} />
          <Text
            style={{
              fontFamily: fontFamily.extraBold,
              fontSize: typography.body.fontSize,
              lineHeight: typography.body.lineHeight,
              color: colors.textPrimary,
            }}
          >
            {formatWeekRange(weekStart)}
          </Text>
          <IconButton name="chevron-right" label="次の週" onPress={nextWeek} disabled={isCurrentWeek} />
        </View>

        <View
          style={{
            gap: 20,
            padding: 20,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.divider,
            backgroundColor: colors.surface,
            ...shadow.card,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <View style={{ gap: 2 }}>
              <Text
                style={{
                  fontFamily: fontFamily.bold,
                  fontSize: typography.label.fontSize,
                  lineHeight: typography.label.lineHeight,
                  color: colors.textSecondary,
                }}
              >
                {isCurrentWeek ? '今週の学習時間' : 'この週の学習時間'}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
                {total.hours > 0 && (
                  <>
                    <Text style={numeric}>{total.hours}</Text>
                    <Text style={unit}>時間</Text>
                  </>
                )}
                <Text style={numeric}>{total.minutes}</Text>
                <Text style={unit}>分</Text>
              </View>
            </View>
            {diff && (
              <View
                style={{
                  height: 28,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: 12,
                  borderRadius: radius.full,
                  backgroundColor: chip.bg,
                }}
              >
                {chip.icon && <Icon name={chip.icon} size={16} color={chip.fg} />}
                <Text
                  style={{
                    fontFamily: fontFamily.extraBold,
                    fontSize: typography.label.fontSize,
                    lineHeight: typography.label.lineHeight,
                    color: chip.fg,
                  }}
                >
                  {diff.label}
                </Text>
              </View>
            )}
          </View>

          <WeekChart
            today={today}
            days={record?.days ?? []}
            maxHours={record ? chartMaxHours(record.days) : 2}
            colorFor={colorFor}
          />

          {legend.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {legend.map(({ folderId, name }) => (
                <View key={folderId ?? 'none'} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View
                    style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colorFor(folderId) }}
                  />
                  <Text
                    style={{
                      fontFamily: fontFamily.bold,
                      fontSize: typography.caption.fontSize,
                      lineHeight: typography.caption.lineHeight,
                      color: colors.textSecondary,
                    }}
                  >
                    {name}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {record && record.totalSeconds === 0 && (
            <Text
              style={{
                textAlign: 'center',
                fontFamily: fontFamily.bold,
                fontSize: typography.bodySm.fontSize,
                lineHeight: typography.bodySm.lineHeight,
                color: colors.textSecondary,
              }}
            >
              この週の学習記録はまだありません
            </Text>
          )}
        </View>

        {folders.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {[{ id: undefined, name: 'すべて' }, ...folders].map((f) => {
              const selected = f.id === folderId;
              return (
                <Pressable
                  key={f.id ?? 'all'}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => selectFolder(f.id)}
                  style={{
                    minWidth: 109,
                    height: 36,
                    paddingHorizontal: 16,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: radius.full,
                    borderWidth: 2,
                    borderColor: colors.primary,
                    backgroundColor: selected ? colors.primary : 'transparent',
                  }}
                >
                  <Text
                    style={{
                      fontFamily: fontFamily.extraBold,
                      fontSize: typography.bodySm.fontSize,
                      lineHeight: typography.bodySm.lineHeight,
                      color: selected ? colors.textOnPrimary : colors.primary,
                    }}
                  >
                    {f.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        <View
          style={{
            gap: 12,
            padding: 20,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.divider,
            backgroundColor: colors.surface,
            ...shadow.card,
          }}
        >
          <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
          >
            <Text
              style={{
                fontFamily: fontFamily.extraBold,
                fontSize: 18,
                lineHeight: 26,
                color: colors.textPrimary,
              }}
            >
              学習の記録
            </Text>
            <Button label="＋ 記録を追加" size="sm" onPress={() => setAdding(true)} />
          </View>
          {sessions.length === 0 ? (
            <Text
              style={{
                fontFamily: fontFamily.bold,
                fontSize: typography.bodySm.fontSize,
                lineHeight: typography.bodySm.lineHeight,
                color: colors.textSecondary,
              }}
            >
              この週の記録はまだありません
            </Text>
          ) : (
            <ScrollView
              nestedScrollEnabled
              style={{ maxHeight: SESSION_LIST_MAX_HEIGHT }}
              contentContainerStyle={{ gap: 14 }}
            >
              {sessions.map((s) => {
                const d = new Date(s.startedAt);
                return (
                  <View
                    key={s.id}
                    accessibilityLabel={`${d.getMonth() + 1}月${d.getDate()}日 ${formatSessionRange(s.startedAt, s.endedAt)} ${Math.floor(s.durationSeconds / 60)}分`}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
                  >
                    <View
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: colorFor(s.folderId),
                      }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontFamily: fontFamily.extraBold,
                          fontSize: typography.bodySm.fontSize,
                          lineHeight: typography.bodySm.lineHeight,
                          color: colors.textPrimary,
                        }}
                      >
                        {`${d.getMonth() + 1}/${d.getDate()}（${WEEKDAY_LABELS[(d.getDay() + 6) % 7]}） ${formatSessionRange(s.startedAt, s.endedAt)}`}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={{
                          fontFamily: fontFamily.regular,
                          fontSize: typography.caption.fontSize,
                          lineHeight: typography.caption.lineHeight,
                          color: colors.textSecondary,
                        }}
                      >
                        {folders.find((f) => f.id === s.folderId)?.name ?? '未分類'}
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontFamily: fontFamily.numeric,
                        fontSize: 15,
                        lineHeight: 24,
                        color: colors.textPrimary,
                      }}
                    >
                      {`${Math.floor(s.durationSeconds / 60)}分`}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>

        {understanding && (
          <View
            style={{
              gap: 14,
              padding: 20,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: colors.divider,
              backgroundColor: colors.surface,
              ...shadow.card,
            }}
          >
            <View
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
            >
              <Text
                style={{
                  fontFamily: fontFamily.extraBold,
                  fontSize: 18,
                  lineHeight: 26,
                  color: colors.textPrimary,
                }}
              >
                {isCurrentWeek ? '今週の理解度' : 'この週の理解度'}
              </Text>
              <Text
                numberOfLines={1}
                style={{
                  flexShrink: 1,
                  fontFamily: fontFamily.bold,
                  fontSize: 12,
                  lineHeight: 16,
                  color: colors.textSecondary,
                }}
              >
                {`${selectedFolderName} · ${formatShortWeekRange(weekStart)}`}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <StatCard label="解答数" value={`${understanding.answerCount}`} icon="target" tone="primary" />
              <StatCard
                label="正答率"
                value={formatCorrectRate(understanding.correctRate)}
                icon="check"
                tone="success"
              />
              <StatCard label="時間切れ" value={`${understanding.timeoutCount}`} icon="clock" tone="danger" />
            </View>
            {understanding.answerCount === 0 && (
              <Text
                style={{
                  textAlign: 'center',
                  fontFamily: fontFamily.bold,
                  fontSize: typography.bodySm.fontSize,
                  lineHeight: typography.bodySm.lineHeight,
                  color: colors.textSecondary,
                }}
              >
                この週の復習記録はまだありません
              </Text>
            )}
            {needsReview && (
              <View
                accessibilityLabel={`今週の要復習 ${needsReview.prompt} ${formatNeedsReviewDetail(needsReview)}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  borderRadius: 12,
                  backgroundColor: colors.warningSoft,
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: colors.warning,
                  }}
                >
                  <Icon name="flame" size={20} color={colors.textOnPrimary} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text
                    style={{
                      fontFamily: fontFamily.extraBold,
                      fontSize: 12,
                      lineHeight: 16,
                      color: colors.warningText,
                    }}
                  >
                    {isCurrentWeek ? '今週の要復習' : 'この週の要復習'}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontFamily: fontFamily.extraBold,
                      fontSize: 15,
                      lineHeight: 24,
                      color: colors.textPrimary,
                    }}
                  >
                    {`${needsReview.prompt} · ${formatNeedsReviewDetail(needsReview)}`}
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>
      <ManualSessionSheet
        visible={adding}
        folders={folders}
        today={today}
        defaultFolderId={folderId}
        onSubmit={addManualSession}
        onClose={() => setAdding(false)}
      />
    </View>
  );
}
