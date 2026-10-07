import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, EmptyState, IconButton } from '@/components/form-ui';
import { Icon, type IconName } from '@/components/icons';
import { fontFamily, layout, radius, typography, useTheme } from '@/design';
import { daysUntilExam, formatExamDate, parseActionPlan } from '@/domain/goal';

import { GoalEditSheet, type GoalSection } from './goal-edit-sheet';
import { useGoal } from './use-settings';

/** Figma IconButton/…を編集: 36x36 (radius 18) pencil. */
function EditButton({
  label,
  onPress,
  onPrimary,
}: {
  label: string;
  onPress: () => void;
  onPrimary?: boolean;
}) {
  const colors = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: onPrimary ? 'rgba(255,255,255,0.2)' : colors.surface,
      }}
    >
      <Icon
        name="edit"
        size={18}
        color={onPrimary ? colors.textOnPrimary : colors.textPrimary}
        strokeWidth={2.2}
      />
    </Pressable>
  );
}

type Tone = 'success' | 'info' | 'warning';

/** Figma Card/…: tinted card (success / info / warning) with an icon + label head and an edit button. */
function SectionCard({
  tone,
  icon,
  title,
  editLabel,
  onEdit,
  children,
}: {
  tone: Tone;
  icon: IconName;
  title: string;
  editLabel: string;
  onEdit: () => void;
  children: ReactNode;
}) {
  const colors = useTheme();
  const palette = {
    success: { bg: colors.successSoft, fg: colors.successText },
    info: { bg: colors.infoSoft, fg: colors.infoText },
    warning: { bg: colors.warningSoft, fg: colors.warningText },
  }[tone];
  return (
    <View style={{ gap: 4, padding: 16, borderRadius: radius.lg, backgroundColor: palette.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name={icon} size={18} color={palette.fg} strokeWidth={2.2} />
          <Text style={{ fontFamily: fontFamily.extraBold, ...typography.label, color: palette.fg }}>
            {title}
          </Text>
        </View>
        <EditButton label={editLabel} onPress={onEdit} />
      </View>
      {children}
    </View>
  );
}

/** Figma 06b 目標を削除（確認）: scrim + 28pt-radius dialog with キャンセル / 削除する. */
function DeleteConfirm({
  title,
  visible,
  onCancel,
  onConfirm,
}: {
  title: string;
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const colors = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          backgroundColor: 'rgba(20,16,48,0.5)',
        }}
      >
        <View
          accessibilityViewIsModal
          style={{
            width: '100%',
            maxWidth: layout.contentMaxWidth,
            gap: 16,
            padding: 24,
            borderRadius: radius['2xl'],
            backgroundColor: colors.surface,
          }}
        >
          <Text
            accessibilityRole="header"
            style={{
              fontFamily: fontFamily.extraBold,
              ...typography.heading,
              lineHeight: 30,
              color: colors.textPrimary,
            }}
          >
            目標を削除しますか？
          </Text>
          <Text style={{ fontFamily: fontFamily.bold, ...typography.bodySm, color: colors.textSecondary }}>
            「{title}
            」の目標と、取得する目的・行動プランが削除されます。学習記録・ノート・問題はそのまま残ります。
          </Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Button label="キャンセル" variant="secondary" flex onPress={onCancel} />
            <Button label="削除する" variant="danger" flex onPress={onConfirm} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Figma 06 目標（マイページから開く詳細）. One active goal; empty state when none. */
export function GoalScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const { goal, save, remove } = useGoal();
  const [editing, setEditing] = useState<GoalSection | null>(null);
  const [editKey, setEditKey] = useState(0);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const edit = (section: GoalSection) => {
    setEditKey((k) => k + 1);
    setEditing(section);
  };
  const [now] = useState(() => Date.now());
  const days = goal ? daysUntilExam(goal.examDate, now) : null;
  const plan = goal ? parseActionPlan(goal.actionPlan) : [];

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
          <View style={{ gap: 12, padding: 20, borderRadius: 24, backgroundColor: colors.primary }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text
                style={{
                  fontFamily: fontFamily.extraBold,
                  ...typography.bodySm,
                  lineHeight: 24,
                  color: colors.primarySoft,
                }}
              >
                取得したい資格
              </Text>
              <EditButton label="資格を編集" onPress={() => edit('qualification')} onPrimary />
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
                justifyContent: 'space-between',
                gap: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderRadius: radius.md,
                backgroundColor: colors.surface,
              }}
            >
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Icon name="calendar" size={20} color={colors.primary} strokeWidth={2.2} />
                <View>
                  <Text
                    style={{
                      fontFamily: fontFamily.bold,
                      ...typography.caption,
                      color: colors.textSecondary,
                    }}
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
                    {goal.examDate === null ? '未設定' : formatExamDate(goal.examDate)}
                  </Text>
                </View>
              </View>
              {days !== null && days >= 0 ? (
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
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
              <View style={{ gap: 10, paddingTop: 6 }}>
                {plan.map((item, index) => (
                  <View
                    key={`${index}-${item}`}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
                  >
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: radius.sm,
                        borderWidth: 2,
                        borderColor: colors.primary,
                      }}
                    />
                    <Text
                      style={{
                        flex: 1,
                        fontFamily: fontFamily.regular,
                        ...typography.body,
                        color: colors.textPrimary,
                      }}
                    >
                      {item}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </SectionCard>

          <Pressable
            accessibilityRole="button"
            onPress={() => setConfirmingDelete(true)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              paddingVertical: 12,
            }}
          >
            <Icon name="trash" size={18} color={colors.danger} strokeWidth={2.2} />
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
      {goal ? (
        <DeleteConfirm
          title={goal.title}
          visible={confirmingDelete}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => {
            remove();
            setConfirmingDelete(false);
          }}
        />
      ) : null}
    </View>
  );
}
