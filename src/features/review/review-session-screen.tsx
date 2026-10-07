import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { Button, IconButton } from '@/components/form-ui';
import { Icon } from '@/components/icons';
import { fontFamily, layout, radius, typography, useTheme, type ThemeColors } from '@/design';
import type { ReviewRating } from '@/domain/fsrs';

import { currentItem, formatCountdown, formatNextDue, summarize, type ActiveSession } from './review-session';
import { Chip, ProgressBar } from './review-ui';
import type { useReviewSession } from './use-review';

type Session = ReturnType<typeof useReviewSession>;

/** Figma 10 復習 › Rate/*: label, fill and border per rating. */
function ratingStyles(
  colors: ThemeColors,
): { rating: ReviewRating; label: string; bg: string; border: string; fg: string }[] {
  return [
    {
      rating: 'again',
      label: 'もう一度',
      bg: colors.dangerSoft,
      border: colors.dangerAccent,
      fg: colors.danger,
    },
    {
      rating: 'hard',
      label: '難しい',
      bg: colors.warningSoft,
      border: colors.warning,
      fg: colors.warningText,
    },
    { rating: 'good', label: '普通', bg: colors.infoSoft, border: colors.info, fg: colors.infoText },
    { rating: 'easy', label: '簡単', bg: colors.successSoft, border: colors.success, fg: colors.successText },
  ];
}

function AppBar() {
  const colors = useTheme();
  return (
    <View
      style={{
        height: 64,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingLeft: 24,
        paddingRight: 16,
        paddingTop: 12,
        paddingBottom: 8,
      }}
    >
      <AppIcon size={32} cornerRadius={50} />
      <Text
        accessibilityRole="header"
        style={{
          flex: 1,
          fontFamily: fontFamily.extraBold,
          ...typography.heading,
          color: colors.textPrimary,
        }}
      >
        復習
      </Text>
      <IconButton name="settings" label="復習設定" onPress={() => router.push('/review/settings')} />
    </View>
  );
}

/** Figma 10 › Time remaining. Shows 時間切れ in the danger colours once the limit has passed. */
function TimeRemaining({ session, state }: { session: Session; state: ActiveSession }) {
  const colors = useTheme();
  if (state.limitMs === null || session.remainingMs === null) return null;
  const timedOut = state.timedOut;
  const answered = state.step === 'answer';
  return (
    <View
      accessibilityRole="timer"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: radius.lg,
        backgroundColor: timedOut ? colors.dangerSoft : colors.successSoft,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: timedOut ? colors.dangerAccent : colors.success,
        }}
      >
        <Icon name="clock" size={22} color={colors.textOnPrimary} strokeWidth={2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily: fontFamily.extraBold,
            ...typography.caption,
            color: timedOut ? colors.danger : colors.successText,
          }}
        >
          {timedOut ? '時間切れ' : '残り時間'}
        </Text>
        <Text
          style={{ fontFamily: fontFamily.numeric, fontSize: 26, lineHeight: 30, color: colors.textPrimary }}
        >
          {formatCountdown(session.remainingMs)}
        </Text>
      </View>
      {!answered ? (
        <Text
          style={{
            fontFamily: fontFamily.bold,
            fontSize: 11,
            lineHeight: 16,
            textAlign: 'right',
            color: colors.successText,
          }}
        >
          {'答えを表示すると\n計測を止めます'}
        </Text>
      ) : null}
    </View>
  );
}

/** Figma 10 › Flashcard: 問題 chip + prompt, then 答え chip + answer once revealed. */
function Flashcard({ state }: { state: ActiveSession }) {
  const colors = useTheme();
  const item = currentItem(state);
  return (
    <View
      style={{
        gap: 16,
        padding: 20,
        minHeight: 248,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.divider,
        backgroundColor: colors.surface,
      }}
    >
      <View style={{ alignItems: 'center', gap: 10, paddingBottom: state.step === 'answer' ? 20 : 0 }}>
        <Chip label="問題" icon="check" background={colors.primarySoft} color={colors.primary} />
        <Text
          accessibilityLabel={`問題: ${item.prompt}`}
          style={{
            fontFamily: fontFamily.extraBold,
            fontSize: 24,
            lineHeight: 32,
            textAlign: 'center',
            color: colors.textPrimary,
          }}
        >
          {item.prompt}
        </Text>
      </View>
      {state.step === 'answer' ? (
        <View style={{ alignItems: 'center', gap: 8, paddingTop: 4 }}>
          <Chip
            label="答え"
            icon="check"
            background={colors.successSoft}
            color={colors.successText}
            iconColor={colors.success}
          />
          <Text
            accessibilityLabel={`答え: ${item.answer}`}
            style={{
              fontFamily: fontFamily.extraBold,
              fontSize: 22,
              lineHeight: 28,
              textAlign: 'center',
              color: colors.primary,
            }}
          >
            {item.answer}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** Figma 10 › Rate/*: 2x2 grid of 166x56 buttons, 10pt gap, 2pt border, radius 16. */
function RatingGrid({ onRate, disabled }: { onRate: (rating: ReviewRating) => void; disabled: boolean }) {
  const colors = useTheme();
  const options = ratingStyles(colors);
  return (
    <View style={{ gap: 10 }}>
      {[options.slice(0, 2), options.slice(2)].map((row) => (
        <View key={row[0]!.rating} style={{ flexDirection: 'row', gap: 10 }}>
          {row.map((o) => (
            <Pressable
              key={o.rating}
              accessibilityRole="button"
              accessibilityLabel={o.label}
              accessibilityState={{ disabled }}
              disabled={disabled}
              onPress={() => onRate(o.rating)}
              style={{
                flex: 1,
                height: 56,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: radius.lg,
                borderWidth: 2,
                borderColor: o.border,
                backgroundColor: o.bg,
                opacity: disabled ? 0.5 : 1,
              }}
            >
              <Text style={{ fontFamily: fontFamily.extraBold, ...typography.button, color: o.fg }}>
                {o.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}

function Question({ session, state }: { session: Session; state: ActiveSession }) {
  const colors = useTheme();
  const item = currentItem(state);
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 28 }}>
        <ProgressBar fraction={(state.index + 1) / state.items.length} />
        <Text style={{ fontFamily: fontFamily.extraBold, ...typography.bodySm, color: colors.textPrimary }}>
          {state.index + 1} / {state.items.length}
        </Text>
        <Chip label={item.folderName} icon="folder" background={colors.primarySoft} color={colors.primary} />
      </View>
      <TimeRemaining session={session} state={state} />
      <Flashcard state={state} />
      {state.step === 'question' ? (
        <Button label="答えを見る" onPress={session.showAnswer} />
      ) : (
        <>
          <Text style={{ fontFamily: fontFamily.extraBold, ...typography.button, color: colors.textPrimary }}>
            どのくらい覚えていましたか？
          </Text>
          <RatingGrid onRate={session.rate} disabled={session.saving} />
          {session.error ? (
            <Text
              accessibilityRole="alert"
              style={{ fontFamily: fontFamily.bold, ...typography.caption, color: colors.danger }}
            >
              {session.error}
            </Text>
          ) : null}
        </>
      )}
      <Pressable
        accessibilityRole="button"
        onPress={session.quit}
        style={{ alignItems: 'center', padding: 8 }}
      >
        <Text style={{ fontFamily: fontFamily.bold, ...typography.caption, color: colors.textSecondary }}>
          復習をやめる
        </Text>
      </Pressable>
    </>
  );
}

/** Not designed in Figma: built from the existing card / stat patterns (PRODUCT_SPEC §12 復習完了). */
function Completion({ session }: { session: Session }) {
  const colors = useTheme();
  if (session.state.status !== 'done') return null;
  const summary = summarize(session.state.outcomes);
  const rows = [
    { label: '解いた問題数', value: `${summary.solved}問` },
    { label: '正答率', value: `${summary.accuracyPercent}%` },
    ...(summary.timedOut > 0 ? [{ label: '時間切れ', value: `${summary.timedOut}問` }] : []),
    {
      label: '次回復習予定',
      value: summary.nextDueAt === undefined ? '-' : formatNextDue(summary.nextDueAt, session.now),
    },
  ];
  return (
    <>
      <View style={{ alignItems: 'center', gap: 8, paddingVertical: 16 }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.successSoft,
          }}
        >
          <Icon name="check" size={32} color={colors.success} strokeWidth={2.4} />
        </View>
        <Text
          accessibilityRole="header"
          style={{ fontFamily: fontFamily.extraBold, ...typography.title, color: colors.textPrimary }}
        >
          復習完了
        </Text>
        <Text style={{ fontFamily: fontFamily.bold, ...typography.bodySm, color: colors.textSecondary }}>
          おつかれさまでした
        </Text>
      </View>
      <View
        style={{
          gap: 14,
          padding: 20,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.divider,
          backgroundColor: colors.surface,
        }}
      >
        {rows.map((row) => (
          <View
            key={row.label}
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <Text style={{ fontFamily: fontFamily.bold, ...typography.bodySm, color: colors.textSecondary }}>
              {row.label}
            </Text>
            <Text
              style={{ fontFamily: fontFamily.numeric, fontSize: 20, lineHeight: 28, color: colors.primary }}
            >
              {row.value}
            </Text>
          </View>
        ))}
        {session.state.skipped > 0 ? (
          <Text
            style={{ fontFamily: fontFamily.regular, ...typography.caption, color: colors.textSecondary }}
          >
            削除された問題{session.state.skipped}問はスキップしました
          </Text>
        ) : null}
      </View>
      <Button label="閉じる" onPress={session.quit} />
    </>
  );
}

/** Figma 10 復習 (問題表示 / 解答表示). Completion is not designed in Figma. */
export function ReviewSessionScreen({ session }: { session: Session }) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const { state } = session;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <AppBar />
      <ScrollView
        contentContainerStyle={{
          alignSelf: 'center',
          width: '100%',
          maxWidth: layout.contentMaxWidth,
          gap: 14,
          paddingTop: 8,
          paddingHorizontal: 24,
          paddingBottom: 24,
        }}
      >
        {state.status === 'active' ? (
          <Question session={session} state={state} />
        ) : (
          <Completion session={session} />
        )}
      </ScrollView>
    </View>
  );
}
