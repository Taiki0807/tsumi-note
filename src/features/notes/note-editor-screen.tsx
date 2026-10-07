import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
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
import { Icon } from '@/components/icons';
import { fontFamily, layout, radius, typography, useTheme } from '@/design';
import { removeSegmentLine, splitEditorSegments, toggleChecklistLine } from '@/domain/markdown';
import {
  applyBlock,
  currentHeadingLevel,
  insertCodeBlock,
  insertImage,
  insertLink,
  toggleInline,
  type BlockKind,
  type FormatEdit,
  type InlineMarker,
  type Selection,
} from '@/domain/markdown-format';
import { FolderPickerSheet } from '@/features/timer/folder-picker-sheet';

import { MarkdownView, NoteImage } from './markdown-view';
import { formatNoteTime, noteDisplayTitle } from './note-format';
import { OptionSheet, type SheetOption } from './option-sheet';
import { useNoteEditor } from './use-notes';

const AUTOSAVE_DELAY_MS = 600;

type SheetName = 'block' | 'heading' | 'more';

const HEADING_OPTIONS: { key: string; label: string; level: number }[] = [
  { key: 'body', label: '本文', level: 0 },
  { key: 'heading1', label: '見出し1', level: 1 },
  { key: 'heading2', label: '見出し2', level: 2 },
  { key: 'heading3', label: '見出し3', level: 3 },
];

const BLOCK_OPTIONS: SheetOption[] = [
  { key: 'body', label: '本文' },
  { key: 'heading1', label: '見出し1' },
  { key: 'heading2', label: '見出し2' },
  { key: 'heading3', label: '見出し3' },
  { key: 'bullet', label: '箇条書き' },
  { key: 'numbered', label: '番号付きリスト' },
  { key: 'check', label: 'チェックリスト', icon: 'checklist' },
  { key: 'quote', label: '引用' },
  { key: 'codeblock', label: 'コードブロック', icon: 'code' },
  { key: 'image', label: '画像', icon: 'image' },
];

const MORE_OPTIONS: SheetOption[] = [
  { key: 'bullet', label: '箇条書き' },
  { key: 'numbered', label: '番号付きリスト' },
  { key: 'quote', label: '引用' },
  { key: 'codeblock', label: 'コードブロック', icon: 'code' },
];

/** Toolbar button, 44pt with radius 16 (Figma 04 › Format toolbar › Tool/*). */
function ToolButton({
  label,
  onPress,
  primary = false,
  children,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  children: (color: string) => React.ReactNode;
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
        borderRadius: radius.xl,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: primary ? colors.primary : colors.surfaceMuted,
      }}
    >
      {children(primary ? colors.textOnPrimary : colors.textPrimary)}
    </Pressable>
  );
}

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
  const [sheet, setSheet] = useState<SheetName | null>(null);
  const [headingLevel, setHeadingLevel] = useState<number | undefined>(undefined);
  const selection = useRef<Selection>({ start: body.length, end: body.length });
  // Selection to push into one text segment (index + range local to that segment).
  const [sel, setSel] = useState<{ seg: number; range: Selection } | undefined>(undefined);
  const segmentInputs = useRef<(TextInput | null)[]>([]);
  // Images are shown as images while editing; the Markdown body stays the only stored content.
  const segments = splitEditorSegments(body);
  const focusSegment = (index: number | undefined) =>
    setTimeout(() => segmentInputs.current[index ?? 0]?.focus(), 0);

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

  // Toolbar edits rewrite the Markdown source around the current selection; the DB still stores
  // only that Markdown string.
  const applyEdit = (edit: FormatEdit) => {
    selection.current = edit.selection;
    updateBody(edit.text);
    const next = splitEditorSegments(edit.text);
    let index = next.findIndex(
      (s) => s.type === 'text' && edit.selection.start >= s.start && edit.selection.end <= s.end,
    );
    if (index < 0) index = next.findIndex((s) => s.type === 'text');
    const target = next[index];
    if (target) {
      setSel({
        seg: index,
        range: {
          start: Math.max(0, edit.selection.start - target.start),
          end: Math.max(0, edit.selection.end - target.start),
        },
      });
    }
    focusSegment(index);
  };
  const inline = (marker: InlineMarker) => applyEdit(toggleInline(body, selection.current, marker));

  const addImage = async () => {
    // The caret at the moment the button was pressed; the body is read after the picker returns.
    const caret = selection.current;
    try {
      const image = await editor.attachImage();
      if (image) applyEdit(insertImage(latest.current.body, caret, image.ref, image.alt));
    } catch {
      Alert.alert('画像を追加できませんでした', 'もう一度お試しください');
    }
  };

  const applyBlockOption = (key: string) => {
    if (key === 'codeblock') return applyEdit(insertCodeBlock(body, selection.current));
    if (key === 'image') return void addImage();
    applyEdit(applyBlock(body, selection.current, key as BlockKind | 'body'));
  };

  const showPreview = () => {
    Keyboard.dismiss();
    setEditingBody(false);
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
              focusSegment(0);
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
          <View style={{ gap: 10 }}>
            {segments.map((segment, i) =>
              segment.type === 'image' ? (
                <View key={`image-${i}`}>
                  <NoteImage alt={segment.alt} reference={segment.ref} />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="画像を削除"
                    onPress={() => {
                      const next = removeSegmentLine(body, segment.start, segment.end);
                      selection.current = { start: segment.start, end: segment.start };
                      updateBody(next);
                    }}
                    style={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      width: 32,
                      height: 32,
                      borderRadius: radius.full,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: colors.surface,
                    }}
                  >
                    <Icon name="close" size={16} color={colors.textPrimary} strokeWidth={1.8} />
                  </Pressable>
                </View>
              ) : (
                <TextInput
                  key={`text-${i}`}
                  ref={(node) => {
                    segmentInputs.current[i] = node;
                  }}
                  accessibilityLabel="Markdown本文"
                  value={segment.text}
                  onChangeText={(value) =>
                    updateBody(body.slice(0, segment.start) + value + body.slice(segment.end))
                  }
                  selection={sel?.seg === i ? sel.range : undefined}
                  onSelectionChange={(e) => {
                    const range = e.nativeEvent.selection;
                    selection.current = {
                      start: segment.start + range.start,
                      end: segment.start + range.end,
                    };
                    setSel({ seg: i, range });
                  }}
                  placeholder={segments.length === 1 ? '本文を書く' : undefined}
                  placeholderTextColor={colors.textPlaceholder}
                  multiline
                  autoFocus={i === 0 && (body !== '' || title !== '')}
                  textAlignVertical="top"
                  autoCapitalize="none"
                  style={{
                    minHeight: i === segments.length - 1 ? (segments.length === 1 ? 240 : 120) : 24,
                    padding: 0,
                    fontFamily: fontFamily.regular,
                    ...typography.body,
                    color: colors.textPrimary,
                  }}
                />
              ),
            )}
          </View>
        ) : (
          <Pressable
            accessibilityLabel="本文を編集"
            onPress={() => {
              setEditingBody(true);
              focusSegment(splitEditorSegments(body).length - 1);
            }}
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
            alignItems: 'center',
            paddingLeft: 24,
            paddingRight: 12,
            paddingTop: 12,
            paddingBottom: Math.max(insets.bottom, 16),
            borderTopWidth: 1,
            borderTopColor: colors.divider,
            backgroundColor: colors.surface,
          }}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
            style={{ flex: 1 }}
            contentContainerStyle={{ gap: 16, paddingRight: 16 }}
          >
            <ToolButton label="ブロックを追加" primary onPress={() => setSheet('block')}>
              {(color) => <Icon name="plus" size={20} color={color} strokeWidth={2} />}
            </ToolButton>
            <ToolButton
              label="見出し・本文"
              onPress={() => {
                setHeadingLevel(currentHeadingLevel(body, selection.current.start));
                setSheet('heading');
              }}
            >
              {(color) => <Icon name="heading" size={20} color={color} strokeWidth={1.7} />}
            </ToolButton>
            <ToolButton label="太字" onPress={() => inline('**')}>
              {(color) => <Text style={{ fontFamily: fontFamily.extraBold, fontSize: 18, color }}>B</Text>}
            </ToolButton>
            <ToolButton label="斜体" onPress={() => inline('*')}>
              {(color) => (
                <Text style={{ fontFamily: fontFamily.bold, fontSize: 18, fontStyle: 'italic', color }}>
                  I
                </Text>
              )}
            </ToolButton>
            <ToolButton label="取り消し線" onPress={() => inline('~~')}>
              {(color) => (
                <Text
                  style={{
                    fontFamily: fontFamily.bold,
                    fontSize: 18,
                    textDecorationLine: 'line-through',
                    color,
                  }}
                >
                  S
                </Text>
              )}
            </ToolButton>
            <ToolButton
              label="チェックリスト"
              onPress={() => applyEdit(applyBlock(body, selection.current, 'check'))}
            >
              {(color) => <Icon name="checklist" size={20} color={color} strokeWidth={1.7} />}
            </ToolButton>
            <ToolButton label="リンク" onPress={() => applyEdit(insertLink(body, selection.current))}>
              {(color) => <Icon name="link" size={20} color={color} strokeWidth={1.7} />}
            </ToolButton>
            <ToolButton label="インラインコード" onPress={() => inline('`')}>
              {(color) => <Icon name="code" size={20} color={color} strokeWidth={1.7} />}
            </ToolButton>
            <ToolButton label="画像" onPress={() => void addImage()}>
              {(color) => <Icon name="image" size={20} color={color} strokeWidth={1.7} />}
            </ToolButton>
            <ToolButton label="その他の書式" onPress={() => setSheet('more')}>
              {(color) => <Icon name="more" size={20} color={color} strokeWidth={1.7} />}
            </ToolButton>
          </ScrollView>
          <ToolButton label="プレビュー" onPress={showPreview}>
            {(color) => <Icon name="eye" size={20} color={color} strokeWidth={1.7} />}
          </ToolButton>
        </View>
      ) : null}
      <OptionSheet
        visible={sheet === 'block'}
        title="ブロックを追加"
        options={BLOCK_OPTIONS}
        onSelect={applyBlockOption}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'heading'}
        title="見出し・本文"
        options={HEADING_OPTIONS.map((option) => ({
          key: option.key,
          label: option.label,
          selected: headingLevel === option.level,
        }))}
        onSelect={applyBlockOption}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'more'}
        title="その他の書式"
        options={MORE_OPTIONS}
        onSelect={applyBlockOption}
        onClose={() => setSheet(null)}
      />
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
