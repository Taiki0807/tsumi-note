import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ConfirmDeleteSheet, EmptyState, IconButton, SearchField } from '@/components/form-ui';
import { fontFamily, layout, radius, shadow, typography, useTheme } from '@/design';
import type { Question } from '@/db/repositories';
import { Chip, ProgressBar } from '@/features/review/review-ui';

import { FolderFormSheet } from './folder-form-sheet';
import { FolderMenuSheet } from './folder-menu-sheet';
import { folderDeletionMessage } from './library-use-cases';
import { incorrectPercent, type QuestionFilter, type QuestionRow } from './question-list';
import { QuestionFormSheet } from './question-form-sheet';
import { useFolderDetail } from './use-library';

/** Figma 08 SegmentedTabs: selected = primary fill / white text, others = 2pt primary outline. */
function FilterTabs({
  counts,
  value,
  onChange,
}: {
  counts: Record<QuestionFilter, number>;
  value: QuestionFilter;
  onChange: (next: QuestionFilter) => void;
}) {
  const colors = useTheme();
  const tabs: { key: QuestionFilter; label: string }[] = [
    { key: 'all', label: 'すべて' },
    { key: 'due', label: '復習待ち' },
    { key: 'weak', label: '苦手' },
  ];
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {tabs.map(({ key, label }) => {
        const selected = key === value;
        return (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(key)}
            style={{
              flex: 1,
              height: 36,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.full,
              borderWidth: 2,
              borderColor: colors.primary,
              backgroundColor: selected ? colors.primary : 'transparent',
            }}
          >
            <Text
              style={{
                fontFamily: fontFamily.extraBold,
                ...typography.bodySm,
                color: selected ? colors.textOnPrimary : colors.primary,
              }}
            >
              {label} {counts[key]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Figma Question card: prompt + 誤答 chip, then an incorrect-rate bar with 「不正解 n / m回」. */
function QuestionCard({ row, onPress }: { row: QuestionRow; onPress: () => void }) {
  const colors = useTheme();
  const percent = incorrectPercent(row);
  // Figma: 75% / 50% use the danger tones, 20% the success tones.
  const high = (row.incorrectRate ?? 0) >= 0.5;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`問題を編集: ${row.question.prompt}`}
      onPress={onPress}
      style={{
        gap: 12,
        padding: 16,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.divider,
        backgroundColor: colors.surface,
        ...shadow.card,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            fontFamily: fontFamily.extraBold,
            fontSize: 17,
            lineHeight: 24,
            color: colors.textPrimary,
          }}
        >
          {row.question.prompt}
        </Text>
        {percent !== null ? (
          <Chip
            label={`誤答 ${percent}%`}
            background={high ? colors.dangerSoft : colors.successSoft}
            color={high ? colors.danger : colors.successText}
          />
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <ProgressBar fraction={row.incorrectRate ?? 0} color={high ? colors.dangerAccent : colors.success} />
        <Text style={{ fontFamily: fontFamily.bold, ...typography.caption, color: colors.textSecondary }}>
          {row.attempts === 0 ? '未回答' : `不正解 ${row.incorrect} / ${row.attempts}回`}
        </Text>
      </View>
    </Pressable>
  );
}

type Sheet =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; question: Question }
  | { kind: 'menu' }
  | { kind: 'rename' }
  | { kind: 'deleteFolder'; message: string };

/** Long enough for a closing sheet (220ms) to leave before the next one is presented. */
const SHEET_SWITCH_MS = 260;

/** Figma 08 問題管理 · フォルダー内の問題一覧（フォルダー詳細）。 */
export function FolderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const folder = useFolderDetail(id);
  const [sheet, setSheet] = useState<Sheet>({ kind: 'none' });
  const close = () => setSheet({ kind: 'none' });
  const searching = folder.query.trim().length > 0;

  const emptyList = (noQuestions: boolean) =>
    noQuestions ? (
      <>
        <EmptyState
          icon="note"
          title="問題がありません"
          description="右上の＋から最初の問題を作成しましょう"
        />
        <Button label="＋ 問題を作成" variant="secondary" onPress={() => setSheet({ kind: 'create' })} />
      </>
    ) : (
      <EmptyState
        icon={searching ? 'search' : 'note'}
        title="該当する問題がありません"
        description={
          searching ? '検索ワードやタブを変えてみてください' : 'このタブに表示できる問題はありません'
        }
      />
    );

  const detail = folder.detail;
  if (!detail) {
    // The folder was deleted (or never existed): nothing to show but a way back.
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          backgroundColor: colors.background,
          paddingHorizontal: 24,
        }}
      >
        <EmptyState
          icon="folder"
          title="フォルダーが見つかりません"
          description="削除されたか、存在しません"
        />
        <Button label="戻る" variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }

  // Two modal sheets must not overlap: let the menu finish sliding out before the next one opens.
  const switchSheet = (next: Sheet) => {
    close();
    setTimeout(() => setSheet(next), SHEET_SWITCH_MS);
  };
  const openFolderMenu = () => setSheet({ kind: 'menu' });
  const deleteFolderNow = () => {
    close();
    folder.deleteFolder();
    router.back();
  };

  const confirmDeleteQuestion = (question: Question) =>
    Alert.alert('この問題を削除しますか？', question.prompt, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: () => {
          folder.deleteQuestion(question.id);
          close();
        },
      },
    ]);

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
        }}
      >
        <IconButton name="arrow-left" label="戻る" onPress={() => router.back()} />
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          style={{
            flex: 1,
            fontFamily: fontFamily.extraBold,
            ...typography.headingSm,
            color: colors.textPrimary,
          }}
        >
          {detail.folder.name}
        </Text>
        <IconButton name="more" label="フォルダーの操作" onPress={openFolderMenu} />
        <IconButton name="plus" label="問題を作成" tone="soft" onPress={() => setSheet({ kind: 'create' })} />
      </View>
      <ScrollView
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
        <SearchField value={folder.query} onChangeText={folder.setQuery} placeholder="問題・単語を検索" />
        <FilterTabs counts={detail.counts} value={folder.filter} onChange={folder.setFilter} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: fontFamily.extraBold, ...typography.bodySm, color: colors.textPrimary }}>
            全{detail.rows.length}問
          </Text>
          <Text style={{ fontFamily: fontFamily.bold, ...typography.caption, color: colors.textSecondary }}>
            誤答率の高い順
          </Text>
        </View>
        {detail.rows.length === 0
          ? emptyList(detail.counts.all === 0 && !searching)
          : detail.rows.map((row) => (
              <QuestionCard
                key={row.question.id}
                row={row}
                onPress={() => setSheet({ kind: 'edit', question: row.question })}
              />
            ))}
      </ScrollView>
      <View
        style={{
          flexDirection: 'row',
          gap: 12,
          paddingHorizontal: 24,
          paddingTop: 16,
          paddingBottom: Math.max(insets.bottom, 16),
          backgroundColor: colors.background,
        }}
      >
        <Button flex label="復習設定" variant="secondary" onPress={() => router.push('/review/settings')} />
        <Button
          flex
          label={`${detail.reviewCount}問を復習`}
          disabled={detail.reviewCount === 0}
          onPress={() =>
            router.navigate({
              pathname: '/(tabs)/review',
              params: {
                folderId: detail.folder.id,
                query: folder.query,
                filter: folder.filter,
                run: String(Date.now()),
              },
            })
          }
        />
      </View>

      <QuestionFormSheet
        visible={sheet.kind === 'create' || sheet.kind === 'edit'}
        folderName={detail.folder.name}
        initial={sheet.kind === 'edit' ? sheet.question : undefined}
        onSubmit={(input) =>
          sheet.kind === 'edit'
            ? folder.updateQuestion(sheet.question.id, input)
            : folder.createQuestion(input)
        }
        onDelete={sheet.kind === 'edit' ? () => confirmDeleteQuestion(sheet.question) : undefined}
        onClose={close}
      />
      <FolderMenuSheet
        visible={sheet.kind === 'menu'}
        folderName={detail.folder.name}
        onRename={() => switchSheet({ kind: 'rename' })}
        onDelete={() =>
          switchSheet({
            kind: 'deleteFolder',
            message: folderDeletionMessage(folder.getDeletionImpact(), detail.folder.name),
          })
        }
        onClose={close}
      />
      <FolderFormSheet
        visible={sheet.kind === 'rename'}
        initialName={detail.folder.name}
        onSubmit={(name) => folder.renameFolder(name)}
        onClose={close}
      />
      <ConfirmDeleteSheet
        visible={sheet.kind === 'deleteFolder'}
        title="フォルダーを削除しますか？"
        message={sheet.kind === 'deleteFolder' ? sheet.message : ''}
        onCancel={close}
        onConfirm={deleteFolderNow}
      />
    </View>
  );
}
