import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { BottomSheet, Button, TextField } from '@/components/form-ui';
import { Icon } from '@/components/icons';
import { fontFamily, radius, typography, useTheme } from '@/design';
import type { Goal } from '@/db/repositories';
import { formatExamDate, GOAL_LIMITS, planEditText, validateGoal, type GoalInput } from '@/domain/goal';

import { ExamDateCalendar } from './exam-date-calendar';

export type GoalSection = 'all' | 'qualification' | 'objective' | 'purpose' | 'plan';

const HEADINGS: Record<GoalSection, string> = {
  all: '目標を設定',
  qualification: '資格・試験を編集',
  objective: '達成したい目標を編集',
  purpose: '取得する目的を編集',
  plan: '行動プランを編集',
};

const EMPTY: GoalInput = { title: '', examDay: null, objective: '', purpose: '', actionPlan: '' };

/**
 * Create / edit form. 目標作成・編集 is not designed in Figma (PRODUCT_SPEC §8), so it reuses the
 * existing BottomSheet / TextField / Button components. Each pencil in Figma 06 edits one section.
 */
export function GoalEditSheet({
  visible,
  section,
  goal,
  onClose,
  onSave,
}: {
  visible: boolean;
  section: GoalSection;
  goal: Goal | undefined;
  onClose: () => void;
  onSave: (input: GoalInput) => void;
}) {
  // Re-mounted per open (see `key` at the call site) so the draft always starts from the stored goal.
  const base: GoalInput = goal
    ? {
        title: goal.title,
        examDay: goal.examDay,
        objective: goal.objective,
        purpose: goal.purpose,
        // Check markers are stored with the plan; the form edits plain lines and keeps the states.
        actionPlan: planEditText(goal.actionPlan),
      }
    : EMPTY;
  const colors = useTheme();
  const [title, setTitle] = useState(base.title);
  const [examDay, setExamDay] = useState(base.examDay ?? null);
  // Only an explicit pick sends the exam day; otherwise the stored value (even an unresolved legacy one) is kept.
  const [dateTouched, setDateTouched] = useState(false);
  const [pickingDate, setPickingDate] = useState(false);
  const [now] = useState(() => Date.now());
  const [objective, setObjective] = useState(base.objective);
  const [purpose, setPurpose] = useState(base.purpose);
  const [plan, setPlan] = useState(base.actionPlan);
  const [error, setError] = useState<string | null>(null);

  const draft: GoalInput = {
    title,
    ...(dateTouched ? { examDay } : {}),
    objective,
    purpose,
    actionPlan: plan,
  };
  const show = (s: GoalSection) => section === 'all' || section === s;

  const submit = () => {
    if (!validateGoal(draft)) return;
    try {
      onSave(draft);
      onClose();
    } catch {
      setError('目標を保存できませんでした');
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      {pickingDate ? (
        // Shown inside this same sheet (no nested Modal); cancelling returns with the date untouched.
        <ExamDateCalendar
          value={examDay}
          now={now}
          onCancel={() => setPickingDate(false)}
          onConfirm={(day) => {
            setExamDay(day);
            setDateTouched(true);
            setPickingDate(false);
          }}
        />
      ) : (
        <>
          <Text
            style={{ fontFamily: fontFamily.extraBold, ...typography.heading, color: colors.textPrimary }}
          >
            {HEADINGS[section]}
          </Text>
          <View style={{ gap: 14 }}>
            {show('qualification') ? (
              <>
                <TextField
                  label="資格 / 試験名"
                  value={title}
                  onChangeText={setTitle}
                  placeholder="例：日商簿記2級"
                  maxLength={GOAL_LIMITS.title}
                />
                <View style={{ gap: 8 }}>
                  <Text
                    style={{
                      fontFamily: fontFamily.extraBold,
                      ...typography.bodySm,
                      color: colors.textPrimary,
                    }}
                  >
                    受験日
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`受験日 ${examDay ? formatExamDate(examDay) : '未設定'}`}
                    onPress={() => setPickingDate(true)}
                    style={{
                      height: 52,
                      paddingHorizontal: 16,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      borderWidth: 1.5,
                      borderColor: colors.border,
                      borderRadius: radius.md,
                      backgroundColor: colors.surfaceMuted,
                    }}
                  >
                    <Icon name="calendar" size={20} color={colors.primary} />
                    <Text
                      style={{
                        flex: 1,
                        fontFamily: fontFamily.regular,
                        fontSize: typography.button.fontSize,
                        lineHeight: typography.button.lineHeight,
                        color: examDay ? colors.textPrimary : colors.textPlaceholder,
                      }}
                    >
                      {examDay
                        ? formatExamDate(examDay)
                        : !dateTouched && goal && goal.examDate !== null
                          ? '以前の受験日を確定できません。再選択してください'
                          : '日付を選択（未定なら空欄）'}
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : null}
            {show('objective') ? (
              <TextField
                label="達成したい目標"
                value={objective}
                onChangeText={setObjective}
                multiline
                maxLength={GOAL_LIMITS.objective}
              />
            ) : null}
            {show('purpose') ? (
              <TextField
                label="取得する目的"
                value={purpose}
                onChangeText={setPurpose}
                multiline
                maxLength={GOAL_LIMITS.purpose}
              />
            ) : null}
            {show('plan') ? (
              <TextField
                label="行動プラン（1行に1つ）"
                value={plan}
                onChangeText={setPlan}
                multiline
                placeholder={'平日30分、問題を解く\n週末に1週間の復習'}
              />
            ) : null}
          </View>
          {error ? (
            <Text
              accessibilityRole="alert"
              style={{ fontFamily: fontFamily.bold, ...typography.caption, color: colors.danger }}
            >
              {error}
            </Text>
          ) : null}
          <Button label="保存" onPress={submit} disabled={!validateGoal(draft)} />
        </>
      )}
    </BottomSheet>
  );
}
