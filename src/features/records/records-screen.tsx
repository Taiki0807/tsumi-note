import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { Icon } from '@/components/icons';
import { fontFamily, layout, radius, shadow, typography, useTheme } from '@/design';

import {
  chartMaxHours,
  formatDiff,
  formatWeekRange,
  splitDuration,
  WEEKDAY_LABELS,
  type DayRecord,
} from './records-logic';
import { useWeeklyRecord } from './use-weekly-record';

/** Figma 02 学習記録 › Weekly chart: 150pt frame, baseline 120pt below the top gridline. */
const CHART_HEIGHT = 120;
const BAR_WIDTH = 24;

function WeekChart({ days, maxHours, today }: { days: DayRecord[]; maxHours: number; today: number }) {
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
          return (
            <View key={day.dayStart} style={{ flex: 1, alignItems: 'center' }}>
              <View style={{ height: CHART_HEIGHT, justifyContent: 'flex-end' }}>
                <View
                  accessibilityLabel={`${WEEKDAY_LABELS[day.weekdayIndex]}曜日 ${Math.floor(day.seconds / 60)}分`}
                  style={{
                    width: BAR_WIDTH,
                    height,
                    borderRadius: radius.sm,
                    backgroundColor: isToday ? colors.primary : colors.primaryMuted,
                  }}
                />
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
  const { view, weekStart, folderId, today, isCurrentWeek, selectFolder, previousWeek, nextWeek } =
    useWeeklyRecord();

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
        <AppIcon size={32} cornerRadius={8} />
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
          />

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
      </ScrollView>
    </View>
  );
}
