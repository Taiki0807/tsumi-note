import { useState } from 'react';
import { Text, View } from 'react-native';

import { BottomSheet, Button, TextField } from '@/components/form-ui';
import { Icon } from '@/components/icons';
import { useRepositories } from '@/db/database-provider';
import {
  folderColorLabel,
  folderTone,
  fontFamily,
  nextFolderColorKey,
  normalizeHexColor,
  radius,
  resolveFolderColorKey,
  typography,
  useTheme,
  useThemeName,
  type FolderColorValue,
} from '@/design';
import { isBlank, ValidationError } from '@/domain/validation';

import { FolderColorPicker } from './folder-color-picker';

type Props = {
  visible: boolean;
  /** `undefined` = create a new folder; otherwise rename this one. */
  initialName?: string;
  /** Saved palette key of the folder being edited (create mode: the first palette color is preselected). */
  initialColor?: string | null;
  onSubmit: (name: string, color: FolderColorValue) => void;
  onClose: () => void;
  /** Hint under the title (create mode). Figma 01c (from the timer) words it differently from 12. */
  subtitle?: string;
  /** Create-mode button label. Figma 01c uses 「作成して選択」. */
  submitLabel?: string;
};

/** Figma 12 フォルダー作成 › Bottom sheet. Rename reuses it (not designed in Figma). */
export function FolderFormSheet({ visible, ...rest }: Props) {
  // Remount the body per open so the input always starts from `initialName`.
  return (
    <BottomSheet visible={visible} onClose={rest.onClose}>
      {visible && <FolderForm {...rest} />}
    </BottomSheet>
  );
}

/** Figma 12 › Preview: the folder as it will look (tile in the chosen color, name, 「色名 · 0問」). */
function FolderPreview({ name, color }: { name: string; color: FolderColorValue }) {
  const colors = useTheme();
  const isDark = useThemeName() === 'dark';
  const tone = folderTone(color, colors, isDark);
  const custom = normalizeHexColor(color) !== null;
  return (
    <View
      accessibilityLabel={`プレビュー ${name.trim() || 'フォルダー名'}、${folderColorLabel(color)}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        padding: 14,
        borderRadius: 20,
        borderWidth: 1.5,
        borderColor: `${tone.icon}40`,
        backgroundColor: `${tone.icon}14`,
      }}
    >
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: radius.lg,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: tone.icon,
        }}
      >
        <Icon name="folder" size={26} color="#ffffff" strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: fontFamily.extraBold,
            fontSize: 18,
            lineHeight: 27,
            color: name.trim() ? colors.textPrimary : colors.textSecondary,
          }}
        >
          {name.trim() || 'フォルダー名'}
        </Text>
        <Text
          style={{
            fontFamily: fontFamily.bold,
            fontSize: 12,
            lineHeight: 18,
            color: custom ? tone.label : tone.icon,
          }}
        >
          {folderColorLabel(color)} · 0問
        </Text>
      </View>
    </View>
  );
}

function FolderForm({
  initialName,
  initialColor,
  onSubmit,
  onClose,
  subtitle = '科目や資格ごとに問題をまとめます',
  submitLabel = '作成',
}: Omit<Props, 'visible'>) {
  const colors = useTheme();
  const editing = initialName !== undefined;
  const [name, setName] = useState(initialName ?? '');
  const repos = useRepositories();
  // Create mode preselects the first palette color no live folder uses yet.
  const [color, setColor] = useState<FolderColorValue>(() =>
    editing
      ? resolveFolderColorKey(initialColor, 0)
      : ((initialColor as FolderColorValue | undefined) ??
        nextFolderColorKey(repos.folders.list().map((f) => f.color))),
  );
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    try {
      onSubmit(name, color);
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
            {subtitle}
          </Text>
        </View>
      </View>
      <FolderPreview name={name} color={color} />
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
      <FolderColorPicker value={color} onChange={setColor} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Button label="キャンセル" variant="secondary" onPress={onClose} flex />
        <Button label={editing ? '保存' : submitLabel} onPress={submit} disabled={isBlank(name)} flex />
      </View>
    </>
  );
}
