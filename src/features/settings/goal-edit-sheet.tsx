import { useState } from 'react';
import { Text, View } from 'react-native';

import { BottomSheet, Button, TextField } from '@/components/form-ui';
import { fontFamily, typography, useTheme } from '@/design';
import type { Goal } from '@/db/repositories';
import {
  formatExamDateInput,
  GOAL_LIMITS,
  parseExamDateInput,
  validateGoal,
  type GoalInput,
} from '@/domain/goal';

export type GoalSection = 'all' | 'qualification' | 'objective' | 'purpose' | 'plan';

const HEADINGS: Record<GoalSection, string> = {
  all: '目標を設定',
  qualification: '資格・試験を編集',
  objective: '達成したい目標を編集',
  purpose: '取得する目的を編集',
  plan: '行動プランを編集',
};

const EMPTY: GoalInput = { title: '', examDate: null, objective: '', purpose: '', actionPlan: '' };

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
        examDate: goal.examDate,
        objective: goal.objective,
        purpose: goal.purpose,
        actionPlan: goal.actionPlan,
      }
    : EMPTY;
  const colors = useTheme();
  const [title, setTitle] = useState(base.title);
  const [dateText, setDateText] = useState(formatExamDateInput(base.examDate));
  const [objective, setObjective] = useState(base.objective);
  const [purpose, setPurpose] = useState(base.purpose);
  const [plan, setPlan] = useState(base.actionPlan);
  const [error, setError] = useState<string | null>(null);

  const dateInvalid = dateText.trim() !== '' && parseExamDateInput(dateText) === null;
  const draft: GoalInput = {
    title,
    examDate: dateText.trim() === '' ? null : parseExamDateInput(dateText),
    objective,
    purpose,
    actionPlan: plan,
  };
  const show = (s: GoalSection) => section === 'all' || section === s;

  const submit = () => {
    if (dateInvalid || !validateGoal(draft)) return;
    try {
      onSave(draft);
      onClose();
    } catch {
      setError('目標を保存できませんでした');
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={{ fontFamily: fontFamily.extraBold, ...typography.heading, color: colors.textPrimary }}>
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
            <TextField
              label="受験日"
              value={dateText}
              onChangeText={setDateText}
              placeholder="YYYY-MM-DD（未定なら空欄）"
              keyboardType="numbers-and-punctuation"
              maxLength={10}
            />
            {dateInvalid ? (
              <Text
                accessibilityRole="alert"
                style={{ fontFamily: fontFamily.bold, ...typography.caption, color: colors.danger }}
              >
                実在する日付を YYYY-MM-DD で入力してください
              </Text>
            ) : null}
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
      <Button label="保存" onPress={submit} disabled={dateInvalid || !validateGoal(draft)} />
    </BottomSheet>
  );
}
