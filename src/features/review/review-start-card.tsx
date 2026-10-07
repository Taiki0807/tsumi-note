import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { Button, EmptyState, IconButton } from '@/components/form-ui';
import { fontFamily, radius, typography, useTheme } from '@/design';

import { formatNextDue } from './review-session';
import { useReviewOverview } from './use-review';

/**
 * Review home entry (not designed in Figma; built from the Card / Button / EmptyState patterns).
 * Shown at the top of the 復習 tab. Distinguishes "no questions yet" from "nothing due now".
 */
export function ReviewStartCard({ onStart, refreshKey }: { onStart: () => void; refreshKey: unknown }) {
  const colors = useTheme();
  const overview = useReviewOverview(refreshKey);
  if (!overview) return null;

  return (
    <View
      style={{
        gap: 12,
        padding: 20,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.divider,
        backgroundColor: colors.surface,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text
          style={{ fontFamily: fontFamily.extraBold, ...typography.headingSm, color: colors.textPrimary }}
        >
          今日の復習
        </Text>
        <IconButton name="settings" label="復習設定" onPress={() => router.push('/review/settings')} />
      </View>
      {overview.status === 'ready' ? (
        <>
          <View style={{ gap: 2 }}>
            <Text style={{ fontFamily: fontFamily.extraBold, ...typography.label, color: colors.primary }}>
              復習待ち {overview.dueCount}問
            </Text>
            <Text style={{ fontFamily: fontFamily.bold, ...typography.caption, color: colors.textSecondary }}>
              今回は{overview.sessionCount}問を期限の近い順に出題します
            </Text>
          </View>
          <Button label="復習を始める" onPress={onStart} />
        </>
      ) : overview.status === 'no-questions' ? (
        <EmptyState
          icon="cards"
          title="復習できる問題がありません"
          description="フォルダーに問題を追加すると、ここから復習できます"
        />
      ) : (
        <EmptyState
          icon="check"
          title="今は復習する問題がありません"
          description={
            overview.nextDueAt === undefined
              ? '復習予定が来るとここに表示されます'
              : `次の復習は${formatNextDue(overview.nextDueAt, overview.at)}です`
          }
        />
      )}
    </View>
  );
}
