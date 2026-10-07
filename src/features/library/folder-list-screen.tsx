import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { Button, EmptyState, SearchField } from '@/components/form-ui';
import { Icon } from '@/components/icons';
import { fontFamily, layout, radius, shadow, typography, useTheme } from '@/design';
import { Chip } from '@/features/review/review-ui';

import { FolderFormSheet } from './folder-form-sheet';
import type { FolderSummary } from './library-use-cases';
import { useFolderList } from './use-library';

/** Folder tile colors cycle through the three Figma variants (primary / warning / info). */
function useTileColors(index: number) {
  const c = useTheme();
  const tiles = [
    { bg: c.primarySoft, fg: c.primary },
    { bg: c.warningSoft, fg: c.warning },
    { bg: c.infoSoft, fg: c.info },
  ] as const;
  return tiles[index % 3] ?? tiles[0];
}

function FolderCard({ folder, index }: { folder: FolderSummary; index: number }) {
  const colors = useTheme();
  const tile = useTileColors(index);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${folder.name}、${folder.questionCount}問`}
      onPress={() => router.push({ pathname: '/folders/[id]', params: { id: folder.id } })}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 16,
        paddingLeft: 16,
        paddingRight: 14,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.divider,
        backgroundColor: colors.surface,
        ...shadow.card,
      }}
    >
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: tile.bg,
        }}
      >
        <Icon name="folder" size={26} color={tile.fg} strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: fontFamily.extraBold,
            fontSize: 17,
            lineHeight: 24,
            color: colors.textPrimary,
          }}
        >
          {folder.name}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontFamily: fontFamily.bold, ...typography.caption, color: colors.textSecondary }}>
            {folder.questionCount}問
          </Text>
          {folder.dueCount > 0 ? (
            <Chip
              label={`復習 ${folder.dueCount}`}
              icon="clock"
              background={colors.warningSoft}
              color={colors.warningText}
              iconColor={colors.warning}
            />
          ) : null}
        </View>
      </View>
      <Icon name="chevron-right" size={20} color={colors.textSecondary} strokeWidth={1.8} />
    </Pressable>
  );
}

/** Figma 07 フォルダー一覧 (shown in the 復習 tab, whose tab is active in the design). */
export function FolderListScreen({ header }: { header?: ReactNode } = {}) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const { folders, totalQuestions, query, setQuery, createFolder } = useFolderList();
  const [creating, setCreating] = useState(false);
  const searching = query.trim().length > 0;

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
          フォルダー
        </Text>
      </View>
      <ScrollView
        contentContainerStyle={{
          alignSelf: 'center',
          width: '100%',
          maxWidth: layout.contentMaxWidth,
          gap: 16,
          paddingTop: 8,
          paddingHorizontal: 24,
          paddingBottom: 24,
        }}
      >
        {header}
        <View style={{ gap: 12, paddingTop: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text
                style={{
                  fontFamily: fontFamily.extraBold,
                  ...typography.headingSm,
                  color: colors.textPrimary,
                }}
              >
                学びたい分野を選びましょう
              </Text>
              <Text style={{ fontFamily: fontFamily.extraBold, ...typography.label, color: colors.primary }}>
                {folders.length}フォルダー · {totalQuestions}問
              </Text>
            </View>
            <Button label="＋ 作成" variant="secondary" size="sm" onPress={() => setCreating(true)} />
          </View>
          <SearchField height={44} value={query} onChangeText={setQuery} placeholder="フォルダーを検索" />
        </View>
        {folders.length === 0 && searching ? (
          <EmptyState
            icon="search"
            title="該当するフォルダーがありません"
            description={`「${query.trim()}」に一致するフォルダー名は見つかりませんでした`}
          />
        ) : folders.length === 0 ? (
          <EmptyState
            icon="folder"
            title="フォルダーがありません"
            description="フォルダーを作成して、問題をまとめましょう"
          />
        ) : (
          folders.map((folder, index) => <FolderCard key={folder.id} folder={folder} index={index} />)
        )}
      </ScrollView>
      <FolderFormSheet
        visible={creating}
        onSubmit={(name) => createFolder(name)}
        onClose={() => setCreating(false)}
      />
    </View>
  );
}
