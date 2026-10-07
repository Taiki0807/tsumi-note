import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { Button, IconButton } from '@/components/form-ui';
import { Icon } from '@/components/icons';
import { fontFamily, radius, typography, useTheme } from '@/design';

import { formatNextDue } from './review-session';
import { useReviewOverview } from './use-review';

/**
 * Figma 07 Card/今日の復習 (primarySoft card, radius 20, padding 18, gap 16): icon tile, label,
 * due count, settings button and 「復習を始める」. Shown at the top of the 復習 tab.
 * The empty states (no questions / nothing due) are not designed; they reuse the same card.
 */
export function ReviewStartCard({ onStart, refreshKey }: { onStart: () => void; refreshKey: unknown }) {
  const colors = useTheme();
  const overview = useReviewOverview(refreshKey);
  if (!overview) return null;

  const ready = overview.status === 'ready';
  return (
    <View style={{ gap: 16, padding: 18, borderRadius: 20, backgroundColor: colors.primarySoft }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: radius.lg,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.primary,
          }}
        >
          <Icon name="cards" size={26} color={colors.textOnPrimary} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            style={{
              fontFamily: fontFamily.extraBold,
              ...typography.label,
              lineHeight: 18,
              color: colors.primary,
            }}
          >
            今日の復習
          </Text>
          {ready ? (
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
              <Text
                style={{
                  fontFamily: fontFamily.extraBold,
                  fontSize: 32,
                  lineHeight: 36,
                  color: colors.textPrimary,
                }}
              >
                {overview.dueCount}
              </Text>
              <Text
                style={{
                  fontFamily: fontFamily.extraBold,
                  ...typography.bodySm,
                  lineHeight: 20,
                  color: colors.textPrimary,
                }}
              >
                問が復習待ち
              </Text>
            </View>
          ) : (
            <Text
              style={{
                fontFamily: fontFamily.extraBold,
                ...typography.bodySm,
                lineHeight: 20,
                color: colors.textPrimary,
              }}
            >
              {overview.status === 'no-questions'
                ? '復習できる問題がありません'
                : overview.nextDueAt === undefined
                  ? '今は復習する問題がありません'
                  : `次の復習は${formatNextDue(overview.nextDueAt, overview.at)}です`}
            </Text>
          )}
        </View>
        <IconButton
          name="settings"
          label="復習設定"
          tone="surface"
          onPress={() => router.push('/review/settings')}
        />
      </View>
      {ready ? (
        <>
          <Button label="復習を始める" onPress={onStart} />
          <Text
            style={{
              textAlign: 'center',
              fontFamily: fontFamily.bold,
              ...typography.caption,
              color: colors.primary,
            }}
          >
            期限の近い順に出題します
          </Text>
        </>
      ) : null}
    </View>
  );
}
