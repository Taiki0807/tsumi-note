import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, Text, View } from 'react-native';

import { fontFamily, iconSize, layout, radius, shadow, typography, useTheme } from '@/design';

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

export function TabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const colors = useTheme();

  return (
    <View
      accessibilityRole="tablist"
      style={{
        backgroundColor: colors.surface,
        borderTopColor: colors.divider,
        borderTopWidth: 1,
        paddingBottom: insets.bottom,
      }}
    >
      <View
        style={{
          height: layout.tabBarHeight,
          flexDirection: 'row',
          alignItems: 'flex-start',
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
              style={{ flex: 1, alignItems: 'center', paddingTop: isCenter ? 0 : 6 }}
            >
              {isCenter ? (
                <View style={{ marginTop: -(layout.timerButtonSize / 2 - 10), alignItems: 'center', gap: 2 }}>
                  <View
                    style={[
                      {
                        width: layout.timerButtonSize,
                        height: layout.timerButtonSize,
                        borderRadius: radius['2xl'],
                        borderWidth: layout.timerButtonBorder,
                        borderColor: colors.surface,
                        backgroundColor: colors.primary,
                        alignItems: 'center',
                        justifyContent: 'center',
                      },
                      shadow.primary,
                    ]}
                  >
                    <Icon name="clock" size={iconSize.xl} color={colors.textOnPrimary} strokeWidth={2.5} />
                  </View>
                  <Text style={labelStyle}>{label}</Text>
                </View>
              ) : (
                <View style={{ alignItems: 'center', gap: 2 }}>
                  <Icon
                    name={TAB_ICONS[route.name] ?? 'note'}
                    size={iconSize.lg}
                    color={labelColor}
                    strokeWidth={focused ? 2.4 : 2}
                  />
                  <Text style={labelStyle}>{label}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
