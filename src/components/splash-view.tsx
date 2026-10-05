import { Text, View } from 'react-native';

import { AppIcon } from './app-icon';

const LOADING_DOTS = [0, 1, 2];

/** Figma 00 起動画面: primary background, app icon motif, app name, tagline, loading dots. */
export function SplashView() {
  return (
    <View className="flex-1 items-center justify-center bg-primary">
      <View className="items-center gap-2" style={{ width: 238 }}>
        <AppIcon size={200} />
        <Text className="mt-1 font-extrabold text-display text-white">つみノート</Text>
        <Text className="text-body-sm font-bold text-white">毎日すこしずつ、学びを積み上げる。</Text>
      </View>
      <View className="mt-16 flex-row gap-2" accessibilityLabel="読み込み中" accessibilityRole="progressbar">
        {LOADING_DOTS.map((dot) => (
          <View key={dot} className="h-2 w-2 rounded-full bg-white" />
        ))}
      </View>
    </View>
  );
}
