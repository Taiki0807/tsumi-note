import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button, IconButton } from '@/components/form-ui';
import { fontFamily, radius, typography, useTheme } from '@/design';
import { buildMonthGrid, localToday, makeExamDay, parseExamDay } from '@/domain/goal';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const MIN_YEAR = 1990;
const MAX_YEAR = 2100;

/**
 * Calendar for the 受験日. Not designed in Figma (checked 190:32), so it is built from existing tokens:
 * primary accent for the selected day, primarySoft for today, the shared Button / IconButton, 12pt radius.
 * It works on pure year / month / day numbers and hands back a `YYYY-MM-DD` string (never a Date/epoch).
 */
export function ExamDateCalendar({
  value,
  now,
  onConfirm,
  onCancel,
}: {
  /** Current exam day; the calendar opens on it with it preselected. */
  value: string | null;
  now: number;
  /** `null` = 未定. */
  onConfirm: (day: string | null) => void;
  onCancel: () => void;
}) {
  const colors = useTheme();
  const today = parseExamDay(localToday(now));
  const initial = (value ? parseExamDay(value) : undefined) ?? today;
  const [cursor, setCursor] = useState({ year: initial?.year ?? 2026, month: initial?.month ?? 1 });
  const [selected, setSelected] = useState<string | null>(value);
  const [pickingMonth, setPickingMonth] = useState(false);

  const shift = (months: number) =>
    setCursor(({ year, month }) => {
      const index = year * 12 + (month - 1) + months;
      const next = { year: Math.floor(index / 12), month: (index % 12) + 1 };
      return next.year < MIN_YEAR || next.year > MAX_YEAR ? { year, month } : next;
    });
  const shiftYear = (years: number) =>
    setCursor(({ year, month }) => ({
      year: Math.min(MAX_YEAR, Math.max(MIN_YEAR, year + years)),
      month,
    }));

  const title = `${cursor.year}年${cursor.month}月`;

  return (
    <View style={{ gap: 16 }}>
      <Text style={{ fontFamily: fontFamily.extraBold, ...typography.heading, color: colors.textPrimary }}>
        受験日を選択
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconButton
          name="chevron-left"
          label={pickingMonth ? '前の年' : '前の月'}
          onPress={() => (pickingMonth ? shiftYear(-1) : shift(-1))}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${title}（年月を選択）`}
          onPress={() => setPickingMonth((v) => !v)}
          style={{ paddingHorizontal: 12, height: 44, justifyContent: 'center' }}
        >
          <Text style={{ fontFamily: fontFamily.extraBold, ...typography.button, color: colors.textPrimary }}>
            {pickingMonth ? `${cursor.year}年` : title}
          </Text>
        </Pressable>
        <IconButton
          name="chevron-right"
          label={pickingMonth ? '次の年' : '次の月'}
          onPress={() => (pickingMonth ? shiftYear(1) : shift(1))}
        />
      </View>

      {pickingMonth ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 }}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
            const active = month === cursor.month;
            return (
              <View key={month} style={{ width: '25%', paddingHorizontal: 4 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    setCursor({ year: cursor.year, month });
                    setPickingMonth(false);
                  }}
                  style={{
                    height: 44,
                    borderRadius: radius.md,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: active ? colors.primary : colors.primarySoft,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: fontFamily.extraBold,
                      ...typography.bodySm,
                      color: active ? colors.textOnPrimary : colors.primary,
                    }}
                  >
                    {month}月
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : (
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row' }}>
            {WEEKDAYS.map((label) => (
              <Text
                key={label}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  fontFamily: fontFamily.bold,
                  ...typography.caption,
                  color: colors.textSecondary,
                }}
              >
                {label}
              </Text>
            ))}
          </View>
          {buildMonthGrid(cursor.year, cursor.month).map((week, w) => (
            <View key={w} style={{ flexDirection: 'row' }}>
              {week.map((day, d) => {
                if (day === 0) return <View key={d} style={{ flex: 1, height: 44 }} />;
                const iso = makeExamDay(cursor.year, cursor.month, day);
                const active = iso !== null && iso === selected;
                const isToday = iso !== null && iso === localToday(now);
                return (
                  <View key={d} style={{ flex: 1, alignItems: 'center' }}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${cursor.year}年${cursor.month}月${day}日`}
                      accessibilityState={{ selected: active }}
                      onPress={() => setSelected(iso)}
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: radius.full,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: active
                          ? colors.primary
                          : isToday
                            ? colors.primarySoft
                            : 'transparent',
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: active || isToday ? fontFamily.extraBold : fontFamily.regular,
                          ...typography.bodySm,
                          color: active
                            ? colors.textOnPrimary
                            : isToday
                              ? colors.primary
                              : colors.textPrimary,
                        }}
                      >
                        {day}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      )}

      <Pressable
        accessibilityRole="button"
        onPress={() => onConfirm(null)}
        style={{ alignSelf: 'center', height: 36, justifyContent: 'center' }}
      >
        <Text style={{ fontFamily: fontFamily.extraBold, ...typography.label, color: colors.textSecondary }}>
          受験日を未定にする
        </Text>
      </Pressable>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Button label="キャンセル" variant="secondary" flex onPress={onCancel} />
        <Button label="決定" flex disabled={selected === null} onPress={() => onConfirm(selected)} />
      </View>
    </View>
  );
}
