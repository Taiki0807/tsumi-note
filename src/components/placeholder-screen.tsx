import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/design';

type Props = {
  title: string;
  /** Phase in which the real screen is implemented. */
  phase: number;
};

/** Phase 1 stand-in for screens that are implemented in later phases. */
export function PlaceholderScreen({ title, phase }: Props) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background, paddingTop: insets.top }}>
      <View className="h-16 flex-row items-center px-6">
        <Text className="font-extrabold text-heading" style={{ color: colors.textPrimary }}>
          {title}
        </Text>
      </View>
      <View className="flex-1 items-center justify-center px-6">
        <Text className="font-bold text-body-sm" style={{ color: colors.textSecondary }}>
          Phase {phase} で実装予定
        </Text>
      </View>
    </View>
  );
}
