import { useState } from 'react';
import { Text, View } from 'react-native';

import { BottomSheet, Button, TextField } from '@/components/form-ui';
import { Icon } from '@/components/icons';
import { fontFamily, radius, typography, useTheme } from '@/design';
import { isBlank, ValidationError } from '@/domain/validation';

type Props = {
  visible: boolean;
  /** `undefined` = create a new folder; otherwise rename this one. */
  initialName?: string;
  onSubmit: (name: string) => void;
  onClose: () => void;
};

/** Figma 12 フォルダー作成 › Bottom sheet. Rename reuses it (not designed in Figma). */
export function FolderFormSheet({ visible, initialName, onSubmit, onClose }: Props) {
  // Remount the body per open so the input always starts from `initialName`.
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      {visible && <FolderForm initialName={initialName} onSubmit={onSubmit} onClose={onClose} />}
    </BottomSheet>
  );
}

function FolderForm({ initialName, onSubmit, onClose }: Omit<Props, 'visible'>) {
  const colors = useTheme();
  const editing = initialName !== undefined;
  const [name, setName] = useState(initialName ?? '');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    try {
      onSubmit(name);
      onClose();
    } catch (e) {
      if (e instanceof ValidationError) setError(e.message);
      else throw e;
    }
  };

  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: radius.md,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.primarySoft,
          }}
        >
          <Icon name="folder" size={26} color={colors.primary} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            style={{
              fontFamily: fontFamily.extraBold,
              ...typography.heading,
              lineHeight: 32,
              color: colors.textPrimary,
            }}
          >
            {editing ? 'フォルダー名を変更' : 'フォルダーを作成'}
          </Text>
          <Text style={{ fontFamily: fontFamily.regular, ...typography.label, color: colors.textSecondary }}>
            科目や資格ごとに問題をまとめます
          </Text>
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <TextField
          label="フォルダー名"
          placeholder="例：韓国語、簿記2級"
          value={name}
          onChangeText={(v) => {
            setName(v);
            setError(null);
          }}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={() => !isBlank(name) && submit()}
        />
        {error && (
          <Text
            accessibilityRole="alert"
            style={{ fontFamily: fontFamily.bold, ...typography.caption, color: colors.danger }}
          >
            {error}
          </Text>
        )}
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Button label="キャンセル" variant="secondary" onPress={onClose} flex />
        <Button label={editing ? '保存' : '作成'} onPress={submit} disabled={isBlank(name)} flex />
      </View>
    </>
  );
}
