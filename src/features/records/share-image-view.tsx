import { forwardRef } from 'react';
import { Text, View, type HostInstance } from 'react-native';

import { fontFamily, radius, useTheme } from '@/design';

import { SHARE_IMAGE, type ShareModel } from './share-model';

const BAR_AREA_HEIGHT = 110;

type Props = { model: ShareModel; colorFor: (folderId: string | null) => string };

/**
 * Off-screen view that is captured as the share image. Fixed 360x450 pt (captured at 3x = 1080x1350 px),
 * so text and bars never get clipped regardless of the device. Colors come from the app's design tokens
 * (light / dark follows the system like the rest of the app). Placed outside the visible area.
 */
export const ShareImageView = forwardRef<HostInstance, Props>(function ShareImageView(
  { model, colorFor },
  ref,
) {
  const colors = useTheme();
  const small = {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  } as const;

  return (
    <View
      ref={ref}
      collapsable={false}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        position: 'absolute',
        left: -SHARE_IMAGE.width - 100,
        top: 0,
        width: SHARE_IMAGE.width,
        height: SHARE_IMAGE.height,
        padding: 24,
        gap: 16,
        backgroundColor: colors.background,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text
          style={{ fontFamily: fontFamily.extraBold, fontSize: 20, lineHeight: 28, color: colors.primary }}
        >
          {model.appName}
        </Text>
        <Text style={small}>{model.periodLabel}</Text>
      </View>

      <View style={{ gap: 2 }}>
        <Text style={small}>{`合計学習時間 · ${model.scopeLabel}`}</Text>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          style={{ fontFamily: fontFamily.numeric, fontSize: 40, lineHeight: 48, color: colors.textPrimary }}
        >
          {model.totalLabel}
        </Text>
        {model.diffLabel && (
          <Text style={{ ...small, fontFamily: fontFamily.extraBold, fontSize: 12, lineHeight: 16 }}>
            {model.diffLabel}
          </Text>
        )}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: BAR_AREA_HEIGHT + 44 }}>
        {model.bars.map((bar) => (
          <View key={bar.weekday} style={{ flex: 1, alignItems: 'center' }}>
            <View style={{ height: BAR_AREA_HEIGHT + 20, justifyContent: 'flex-end', alignItems: 'center' }}>
              {bar.label && (
                <Text
                  numberOfLines={1}
                  style={{
                    marginBottom: 4,
                    fontFamily: fontFamily.extraBold,
                    fontSize: 10,
                    lineHeight: 14,
                    color: colors.textSecondary,
                  }}
                >
                  {bar.label}
                </Text>
              )}
              <View
                style={{
                  width: 24,
                  height: bar.ratio * BAR_AREA_HEIGHT,
                  borderRadius: radius.sm,
                  overflow: 'hidden',
                  flexDirection: 'column-reverse',
                }}
              >
                {bar.segments.map((s) => (
                  <View
                    key={s.folderId ?? 'none'}
                    style={{
                      height: s.ratio * bar.ratio * BAR_AREA_HEIGHT,
                      backgroundColor: colorFor(s.folderId),
                    }}
                  />
                ))}
              </View>
            </View>
            <View style={{ height: 1, alignSelf: 'stretch', backgroundColor: colors.divider }} />
            <Text style={{ ...small, marginTop: 8, fontSize: 12, lineHeight: 16 }}>{bar.weekday}</Text>
          </View>
        ))}
      </View>

      <View style={{ gap: 8 }}>
        {model.folderRows.map((row) => (
          <View
            key={row.isOther ? 'other' : (row.folderId ?? 'none')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
          >
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: row.isOther ? colors.textSecondary : colorFor(row.folderId),
              }}
            />
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                fontFamily: fontFamily.bold,
                fontSize: 14,
                lineHeight: 20,
                color: colors.textPrimary,
              }}
            >
              {row.name}
            </Text>
            <Text
              style={{
                fontFamily: fontFamily.extraBold,
                fontSize: 14,
                lineHeight: 20,
                color: colors.textPrimary,
              }}
            >
              {row.durationLabel}
            </Text>
          </View>
        ))}
        {model.folderRows.length === 0 && <Text style={small}>この週の学習記録はまだありません</Text>}
      </View>
    </View>
  );
});
