import { forwardRef, type ReactNode } from 'react';
import { Text, View, type HostInstance } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { AppIcon } from '@/components/app-icon';
import { fontFamily } from '@/design';

import { formatDuration, SHARE_IMAGE, type DayShareModel, type ShareFolderRow, type ShareModel } from './share-model';

type ColorFor = (folderId: string | null) => string;

/** Figma 04 · App Store (1日 437:4304 / 1週間 437:4359) is drawn in 1080x1350 px; the view is laid out at 1/3 (pt) and captured at 3x. */
const u = (px: number) => px / 3;

/**
 * Colors of the share card. Fixed on purpose: the Figma card is a brand artwork (purple gradient + white card)
 * that looks the same in light and dark, so it does not follow the app theme.
 */
const SHARE_COLORS = {
  gradientFrom: '#7a5cff',
  gradientTo: '#4028be',
  card: '#ffffff',
  text: '#212121',
  textMuted: '#6b6b73',
  divider: '#eceBf2',
  chipBg: '#f0edff',
  chipText: '#4028be',
  hashtag: '#cbeb4d',
  other: '#6b6b73',
} as const;

const CARD_SHADOW = {
  shadowColor: '#1a0a59',
  shadowOpacity: 0.28,
  shadowOffset: { width: 0, height: u(24) },
  shadowRadius: u(60) / 2,
} as const;

/** Background: Figma linear gradient (handles (-0.12, 0.16) → (0.68, 0.76)) with two faint white glows. */
function Background() {
  return (
    <Svg
      width={SHARE_IMAGE.width}
      height={SHARE_IMAGE.height}
      viewBox={`0 0 ${SHARE_IMAGE.width} ${SHARE_IMAGE.height}`}
      style={{ position: 'absolute', left: 0, top: 0 }}
    >
      <Defs>
        <LinearGradient id="bg" x1="-0.12" y1="0.16" x2="0.68" y2="0.76">
          <Stop offset="0" stopColor={SHARE_COLORS.gradientFrom} />
          <Stop offset="1" stopColor={SHARE_COLORS.gradientTo} />
        </LinearGradient>
      </Defs>
      <Rect width={SHARE_IMAGE.width} height={SHARE_IMAGE.height} fill="url(#bg)" />
    </Svg>
  );
}

function Chip({ children }: { children: string }) {
  return (
    <View
      style={{
        backgroundColor: SHARE_COLORS.chipBg,
        borderRadius: 999,
        paddingHorizontal: u(24),
        paddingVertical: u(12),
      }}
    >
      <Text
        style={{
          fontFamily: fontFamily.extraBold,
          fontSize: u(28),
          lineHeight: u(33.6),
          color: SHARE_COLORS.chipText,
        }}
      >
        {children}
      </Text>
    </View>
  );
}

function BreakdownRows({
  rows,
  colorFor,
  fontSize,
  gap,
  emptyLabel,
}: {
  rows: ShareFolderRow[];
  colorFor: ColorFor;
  fontSize: number;
  gap: number;
  emptyLabel: string;
}) {
  return (
    <View style={{ gap: u(gap) }}>
      {rows.map((row) => (
        <View
          key={row.isOther ? 'other' : (row.folderId ?? 'none')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: u(18) }}
        >
          <View
            style={{
              width: u(22),
              height: u(22),
              borderRadius: u(11),
              backgroundColor: row.isOther ? SHARE_COLORS.other : colorFor(row.folderId),
            }}
          />
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              fontFamily: fontFamily.bold,
              fontSize: u(fontSize),
              lineHeight: u(fontSize * 1.2),
              color: SHARE_COLORS.text,
            }}
          >
            {row.name}
          </Text>
          <Text
            style={{
              fontFamily: fontFamily.extraBold,
              fontSize: u(fontSize),
              lineHeight: u(fontSize * 1.2),
              color: SHARE_COLORS.text,
            }}
          >
            {row.durationLabel}
          </Text>
        </View>
      ))}
      {rows.length === 0 && (
        <Text
          style={{
            fontFamily: fontFamily.bold,
            fontSize: u(fontSize),
            lineHeight: u(fontSize * 1.2),
            color: SHARE_COLORS.textMuted,
          }}
        >
          {emptyLabel}
        </Text>
      )}
    </View>
  );
}

/** "9時間40分" → numbers 130/180px, units 42/57.6px (baseline aligned). */
function BigTime({ label, numberSize, unitSize }: { label: string; numberSize: number; unitSize: number }) {
  const parts = label.match(/(\d+|[^\d]+)/g) ?? [label];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: u(6) }}>
      {parts.map((part, i) => {
        const isNumber = /^\d+$/.test(part);
        const size = isNumber ? numberSize : unitSize;
        return (
          <Text
            key={i}
            style={{
              fontFamily: isNumber ? fontFamily.numeric : fontFamily.extraBold,
              fontSize: u(size),
              lineHeight: u(size),
              color: SHARE_COLORS.text,
            }}
          >
            {part}
          </Text>
        );
      })}
    </View>
  );
}

/**
 * Common layout of every share image (Figma 04 · App Store): fixed 360x450 pt (= 1080x1350 px at 3x) placed outside
 * the visible area. Gradient background, header (brand + date pill), one white card (`children`) and the footer.
 */
const ShareFrame = forwardRef<
  HostInstance,
  { pill: string; hashtag: string; cardGap: number; cardPaddingTop: number; children: ReactNode }
>(function ShareFrame({ pill, hashtag, cardGap, cardPaddingTop, children }, ref) {
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
        overflow: 'hidden',
        padding: u(72),
        gap: u(40),
      }}
    >
      <Background />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: u(20) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: u(18) }}>
          <AppIcon size={u(60)} cornerRadius={44} />
          <Text
            style={{
              fontFamily: fontFamily.extraBold,
              fontSize: u(40),
              lineHeight: u(48),
              color: '#ffffff',
            }}
          >
            つみノート
          </Text>
        </View>
        <View
          style={{
            flexShrink: 1,
            backgroundColor: 'rgba(255,255,255,0.18)',
            borderRadius: 999,
            paddingHorizontal: u(24),
            paddingVertical: u(10),
          }}
        >
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{ fontFamily: fontFamily.extraBold, fontSize: u(30), lineHeight: u(36), color: '#ffffff' }}
          >
            {pill}
          </Text>
        </View>
      </View>

      <View
        style={{
          backgroundColor: SHARE_COLORS.card,
          borderRadius: u(48),
          paddingHorizontal: u(56),
          paddingTop: u(cardPaddingTop),
          paddingBottom: u(cardPaddingTop),
          gap: u(cardGap),
          ...CARD_SHADOW,
        }}
      >
        {children}
      </View>

      <View style={{ gap: u(8) }}>
        <Text
          style={{ fontFamily: fontFamily.extraBold, fontSize: u(38), lineHeight: u(45.6), color: SHARE_COLORS.hashtag }}
        >
          {hashtag}
        </Text>
        <Text
          style={{
            fontFamily: fontFamily.bold,
            fontSize: u(26),
            lineHeight: u(31.2),
            color: '#ffffff',
            opacity: 0.8,
          }}
        >
          つみノートで記録中
        </Text>
      </View>
    </View>
  );
});

const BAR_MAX = 269; // px, tallest stack in Figma (木)
const BAR_RADIUS = 14;

/** Weekly share image (Figma 437:4359): label + 1日平均 chip, big total, stacked bars per weekday, folder rows. */
export const ShareImageView = forwardRef<HostInstance, { model: ShareModel; colorFor: ColorFor }>(
  function ShareImageView({ model, colorFor }, ref) {
    const average = formatDuration(Math.floor(model.totalSeconds / 7));
    return (
      <ShareFrame ref={ref} pill={model.periodLabel} hashtag="#今週の積み上げ" cardGap={24} cardPaddingTop={44}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text
            style={{ fontFamily: fontFamily.extraBold, fontSize: u(34), lineHeight: u(40.8), color: SHARE_COLORS.textMuted }}
          >
            {`${model.scopeLabel === 'すべて' ? '今週' : model.scopeLabel}の学習時間`}
          </Text>
          <Chip>{`1日平均 ${average}`}</Chip>
        </View>
        <BigTime label={model.totalLabel} numberSize={130} unitSize={42} />
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: u(18) }}>
          {model.bars.map((bar) => (
            <View key={bar.weekday} style={{ flex: 1, alignItems: 'center', gap: u(12) }}>
              <View
                style={{
                  height: u(BAR_MAX),
                  justifyContent: 'flex-end',
                  alignSelf: 'stretch',
                }}
              >
                <View
                  style={{
                    height: Math.max(0, bar.ratio * u(BAR_MAX)),
                    borderRadius: u(BAR_RADIUS),
                    overflow: 'hidden',
                    flexDirection: 'column-reverse',
                  }}
                >
                  {bar.segments.map((s) => (
                    <View
                      key={s.folderId ?? 'none'}
                      style={{ height: s.ratio * bar.ratio * u(BAR_MAX), backgroundColor: colorFor(s.folderId) }}
                    />
                  ))}
                </View>
              </View>
              <Text
                style={{
                  fontFamily: fontFamily.extraBold,
                  fontSize: u(28),
                  lineHeight: u(34),
                  color: SHARE_COLORS.textMuted,
                }}
              >
                {bar.weekday}
              </Text>
            </View>
          ))}
        </View>
        <BreakdownRows
          rows={model.folderRows}
          colorFor={colorFor}
          fontSize={32}
          gap={14}
          emptyLabel="この週の学習記録はまだありません"
        />
      </ShareFrame>
    );
  },
);

/** Daily share image (Figma 437:4304): label, big total, proportional split bar, folder rows, divider, session chip. */
export const DayShareImageView = forwardRef<HostInstance, { model: DayShareModel; colorFor: ColorFor }>(
  function DayShareImageView({ model, colorFor }, ref) {
    const total = model.folderRows.reduce((sum, r) => sum + r.seconds, 0);
    return (
      <ShareFrame ref={ref} pill={model.dateLabel} hashtag="#今日の積み上げ" cardGap={30} cardPaddingTop={52}>
        <Text
          style={{ fontFamily: fontFamily.extraBold, fontSize: u(34), lineHeight: u(40.8), color: SHARE_COLORS.textMuted }}
        >
          今日の学習時間
        </Text>
        <BigTime label={model.totalLabel} numberSize={180} unitSize={57.6} />
        {total > 0 && (
          <View style={{ flexDirection: 'row', gap: u(6) }}>
            {model.folderRows.map((row) => (
              <View
                key={row.isOther ? 'other' : (row.folderId ?? 'none')}
                style={{
                  flex: row.seconds / total,
                  height: u(24),
                  borderRadius: u(12),
                  backgroundColor: row.isOther ? SHARE_COLORS.other : colorFor(row.folderId),
                }}
              />
            ))}
          </View>
        )}
        <BreakdownRows
          rows={model.folderRows}
          colorFor={colorFor}
          fontSize={36}
          gap={22}
          emptyLabel="この日の学習記録はまだありません"
        />
        <View style={{ height: u(2), backgroundColor: SHARE_COLORS.divider }} />
        <View style={{ flexDirection: 'row', gap: u(16) }}>
          <Chip>{model.sessionCountLabel}</Chip>
        </View>
      </ShareFrame>
    );
  },
);
