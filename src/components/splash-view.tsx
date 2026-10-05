import { Text, View } from 'react-native';

import { AppIcon } from './app-icon';

/** Figma 00 起動画面 (211:647): 390×844, fill #6949ff. */
const BACKGROUND = '#6949ff';
/** Dot opacities from Figma "Loading dots" (211:664). */
const LOADING_DOTS = [1, 0.6, 0.3];

/**
 * Brand block (238×290, VERTICAL gap 8, centered) sits 40pt above the vertical center
 * (top 237 / center 382 of 844); loading dots (40×8) end 88pt above the bottom.
 */
export function SplashView() {
  return (
    <View
      className="flex-1 items-center justify-center"
      style={{ backgroundColor: BACKGROUND, paddingBottom: 80 }}
    >
      <View className="items-center" style={{ width: 238, gap: 8 }}>
        <AppIcon size={200} />
        <View style={{ width: 1, height: 4 }} />
        <Text
          className="font-extrabold text-white"
          style={{ fontSize: 32, lineHeight: 40, letterSpacing: 1.28, textAlign: 'center' }}
        >
          つみノート
        </Text>
        <Text
          className="font-bold text-white"
          style={{ fontSize: 14, lineHeight: 22, opacity: 0.85, textAlign: 'center' }}
        >
          毎日すこしずつ、学びを積み上げる。
        </Text>
      </View>
      <View
        className="absolute flex-row"
        style={{ bottom: 88, gap: 8 }}
        accessibilityLabel="読み込み中"
        accessibilityRole="progressbar"
      >
        {LOADING_DOTS.map((opacity) => (
          <View
            key={opacity}
            style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#ffffff', opacity }}
          />
        ))}
      </View>
    </View>
  );
}
