import { router } from 'expo-router';
import { useEffect } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { EmptyState, IconButton, SearchField } from '@/components/form-ui';
import { Icon } from '@/components/icons';
import { fontFamily, layout, radius, shadow, typography, useTheme } from '@/design';

import { useFolderTone } from './folder-tone';
import { formatNoteTime, noteDisplayTitle } from './note-format';
import type { NoteRow } from './note-use-cases';
import { useNoteList } from './use-notes';

function NoteListRow({
  row,
  last,
  onOpen,
  onMenu,
}: {
  row: NoteRow;
  last: boolean;
  onOpen: () => void;
  onMenu: () => void;
}) {
  const colors = useTheme();
  const tone = useFolderTone(row.folderIndex);
  const title = noteDisplayTitle(row.note.title);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 10,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.divider,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        onPress={onOpen}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14 }}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: radius.md,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: tone.tile,
          }}
        >
          <Icon name="note" size={22} color={tone.icon} strokeWidth={1.8} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            numberOfLines={1}
            style={{
              fontFamily: fontFamily.extraBold,
              ...typography.button,
              color: colors.textPrimary,
            }}
          >
            {title}
          </Text>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <Text
              numberOfLines={1}
              style={{ fontFamily: fontFamily.extraBold, ...typography.caption, color: tone.label }}
            >
              {row.folder?.name ?? '未分類'}
            </Text>
            <Text style={{ fontFamily: fontFamily.bold, ...typography.caption, color: colors.textSecondary }}>
              · {formatNoteTime(row.note.updatedAt)}
            </Text>
          </View>
        </View>
        {row.note.pinned ? <Icon name="pin" size={18} color={colors.primary} strokeWidth={1.5} /> : null}
      </Pressable>
      <IconButton name="more" label={`${title}の操作`} onPress={onMenu} />
    </View>
  );
}

/** Figma 03 ノート. */
export function NoteListScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const list = useNoteList();
  const { sweepImages } = list;
  // Housekeeping once per visit of the list: images dropped from notes while editing are removed.
  useEffect(() => sweepImages(), [sweepImages]);
  const searching = list.query.trim().length > 0;

  const confirmDelete = (row: NoteRow) =>
    Alert.alert('このノートを削除しますか？', noteDisplayTitle(row.note.title), [
      { text: 'キャンセル', style: 'cancel' },
      { text: '削除', style: 'destructive', onPress: () => list.deleteNote(row.note.id) },
    ]);

  const openMenu = (row: NoteRow) =>
    Alert.alert(noteDisplayTitle(row.note.title), undefined, [
      {
        text: row.note.pinned ? 'ピン留めを解除' : 'ピン留め',
        onPress: () => list.setPinned(row.note.id, !row.note.pinned),
      },
      { text: '削除', style: 'destructive', onPress: () => confirmDelete(row) },
      { text: 'キャンセル', style: 'cancel' },
    ]);

  const newNote = () =>
    router.push({ pathname: '/notes/[id]', params: { id: 'new', folderId: list.folderId ?? '' } });

  const tabs = [{ id: undefined, name: 'すべて' }, ...list.folders.map((f) => ({ id: f.id, name: f.name }))];
  const heading = list.folderId
    ? (list.folders.find((f) => f.id === list.folderId)?.name ?? 'ノート')
    : 'すべてのノート';

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <View
        style={{
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
          ノート
        </Text>
        <IconButton name="plus" label="ノートを作成" tone="soft" onPress={newNote} />
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
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
        <SearchField value={list.query} onChangeText={list.setQuery} placeholder="ノートを検索" />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
          style={{ flexGrow: 0 }}
        >
          {tabs.map((tab) => {
            const selected = tab.id === list.folderId;
            return (
              <Pressable
                key={tab.id ?? 'all'}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => list.setFolderId(tab.id)}
                style={{
                  height: 36,
                  minWidth: 109,
                  paddingHorizontal: 16,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: radius.full,
                  borderWidth: 2,
                  borderColor: colors.primary,
                  backgroundColor: selected ? colors.primary : undefined,
                }}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    fontFamily: fontFamily.extraBold,
                    ...typography.bodySm,
                    color: selected ? colors.textOnPrimary : colors.primary,
                  }}
                >
                  {tab.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              fontFamily: fontFamily.extraBold,
              ...typography.headingSm,
              color: colors.textPrimary,
            }}
          >
            {heading}
          </Text>
          <Text style={{ fontFamily: fontFamily.bold, ...typography.caption, color: colors.textSecondary }}>
            {list.rows.length}件 · 更新順
          </Text>
        </View>
        {list.rows.length === 0 ? (
          searching ? (
            <EmptyState
              icon="search"
              title="該当するノートがありません"
              description={`「${list.query.trim()}」に一致するノートは見つかりませんでした`}
            />
          ) : (
            <EmptyState
              icon="note"
              title="ノートがありません"
              description="右上の＋からノートを作成しましょう"
            />
          )
        ) : (
          <View
            style={{
              paddingLeft: 16,
              paddingRight: 8,
              paddingVertical: 4,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: colors.divider,
              backgroundColor: colors.surface,
              ...shadow.card,
            }}
          >
            {list.rows.map((row, index) => (
              <NoteListRow
                key={row.note.id}
                row={row}
                last={index === list.rows.length - 1}
                onOpen={() => router.push({ pathname: '/notes/[id]', params: { id: row.note.id } })}
                onMenu={() => openMenu(row)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
