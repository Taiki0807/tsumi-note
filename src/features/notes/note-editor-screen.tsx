import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, EmptyState, IconButton } from '@/components/form-ui';
import { Icon, type IconName } from '@/components/icons';
import { fontFamily, layout, radius, typography, useTheme } from '@/design';
import { insertSnippet, toggleChecklistLine, toggleLinePrefix, type TextEdit } from '@/domain/markdown';
import { FolderPickerSheet } from '@/features/timer/folder-picker-sheet';

import { MarkdownView } from './markdown-view';
import { formatNoteTime, noteDisplayTitle } from './note-format';
import { useNoteEditor } from './use-notes';

const AUTOSAVE_DELAY_MS = 600;

const TOOLS: { icon: IconName; label: string; apply: (body: string, cursor: number) => TextEdit }[] = [
  { icon: 'plus', label: 'ブロックを追加', apply: (b, c) => toggleLinePrefix(b, c, '- ') },
  { icon: 'heading', label: '見出し', apply: (b, c) => toggleLinePrefix(b, c, '## ') },
  { icon: 'checklist', label: 'チェックリスト', apply: (b, c) => toggleLinePrefix(b, c, '- [ ] ') },
  { icon: 'link', label: 'リンク', apply: (b, c) => insertSnippet(b, c, '[](https://)', 1) },
  { icon: 'code', label: 'コード', apply: (b, c) => insertSnippet(b, c, '``', 1) },
  { icon: 'more', label: 'その他の書式', apply: (b, c) => toggleLinePrefix(b, c, '> ') },
];

/** Figma 04 ノート詳細: title, folder chip, Markdown body, format toolbar; saves automatically. */
export function NoteEditorScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string; folderId?: string }>();
  const routeId = params.id === 'new' ? undefined : params.id;
  const editor = useNoteEditor(routeId);
  const { detail, folders } = editor;

  const [title, setTitle] = useState(detail?.note.title ?? '');
  const [body, setBody] = useState(detail?.note.body ?? '');
  const [folderId, setFolderId] = useState<string | null>(
    detail
      ? detail.note.folderId
      : folders.some((f) => f.id === params.folderId)
        ? (params.folderId ?? null)
        : null,
  );
  const [pinned, setPinned] = useState(detail?.note.pinned ?? false);
  const [updatedAt, setUpdatedAt] = useState<number | undefined>(detail?.note.updatedAt);
  const [saved, setSaved] = useState(true);
  const [editingBody, setEditingBody] = useState(body === '');
  const [pickingFolder, setPickingFolder] = useState(false);
  const selection = useRef(body.length);
  const [sel, setSel] = useState<{ start: number; end: number } | undefined>(undefined);
  const bodyInput = useRef<TextInput>(null);

  // Everything the debounced / unmount save needs lives in refs so it never sees stale state.
  const noteId = useRef<string | undefined>(routeId);
  const latest = useRef({ title, body, folderId });
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saveRef = useRef(editor.save);
  useEffect(() => {
    saveRef.current = editor.save;
  });

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    noteId.current = saveRef.current(noteId.current, latest.current);
    if (noteId.current) setUpdatedAt(Date.now());
    setSaved(true);
  }, []);

  const change = (next: Partial<typeof latest.current>) => {
    latest.current = { ...latest.current, ...next };
    dirty.current = true;
    setSaved(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, AUTOSAVE_DELAY_MS);
  };

  // Leaving the screen (back gesture included) writes any pending change.
  useEffect(() => flush, [flush]);

  const updateTitle = (value: string) => {
    setTitle(value);
    change({ title: value });
  };
  const updateBody = (value: string) => {
    setBody(value);
    change({ body: value });
  };
  const updateFolder = (value: string | null) => {
    setFolderId(value);
    change({ folderId: value });
  };

  const applyTool = (apply: (body: string, cursor: number) => TextEdit) => {
    const edit = apply(body, selection.current);
    selection.current = edit.cursor;
    updateBody(edit.text);
    setSel({ start: edit.cursor, end: edit.cursor });
  };

  const confirmDelete = () =>
    Alert.alert('このノートを削除しますか？', noteDisplayTitle(title), [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: () => {
          clearTimeout(timer.current);
          dirty.current = false;
          if (noteId.current) editor.deleteNote(noteId.current);
          router.back();
        },
      },
    ]);

  const openMenu = () => {
    const id = noteId.current;
    Alert.alert(noteDisplayTitle(title), undefined, [
      ...(id
        ? [
            {
              text: pinned ? 'ピン留めを解除' : 'ピン留め',
              onPress: () => {
                flush();
                editor.setPinned(id, !pinned);
                setPinned(!pinned);
              },
            },
          ]
        : []),
      { text: '科目を変更', onPress: () => setPickingFolder(true) },
      { text: '削除', style: 'destructive' as const, onPress: id ? confirmDelete : () => router.back() },
      { text: 'キャンセル', style: 'cancel' as const },
    ]);
  };

  if (routeId && !detail) {
    // Deleted (or never existed): nothing to edit but a way back.
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          backgroundColor: colors.background,
          paddingHorizontal: 24,
        }}
      >
        <EmptyState icon="note" title="ノートが見つかりません" description="削除されたか、存在しません" />
        <Button label="戻る" variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }

  const folder = folders.find((f) => f.id === folderId);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}
    >
      <View
        style={{
          height: 64,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingLeft: 12,
          paddingRight: 16,
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
          ノート
        </Text>
        {saved && updatedAt ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon name="check" size={14} color={colors.successText} strokeWidth={1.75} />
            <Text
              style={{ fontFamily: fontFamily.extraBold, ...typography.caption, color: colors.successText }}
            >
              保存済み
            </Text>
          </View>
        ) : null}
        <IconButton name="more" label="ノートの操作" onPress={openMenu} />
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          alignSelf: 'center',
          width: '100%',
          maxWidth: layout.contentMaxWidth,
          gap: 18,
          paddingTop: 8,
          paddingHorizontal: 24,
          paddingBottom: 24,
        }}
      >
        <View style={{ gap: 10 }}>
          <TextInput
            accessibilityLabel="タイトル"
            value={title}
            onChangeText={updateTitle}
            placeholder="タイトル"
            placeholderTextColor={colors.textPlaceholder}
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => {
              setEditingBody(true);
              bodyInput.current?.focus();
            }}
            style={{
              padding: 0,
              fontFamily: fontFamily.extraBold,
              ...typography.title,
              color: colors.textPrimary,
            }}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`科目: ${folder?.name ?? '未分類'}`}
              onPress={() => setPickingFolder(true)}
              style={{
                height: 28,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 12,
                borderRadius: radius.full,
                backgroundColor: colors.primarySoft,
              }}
            >
              <Icon name="folder" size={16} color={colors.textPrimary} strokeWidth={1.8} />
              <Text style={{ fontFamily: fontFamily.extraBold, ...typography.label, color: colors.primary }}>
                {folder?.name ?? '未分類'}
              </Text>
            </Pressable>
            <View style={{ flex: 1 }} />
            {updatedAt ? (
              <Text
                style={{ fontFamily: fontFamily.bold, ...typography.caption, color: colors.textSecondary }}
              >
                {formatNoteTime(updatedAt)} 更新
              </Text>
            ) : null}
          </View>
        </View>
        {editingBody ? (
          <TextInput
            ref={bodyInput}
            accessibilityLabel="Markdown本文"
            value={body}
            onChangeText={updateBody}
            selection={sel}
            onSelectionChange={(e) => {
              selection.current = e.nativeEvent.selection.end;
              setSel(e.nativeEvent.selection);
            }}
            onBlur={() => {
              if (body.trim() !== '') setEditingBody(false);
            }}
            placeholder="Markdownで書く"
            placeholderTextColor={colors.textPlaceholder}
            multiline
            autoFocus={body !== '' || title !== ''}
            textAlignVertical="top"
            autoCapitalize="none"
            style={{
              minHeight: 240,
              padding: 0,
              fontFamily: fontFamily.regular,
              ...typography.body,
              color: colors.textPrimary,
            }}
          />
        ) : (
          <Pressable
            accessibilityLabel="本文を編集"
            onPress={() => setEditingBody(true)}
            style={{ minHeight: 240 }}
          >
            <MarkdownView
              source={body}
              onToggleCheck={(line) => updateBody(toggleChecklistLine(body, line))}
            />
          </Pressable>
        )}
      </ScrollView>
      {editingBody ? (
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            paddingHorizontal: 24,
            paddingTop: 12,
            paddingBottom: Math.max(insets.bottom, 16),
            borderTopWidth: 1,
            borderTopColor: colors.divider,
            backgroundColor: colors.surface,
          }}
        >
          {TOOLS.map((tool, index) => (
            <Pressable
              key={tool.label}
              accessibilityRole="button"
              accessibilityLabel={tool.label}
              onPress={() => applyTool(tool.apply)}
              style={{
                width: 44,
                height: 44,
                borderRadius: radius.xl,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: index === 0 ? colors.primary : colors.surfaceMuted,
              }}
            >
              <Icon
                name={tool.icon}
                size={20}
                color={index === 0 ? colors.textOnPrimary : colors.textPrimary}
                strokeWidth={index === 0 ? 2 : 1.7}
              />
            </Pressable>
          ))}
        </View>
      ) : null}
      <FolderPickerSheet
        visible={pickingFolder}
        folders={folders}
        selectedId={folderId}
        onSelect={updateFolder}
        onClose={() => setPickingFolder(false)}
      />
    </KeyboardAvoidingView>
  );
}
