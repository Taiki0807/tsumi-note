import { forwardRef, type ReactNode } from 'react';
import { Text, View, type HostInstance } from 'react-native';

import { fontFamily, radius, useTheme } from '@/design';

import {
  SHARE_IMAGE,
  TIMELINE_AXIS_HOURS,
  type DayShareModel,
  type ShareFolderRow,
  type ShareModel,
} from './share-model';

const BAR_AREA_HEIGHT = 110;
const TIMELINE_HEIGHT = 36;

type ColorFor = (folderId: string | null) => string;

/**
 * Common layout of every share image: fixed 360x450 pt (captured at 3x = 1080x1350 px) so text and charts never
 * get clipped regardless of the device, placed outside the visible area. Header (app name + right label), the
 * total block, the chart slot (`children`, differs between week and day) and the folder breakdown.
 * Colors come from the app's design tokens (light / dark follows the system like the rest of the app).
 */
const ShareFrame = forwardRef<
  HostInstance,
  {
    appName: string;
    headerRight: string;
    totalCaption: string;
    totalLabel: string;
    totalNote: string | null;
    folderRows: ShareFolderRow[];
    emptyLabel: string;
    colorFor: ColorFor;
    children: ReactNode;
  }
>(function ShareFrame(
  { appName, headerRight, totalCaption, totalLabel, totalNote, folderRows, emptyLabel, colorFor, children },
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
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text
          style={{ fontFamily: fontFamily.extraBold, fontSize: 20, lineHeight: 28, color: colors.primary }}
        >
          {appName}
        </Text>
        <Text numberOfLines={1} style={{ ...small, flexShrink: 1 }}>
          {headerRight}
        </Text>
      </View>

      <View style={{ gap: 2 }}>
        <Text style={small}>{totalCaption}</Text>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          style={{ fontFamily: fontFamily.numeric, fontSize: 40, lineHeight: 48, color: colors.textPrimary }}
        >
          {totalLabel}
        </Text>
        {totalNote && (
          <Text style={{ ...small, fontFamily: fontFamily.extraBold, fontSize: 12, lineHeight: 16 }}>
            {totalNote}
          </Text>
        )}
      </View>

      {children}

      <View style={{ gap: 8 }}>
        {folderRows.map((row) => (
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
        {folderRows.length === 0 && <Text style={small}>{emptyLabel}</Text>}
      </View>
    </View>
  );
});

/** Weekly share image: the bar chart currently shown on 学習記録. */
export const ShareImageView = forwardRef<HostInstance, { model: ShareModel; colorFor: ColorFor }>(
  function ShareImageView({ model, colorFor }, ref) {
    const colors = useTheme();
    const small = {
      fontFamily: fontFamily.bold,
      fontSize: 12,
      lineHeight: 16,
      color: colors.textSecondary,
    } as const;
    return (
      <ShareFrame
        ref={ref}
        appName={model.appName}
        headerRight={model.periodLabel}
        totalCaption={`合計学習時間 · ${model.scopeLabel}`}
        totalLabel={model.totalLabel}
        totalNote={model.diffLabel}
        folderRows={model.folderRows}
        emptyLabel="この週の学習記録はまだありません"
        colorFor={colorFor}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: BAR_AREA_HEIGHT + 44 }}>
          {model.bars.map((bar) => (
            <View key={bar.weekday} style={{ flex: 1, alignItems: 'center' }}>
              <View
                style={{ height: BAR_AREA_HEIGHT + 20, justifyContent: 'flex-end', alignItems: 'center' }}
              >
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
              <Text style={{ ...small, marginTop: 8 }}>{bar.weekday}</Text>
            </View>
          ))}
        </View>
      </ShareFrame>
    );
  },
);

/** Daily share image: the day's sessions as colored bands on a 0:00–24:00 timeline. */
export const DayShareImageView = forwardRef<HostInstance, { model: DayShareModel; colorFor: ColorFor }>(
  function DayShareImageView({ model, colorFor }, ref) {
    const colors = useTheme();
    const caption = {
      fontFamily: fontFamily.bold,
      fontSize: 12,
      lineHeight: 16,
      color: colors.textSecondary,
    } as const;
    return (
      <ShareFrame
        ref={ref}
        appName={model.appName}
        headerRight={model.titleLabel}
        totalCaption="この日の学習時間"
        totalLabel={model.totalLabel}
        totalNote={model.sessionCountLabel}
        folderRows={model.folderRows}
        emptyLabel="この日の学習記録はまだありません"
        colorFor={colorFor}
      >
        <View style={{ gap: 8 }}>
          <Text style={caption}>1日のタイムライン</Text>
          <View
            style={{
              height: TIMELINE_HEIGHT,
              borderRadius: radius.sm,
              overflow: 'hidden',
              backgroundColor: colors.surfaceMuted,
            }}
          >
            {model.bands.map((band, i) => (
              <View
                // Sessions have no stable key here and the list is static for one capture.
                key={i}
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: `${band.left * 100}%`,
                  width: `${band.width * 100}%`,
                  minWidth: 2,
                  backgroundColor: colorFor(band.folderId),
                }}
              />
            ))}
          </View>
          <View style={{ height: 16 }}>
            {TIMELINE_AXIS_HOURS.map((hour) => {
              // Labels are centered on their tick; the first / last are pinned to the edges so they never clip.
              const edge = hour === 0 ? 'left' : hour === 24 ? 'right' : null;
              return (
                <Text
                  key={hour}
                  style={{
                    ...caption,
                    position: 'absolute',
                    top: 0,
                    width: 28,
                    textAlign: edge ?? 'center',
                    ...(edge === 'left'
                      ? { left: 0 }
                      : edge === 'right'
                        ? { right: 0 }
                        : { left: `${(hour / 24) * 100}%`, marginLeft: -14 }),
                  }}
                >
                  {`${hour}時`}
                </Text>
              );
            })}
          </View>
        </View>
      </ShareFrame>
    );
  },
);
