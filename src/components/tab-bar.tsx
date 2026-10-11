import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { fontFamily, iconSize, layout, shadow, typography, useTheme } from '@/design';

import { Icon, type IconName } from './icons';

const TAB_ICONS: Record<string, IconName> = {
  records: 'chart',
  notes: 'note',
  timer: 'clock',
  review: 'cards',
  mypage: 'user',
};

/** The center tab (Figma TabBar › Tab/タイマー) is rendered as a raised, filled circular button. */
const CENTER_ROUTE = 'timer';

/** 選択中タブの拡大率。タブ幅(78pt)に対し、アイコン+ラベル(最大50pt)・タイマー(64pt)が隣と重ならない範囲 */
const SELECTED_SCALE = 1.12;
const CENTER_SELECTED_SCALE = 1.08;
/** Figma のタブ切替は Smart Animate / EASE_OUT_BACK / 450ms。オーバーシュートするスプリングで近似する */
const SPRING = { damping: 11, stiffness: 170, mass: 0.8 } as const;

/** 選択状態に応じて scale をスプリングで変える。連続タップでも現在値から次の目標へ引き継ぐ。Reduce Motion 時は即時 */
function ScaleOnSelect({ focused, to, children }: { focused: boolean; to: number; children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(focused ? to : 1);
  useEffect(() => {
    const target = focused ? to : 1;
    scale.set(reduceMotion ? withTiming(target, { duration: 0 }) : withSpring(target, SPRING));
  }, [focused, to, reduceMotion, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

export function TabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const colors = useTheme();

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
        style={{
          height: layout.tabContentHeight,
          flexDirection: 'row',
          alignSelf: 'center',
          width: '100%',
          maxWidth: layout.contentMaxWidth,
        }}
      >
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key]!;
          const focused = state.index === index;
          const label = options.title ?? route.name;
          const isCenter = route.name === CENTER_ROUTE;

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          };

          const labelColor = focused ? colors.primary : colors.textSecondary;
          const labelStyle = {
            ...typography.tabLabel,
            color: labelColor,
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
              {isCenter ? (
                <ScaleOnSelect focused={focused} to={CENTER_SELECTED_SCALE}>
                  <View
                    style={{
                      marginTop: -layout.timerButtonProtrusion,
                      alignItems: 'center',
                      gap: layout.tabItemGap,
                    }}
                  >
                    <View
                      style={{
                        width: layout.timerButtonSize,
                        height: layout.timerButtonSize,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {/* Figma strokes the button OUTSIDE (4pt): the ring extends beyond the 56pt box. */}
                      <View
                        style={[
                          {
                            position: 'absolute',
                            top: -layout.timerButtonBorder,
                            left: -layout.timerButtonBorder,
                            width: layout.timerButtonSize + layout.timerButtonBorder * 2,
                            height: layout.timerButtonSize + layout.timerButtonBorder * 2,
                            borderRadius: (layout.timerButtonSize + layout.timerButtonBorder * 2) / 2,
                            borderWidth: layout.timerButtonBorder,
                            borderColor: colors.surface,
                            backgroundColor: colors.primary,
                          },
                          shadow.primary,
                        ]}
                      />
                      <Icon name="clock" size={iconSize.xl} color={colors.textOnPrimary} strokeWidth={2.2} />
                    </View>
                    <Text style={labelStyle}>{label}</Text>
                  </View>
                </ScaleOnSelect>
              ) : (
                <ScaleOnSelect focused={focused} to={SELECTED_SCALE}>
                  <View
                    style={{
                      marginTop: layout.tabItemOffset,
                      paddingTop: layout.tabItemPaddingTop,
                      alignItems: 'center',
                      gap: layout.tabItemGap,
                    }}
                  >
                    <Icon
                      name={TAB_ICONS[route.name] ?? 'note'}
                      size={iconSize.lg}
                      color={labelColor}
                      strokeWidth={route.name === 'records' ? 2.4 : 2}
                    />
                    <Text style={labelStyle}>{label}</Text>
                  </View>
                </ScaleOnSelect>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
