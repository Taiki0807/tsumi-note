import { Pressable, Text, View } from 'react-native';

import { BottomSheet } from '@/components/form-ui';
import { Icon } from '@/components/icons';
import { fontFamily, typography, useTheme } from '@/design';
import { TIMER_ALARM_MODE_LABELS, TIMER_ALARM_MODES, type TimerAlarmMode } from '@/domain/app-settings';

const DESCRIPTIONS: Record<TimerAlarmMode, string> = {
  long: '通知音を約30秒間くり返します',
  short: '通知音を1回鳴らします',
  silent: '音は鳴らしません（バイブレーションは別設定）',
};

type Props = {
  visible: boolean;
  mode: TimerAlarmMode;
  onSelect: (mode: TimerAlarmMode) => void;
  onClose: () => void;
};

/**
 * タイマー終了時のアラーム音を選ぶシート。未デザイン(Figma無し)のため、フォルダー選択シート(Figma 01b)と同じ
 * BottomSheet / 行レイアウト / Design Token だけで構成する。
 */
export function AlarmModeSheet({ visible, mode, onSelect, onClose }: Props) {
  const colors = useTheme();
  return (
    <BottomSheet visible={visible} onClose={onClose} gap={18}>
      <View style={{ gap: 4 }}>
        <Text
          accessibilityRole="header"
          style={{ fontFamily: fontFamily.extraBold, ...typography.heading, lineHeight: 33, color: colors.textPrimary }}
        >
          アラーム音
        </Text>
        <Text style={{ fontFamily: fontFamily.bold, ...typography.label, color: colors.textSecondary }}>
          集中・休憩が終わったときの通知音を選べます
        </Text>
      </View>
      <View>
        {TIMER_ALARM_MODES.map((option, i) => {
          const selected = option === mode;
          return (
            <Pressable
              key={option}
              accessibilityRole="button"
              accessibilityLabel={`${TIMER_ALARM_MODE_LABELS[option]}。${DESCRIPTIONS[option]}`}
              accessibilityState={{ selected }}
              onPress={() => {
                onSelect(option);
                onClose();
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                paddingVertical: 12,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: colors.divider,
              }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: selected ? colors.primarySoft : colors.background,
                }}
              >
                <Icon
                  name={option === 'silent' ? 'volume-off' : 'volume'}
                  size={22}
                  color={selected ? colors.primary : colors.textSecondary}
                />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  style={{ fontFamily: fontFamily.extraBold, fontSize: 16, lineHeight: 24, color: colors.textPrimary }}
                >
                  {TIMER_ALARM_MODE_LABELS[option]}
                </Text>
                <Text style={{ fontFamily: fontFamily.bold, ...typography.caption, color: colors.textSecondary }}>
                  {DESCRIPTIONS[option]}
                </Text>
              </View>
              {selected && (
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: colors.primary,
                  }}
                >
                  <Icon name="check" size={14} color={colors.textOnPrimary} strokeWidth={3} />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
  );
}
