import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, EmptyState, IconButton } from '@/components/form-ui';
import { fontFamily, layout, radius, shadow, typography, useTheme } from '@/design';
import type { Question } from '@/db/repositories';

import { FolderFormSheet } from './folder-form-sheet';
import { folderDeletionMessage } from './library-use-cases';
import { QuestionFormSheet } from './question-form-sheet';
import { useFolderDetail } from './use-library';

function QuestionCard({ question, onPress }: { question: Question; onPress: () => void }) {
  const colors = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`問題を編集: ${question.prompt}`}
      onPress={onPress}
      style={{
        gap: 8,
        padding: 16,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.divider,
        backgroundColor: colors.surface,
        ...shadow.card,
      }}
    >
      <Text
        numberOfLines={2}
        style={{ fontFamily: fontFamily.extraBold, fontSize: 17, lineHeight: 24, color: colors.textPrimary }}
      >
        {question.prompt}
      </Text>
      <Text
        numberOfLines={2}
        style={{ fontFamily: fontFamily.bold, ...typography.caption, color: colors.textSecondary }}
      >
        {question.answer}
      </Text>
    </Pressable>
  );
}

type Sheet =
  { kind: 'none' } | { kind: 'create' } | { kind: 'edit'; question: Question } | { kind: 'rename' };

/** Figma 08 問題管理 · フォルダー内の問題一覧（フォルダー詳細）。 */
export function FolderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const folder = useFolderDetail(id);
  const [sheet, setSheet] = useState<Sheet>({ kind: 'none' });
  const close = () => setSheet({ kind: 'none' });

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

  const confirmDeleteFolder = () => {
    const impact = folder.getDeletionImpact();
    Alert.alert(`「${detail.folder.name}」を削除しますか？`, folderDeletionMessage(impact), [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: () => {
          folder.deleteFolder();
          router.back();
        },
      },
    ]);
  };

  const openFolderMenu = () =>
    Alert.alert(detail.folder.name, undefined, [
      { text: 'フォルダー名を変更', onPress: () => setSheet({ kind: 'rename' }) },
      { text: 'フォルダーを削除', style: 'destructive', onPress: confirmDeleteFolder },
      { text: 'キャンセル', style: 'cancel' },
    ]);

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
          paddingBottom: Math.max(insets.bottom, 24) + 24,
        }}
      >
        <Text style={{ fontFamily: fontFamily.extraBold, ...typography.bodySm, color: colors.textPrimary }}>
          全{detail.questions.length}問
        </Text>
        {detail.questions.length === 0 ? (
          <>
            <EmptyState
              icon="note"
              title="問題がありません"
              description="右上の＋から最初の問題を作成しましょう"
            />
            <Button label="＋ 問題を作成" variant="secondary" onPress={() => setSheet({ kind: 'create' })} />
          </>
        ) : (
          detail.questions.map((q) => (
            <QuestionCard key={q.id} question={q} onPress={() => setSheet({ kind: 'edit', question: q })} />
          ))
        )}
      </ScrollView>

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
      <FolderFormSheet
        visible={sheet.kind === 'rename'}
        initialName={detail.folder.name}
        onSubmit={(name) => folder.renameFolder(name)}
        onClose={close}
      />
    </View>
  );
}
