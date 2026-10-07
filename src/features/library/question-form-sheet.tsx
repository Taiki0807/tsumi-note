import { useState } from 'react';
import { Text, View } from 'react-native';

import { BottomSheet, Button, IconButton, TextField } from '@/components/form-ui';
import { Icon } from '@/components/icons';
import { fontFamily, radius, typography, useTheme } from '@/design';
import { isBlank, ValidationError } from '@/domain/validation';

type Props = {
  visible: boolean;
  folderName: string;
  /** Present when editing an existing question. */
  initial?: { prompt: string; answer: string };
  onSubmit: (input: { prompt: string; answer: string }) => void;
  /** Only offered when editing. */
  onDelete?: () => void;
  onClose: () => void;
};

/** Figma 09 問題を作成 (bottom sheet). Editing / deleting reuse it (not designed in Figma). */
export function QuestionFormSheet({ visible, ...rest }: Props) {
  return (
    <BottomSheet visible={visible} onClose={rest.onClose}>
      {visible && <QuestionForm {...rest} />}
    </BottomSheet>
  );
}

function QuestionForm({ folderName, initial, onSubmit, onDelete, onClose }: Omit<Props, 'visible'>) {
  const colors = useTheme();
  const editing = initial !== undefined;
  const [prompt, setPrompt] = useState(initial?.prompt ?? '');
  const [answer, setAnswer] = useState(initial?.answer ?? '');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    try {
      onSubmit({ prompt, answer });
      onClose();
    } catch (e) {
      if (e instanceof ValidationError) setError(e.message);
      else throw e;
    }
  };

  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text
          style={{
            flex: 1,
            fontFamily: fontFamily.extraBold,
            ...typography.heading,
            lineHeight: 32,
            color: colors.textPrimary,
          }}
        >
          {editing ? '問題を編集' : '問題を作成'}
        </Text>
        <IconButton name="close" label="閉じる" onPress={onClose} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontFamily: fontFamily.bold, ...typography.label, color: colors.textSecondary }}>
          保存先
        </Text>
        <View
          style={{
            flexShrink: 1,
            height: 28,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingHorizontal: 12,
            borderRadius: radius.full,
            backgroundColor: colors.primarySoft,
          }}
        >
          <Icon name="folder" size={16} color={colors.primary} strokeWidth={1.5} />
          <Text
            numberOfLines={1}
            style={{
              flexShrink: 1,
              fontFamily: fontFamily.extraBold,
              ...typography.label,
              color: colors.primary,
            }}
          >
            {folderName}
          </Text>
        </View>
      </View>
      <TextField
        label="問題"
        placeholder="例：「꾸준히」の意味は？"
        value={prompt}
        onChangeText={(v) => {
          setPrompt(v);
          setError(null);
        }}
        multiline
      />
      <TextField
        label="答え"
        placeholder="例：こつこつと、着実に"
        value={answer}
        onChangeText={(v) => {
          setAnswer(v);
          setError(null);
        }}
        multiline
      />
      {error && (
        <Text
          accessibilityRole="alert"
          style={{ fontFamily: fontFamily.bold, ...typography.caption, color: colors.danger }}
        >
          {error}
        </Text>
      )}
      <View style={{ gap: 12 }}>
        <Button
          label={editing ? '保存' : '保存して問題一覧へ'}
          onPress={submit}
          disabled={isBlank(prompt) || isBlank(answer)}
        />
        {onDelete && <Button label="この問題を削除" variant="danger" onPress={onDelete} />}
      </View>
    </>
  );
}
