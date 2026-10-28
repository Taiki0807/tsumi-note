import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { fontFamily, iconSize, layout, shadow, typography, useTheme } from '@/design';

import { Icon, type IconName } from './icons';

const TAB_ICONS: Record<string, IconName> = {
  records: 'chart',
  notes: 'note',
  timer: 'clock',
  review: 'cards',
  mypage: 'user',
};

const TAB_COUNT = 5;

/**
 * Figma TabBar(最新): 選択中のタブの位置でバー背景が上へ膨らみ(Bulge: 幅100・高さ約15.5・fill=surface・stroke=divider)、
 * その中に直径44の primary の円(Bubble: バー上端から12pt上)が置かれ、アイコン(24pt)は円の中心へ10pt持ち上がる。
 * タイマーを含む5タブは同じ構成で、特別な突出ボタンは使わない。
 */
const BULGE_WIDTH = 100;
const BULGE_RISE = 16;
const BUBBLE_SIZE = 44;
const BUBBLE_TOP = -12;
const ICON_LIFT = 10;
/** Figma の Smart Animate / EASE_OUT_BACK に近づけた、少しオーバーシュートするスプリング */
const SPRING = { damping: 14, stiffness: 180, mass: 0.8 } as const;

/** 目標値へスプリングで動かす。連続タップでは現在値から引き継ぐ。Reduce Motion 時は即時 */
function useSpringTo(target: number, reduceMotion: boolean) {
  const value = useSharedValue(target);
  useEffect(() => {
    value.set(reduceMotion ? withTiming(target, { duration: 0 }) : withSpring(target, SPRING));
  }, [target, reduceMotion, value]);
  return value;
}

/** 選択中タブのアイコンを、膨らみの中心へ持ち上げる(膨らみの移動と同じスプリング) */
function LiftOnSelect({
  focused,
  reduceMotion,
  children,
}: {
  focused: boolean;
  reduceMotion: boolean;
  children: ReactNode;
}) {
  const lift = useSpringTo(focused ? 1 : 0, reduceMotion);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -ICON_LIFT * lift.get() }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** 背景の膨らみと円。選択位置(タブ番号)をスプリングで動かすので、タブ間を滑らかに移動する */
function Bulge({
  index,
  width,
  reduceMotion,
}: {
  index: number;
  width: SharedValue<number>;
  reduceMotion: boolean;
}) {
  const colors = useTheme();
  const pos = useSpringTo(index, reduceMotion);
  const bulgeStyle = useAnimatedStyle(() => ({
    opacity: width.get() > 0 ? 1 : 0,
    transform: [{ translateX: ((pos.get() + 0.5) * width.get()) / TAB_COUNT - BULGE_WIDTH / 2 }],
  }));
  const bubbleStyle = useAnimatedStyle(() => ({
    opacity: width.get() > 0 ? 1 : 0,
    transform: [{ translateX: ((pos.get() + 0.5) * width.get()) / TAB_COUNT - BUBBLE_SIZE / 2 }],
  }));
  const h = BULGE_RISE;
  const curve = `M0 ${h} C22 ${h} 28 0.5 50 0.5 C72 0.5 78 ${h} 100 ${h}`;
  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[{ position: 'absolute', top: -h, left: 0, width: BULGE_WIDTH, height: h + 2 }, bulgeStyle]}
      >
        <Svg width={BULGE_WIDTH} height={h + 2} viewBox={`0 0 ${BULGE_WIDTH} ${h + 2}`}>
          {/* 下端はバー上端の区切り線を覆い、背景と一体に見せる */}
          <Path d={`${curve} L100 ${h + 2} L0 ${h + 2} Z`} fill={colors.surface} />
          <Path d={curve} fill="none" stroke={colors.divider} strokeWidth={1} />
        </Svg>
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            top: BUBBLE_TOP,
            left: 0,
            width: BUBBLE_SIZE,
            height: BUBBLE_SIZE,
            borderRadius: BUBBLE_SIZE / 2,
            backgroundColor: colors.primary,
          },
          shadow.primary,
          bubbleStyle,
        ]}
      />
    </>
  );
}

export function TabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const colors = useTheme();
  const reduceMotion = useReducedMotion();
  const rowWidth = useSharedValue(0);

  return (
    <View
      accessibilityRole="tablist"
      style={{
        backgroundColor: colors.surface,
        minHeight: layout.tabBarHeight,
        paddingBottom: Math.max(insets.bottom, layout.tabBarHeight - layout.tabContentHeight),
      }}
    >
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 1,
          backgroundColor: colors.divider,
        }}
      />
      <View
        onLayout={(e) => rowWidth.set(e.nativeEvent.layout.width)}
        style={{
          height: layout.tabContentHeight,
          flexDirection: 'row',
          alignSelf: 'center',
          width: '100%',
          maxWidth: layout.contentMaxWidth,
        }}
      >
        <Bulge index={state.index} width={rowWidth} reduceMotion={reduceMotion} />
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key]!;
          const focused = state.index === index;
          const label = options.title ?? route.name;

          const onPress = () => {
            const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigateToTab(route.key);
          };

          const labelStyle = {
            ...typography.tabLabel,
            color: focused ? colors.primary : colors.textSecondary,
            fontFamily: focused ? fontFamily.extraBold : fontFamily.bold,
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: focused }}
              onPress={onPress}
              style={{ flex: 1, alignItems: 'center' }}
            >
              <View
                style={{
                  marginTop: layout.tabItemOffset,
                  paddingTop: layout.tabItemPaddingTop,
                  alignItems: 'center',
                  gap: layout.tabItemGap,
                }}
              >
                <LiftOnSelect focused={focused} reduceMotion={reduceMotion}>
                  <Icon
                    name={TAB_ICONS[route.name] ?? 'note'}
                    size={iconSize.lg}
                    color={focused ? colors.textOnPrimary : colors.textSecondary}
                    strokeWidth={route.name === 'records' ? 2.4 : 2}
                  />
                </LiftOnSelect>
                <Text style={labelStyle}>{label}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
