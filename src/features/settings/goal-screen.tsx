import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ConfirmDeleteSheet, EmptyState, IconButton } from '@/components/form-ui';
import { Icon, type IconName } from '@/components/icons';
import { fontFamily, layout, radius, typography, useTheme } from '@/design';
import { daysUntilExam, formatExamDate, parsePlanItems } from '@/domain/goal';

import { GoalEditSheet, type GoalSection } from './goal-edit-sheet';
import { useGoal } from './use-settings';

/** Figma IconButton/…を編集: 44x44 circle; white 18% on the hero, white on tinted cards. */
function EditButton({
  label,
  onPress,
  onPrimary,
  iconSize,
}: {
  label: string;
  onPress: () => void;
  onPrimary?: boolean;
  iconSize: number;
}) {
  const colors = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: onPrimary ? 'rgba(255,255,255,0.18)' : colors.surface,
      }}
    >
      <Icon
        name="edit"
        size={iconSize}
        color={onPrimary ? colors.textOnPrimary : colors.textSecondary}
        strokeWidth={onPrimary ? 1.8 : 2.2}
      />
    </Pressable>
  );
}

type Tone = 'success' | 'info' | 'warning';

/**
 * Figma Card/…: tinted card (success / info / warning), radius 20, padding 20/16/16/20, gap 8,
 * a 44pt head row (18pt icon + 13/ExtraBold label) with the edit button.
 */
function SectionCard({
  tone,
  icon,
  iconStrokeWidth,
  title,
  editLabel,
  onEdit,
  children,
}: {
  tone: Tone;
  icon: IconName;
  iconStrokeWidth: number;
  title: string;
  editLabel: string;
  onEdit: () => void;
  children: ReactNode;
}) {
  const colors = useTheme();
  const palette = {
    success: { bg: colors.successSoft, icon: colors.success, text: colors.successText },
    info: { bg: colors.infoSoft, icon: colors.info, text: colors.infoText },
    warning: { bg: colors.warningSoft, icon: colors.warning, text: colors.warningText },
  }[tone];
  return (
    <View
      style={{
        gap: 8,
        paddingLeft: 20,
        paddingTop: 16,
        paddingRight: 16,
        paddingBottom: 20,
        borderRadius: 20,
        backgroundColor: palette.bg,
      }}
    >
      <View
        style={{ height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name={icon} size={18} color={palette.icon} strokeWidth={iconStrokeWidth} />
          <Text style={{ fontFamily: fontFamily.extraBold, ...typography.label, color: palette.text }}>
            {title}
          </Text>
        </View>
        <EditButton label={editLabel} onPress={onEdit} iconSize={22} />
      </View>
      {children}
    </View>
  );
}

/** Figma Check/…: 24pt checkbox (radius 8, 2pt primary outline; filled with a white check when done) + 15/Medium text. */
function PlanCheck({ text, done, onToggle }: { text: string; done: boolean; onToggle: () => void }) {
  const colors = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      accessibilityLabel={text}
      onPress={onToggle}
      hitSlop={{ top: 6, bottom: 6 }}
      style={{ minHeight: 24, flexDirection: 'row', alignItems: 'center', gap: 12 }}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: radius.sm,
          borderWidth: 2,
          borderColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: done ? colors.primary : undefined,
        }}
      >
        {done ? <Icon name="check" size={14} color={colors.textOnPrimary} strokeWidth={3} /> : null}
      </View>
      <Text
        style={{
          flex: 1,
          fontFamily: fontFamily.regular,
          ...typography.body,
          color: done ? colors.textSecondary : colors.textPrimary,
        }}
      >
        {text}
      </Text>
    </Pressable>
  );
}

/** Figma 06 目標（マイページから開く詳細）. One active goal; empty state when none. */
export function GoalScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const { goal, save, remove, toggleActionItem } = useGoal();
  const [editing, setEditing] = useState<GoalSection | null>(null);
  const [editKey, setEditKey] = useState(0);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const edit = (section: GoalSection) => {
    setEditKey((k) => k + 1);
    setEditing(section);
  };
  const [now] = useState(() => Date.now());
  const days = goal ? daysUntilExam(goal.examDay, now) : null;
  const plan = goal ? parsePlanItems(goal.actionPlan) : [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <View
        style={{
          height: 64,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingLeft: 12,
          paddingRight: 16,
          paddingTop: 12,
          paddingBottom: 8,
        }}
      >
        <IconButton name="arrow-left" label="戻る" onPress={() => router.back()} />
        <Text
          accessibilityRole="header"
          style={{
            flex: 1,
            fontFamily: fontFamily.extraBold,
            ...typography.headingSm,
            color: colors.textPrimary,
          }}
        >
          目標
        </Text>
      </View>

      {goal ? (
        <ScrollView
          contentContainerStyle={{
            alignSelf: 'center',
            width: '100%',
            maxWidth: layout.contentMaxWidth,
            gap: 14,
            paddingTop: 8,
            paddingHorizontal: 24,
            paddingBottom: Math.max(insets.bottom, 24) + 24,
          }}
        >
          <View
            style={{
              gap: 14,
              paddingLeft: 20,
              paddingTop: 18,
              paddingRight: 20,
              paddingBottom: 20,
              borderRadius: 24,
              backgroundColor: colors.primary,
            }}
          >
            <View
              style={{
                height: 44,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Text
                style={{
                  fontFamily: fontFamily.extraBold,
                  ...typography.bodySm,
                  lineHeight: 24,
                  color: colors.textOnPrimary,
                }}
              >
                取得したい資格
              </Text>
              <EditButton label="資格を編集" onPress={() => edit('qualification')} onPrimary iconSize={18} />
            </View>
            <Text
              accessibilityRole="header"
              style={{
                fontFamily: fontFamily.extraBold,
                fontSize: 30,
                lineHeight: 36,
                color: colors.textOnPrimary,
              }}
            >
              {goal.title}
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderRadius: radius.md,
                backgroundColor: colors.surface,
              }}
            >
              <Icon name="calendar" size={22} color={colors.primary} strokeWidth={2} />
              <View style={{ flex: 1 }}>
                <Text
                  style={{ fontFamily: fontFamily.bold, ...typography.caption, color: colors.textSecondary }}
                >
                  受験予定日
                </Text>
                <Text
                  style={{
                    fontFamily: fontFamily.extraBold,
                    ...typography.button,
                    color: colors.textPrimary,
                  }}
                >
                  {goal.examDay === null ? '未設定' : formatExamDate(goal.examDay)}
                </Text>
              </View>
              {days !== null && days >= 0 ? (
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                  <Text
                    style={{
                      fontFamily: fontFamily.bold,
                      ...typography.caption,
                      color: colors.textSecondary,
                    }}
                  >
                    あと
                  </Text>
                  <Text
                    style={{
                      fontFamily: fontFamily.numeric,
                      fontSize: 22,
                      lineHeight: 26,
                      color: colors.primary,
                    }}
                  >
                    {days}
                  </Text>
                  <Text
                    style={{ fontFamily: fontFamily.extraBold, ...typography.label, color: colors.primary }}
                  >
                    日
                  </Text>
                </View>
              ) : days !== null ? (
                <Text
                  style={{
                    fontFamily: fontFamily.extraBold,
                    ...typography.label,
                    color: colors.textSecondary,
                  }}
                >
                  受験日を過ぎました
                </Text>
              ) : null}
            </View>
          </View>

          <SectionCard
            tone="success"
            icon="target"
            iconStrokeWidth={2.5}
            title="達成したい目標"
            editLabel="達成したい目標を編集"
            onEdit={() => edit('objective')}
          >
            <Text style={{ fontFamily: fontFamily.extraBold, ...typography.body, color: colors.textPrimary }}>
              {goal.objective || '未設定'}
            </Text>
          </SectionCard>

          <SectionCard
            tone="info"
            icon="star"
            iconStrokeWidth={2}
            title="取得する目的"
            editLabel="取得する目的を編集"
            onEdit={() => edit('purpose')}
          >
            <Text style={{ fontFamily: fontFamily.extraBold, ...typography.body, color: colors.textPrimary }}>
              {goal.purpose || '未設定'}
            </Text>
          </SectionCard>

          <SectionCard
            tone="warning"
            icon="checklist"
            iconStrokeWidth={2}
            title="行動プラン"
            editLabel="行動プランを編集"
            onEdit={() => edit('plan')}
          >
            {plan.length === 0 ? (
              <Text
                style={{ fontFamily: fontFamily.extraBold, ...typography.body, color: colors.textPrimary }}
              >
                未設定
              </Text>
            ) : (
              <View style={{ gap: 10 }}>
                {plan.map((item, index) => (
                  <PlanCheck
                    key={`${index}-${item.text}`}
                    text={item.text}
                    done={item.done}
                    onToggle={() => toggleActionItem(index)}
                  />
                ))}
              </View>
            )}
          </SectionCard>

          {/* Figma Button/目標を削除: 44pt text button, 16pt padding, 6pt gap, 18pt trash. */}
          <Pressable
            accessibilityRole="button"
            onPress={() => setConfirmingDelete(true)}
            style={{
              height: 44,
              alignSelf: 'flex-start',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 16,
            }}
          >
            <Icon name="trash" size={18} color={colors.danger} strokeWidth={2} />
            <Text style={{ fontFamily: fontFamily.extraBold, ...typography.bodySm, color: colors.danger }}>
              目標を削除
            </Text>
          </Pressable>
        </ScrollView>
      ) : (
        <View
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 24 }}
        >
          <EmptyState
            icon="target"
            title="目標が設定されていません"
            description="資格・試験名や受験日、行動プランを決めて、学習の道しるべにしましょう。"
          />
          <Button label="目標を設定する" onPress={() => edit('all')} />
        </View>
      )}

      <GoalEditSheet
        key={editKey}
        visible={editing !== null}
        section={editing ?? 'all'}
        goal={goal}
        onClose={() => setEditing(null)}
        onSave={save}
      />
      <ConfirmDeleteSheet
        visible={confirmingDelete && goal !== undefined}
        title="目標を削除しますか？"
        message={`「${goal?.title ?? ''}」の目標と、取得する目的・行動プランが削除されます。学習記録・ノート・問題はそのまま残ります。`}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() => {
          remove();
          setConfirmingDelete(false);
        }}
      />
    </View>
  );
}
