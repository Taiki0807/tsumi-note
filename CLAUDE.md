# CLAUDE.md

このファイルは、Claude Code がこのリポジトリで作業する際のルールを定義します。

## プロジェクト概要

「つみノート」は、学習 → 記録 → 復習を一つの流れとして管理する
iPhone / iPad向け学習アプリです。

Local Firstを基本とし、主要機能はアカウントなしでも利用できるようにします。
アカウント作成後はバックアップ・同期機能を利用できるようにします。

---

## Source of Truth

実装時は、内容に応じて以下をSource of Truthとしてください。

### 機能仕様

`docs/PRODUCT_SPEC.md`

以下を定義します。

- 何を作るか
- 機能要件
- 画面・機能の振る舞い

### 技術設計

`docs/ARCHITECTURE.md`

以下を定義します。

- どのように作るか
- 技術構成
- Local First
- Database
- API
- Sync
- Security
- Testing
- 開発Phase

### Visual Design

Figma

以下のVisual DesignのSource of Truthです。

- Color
- Typography
- Size
- Spacing
- Position
- Alignment
- Border Radius
- Shadow
- Icon
- Navigation

詳細は `docs/DESIGN.md` を参照してください。

### 補助資料

Claude Artifact

FigmaまたはPRODUCT_SPECと競合する場合は優先しません。

---

## 優先順位

判断に迷った場合は以下に従ってください。

```text
機能
  → docs/PRODUCT_SPEC.md

技術
  → docs/ARCHITECTURE.md

Visual Design
  → Figma

補助資料
  → Claude Artifact
```

PRODUCT_SPECに存在しない機能を独自判断で追加しないでください。

---

## Figma

FigmaはVisual DesignのSource of Truthです。

Figmaデザインを確認する場合は、必ずリポジトリルートの
`figma-fetch` を使用してください。

### 使用方法

```bash
./figma-fetch <node-id>
```

例:

```bash
./figma-fetch 190:32
```

ClaudeからFigma REST APIを `curl` で直接呼び出さないでください。

`figma-fetch` が利用できない、またはFigmaデータを取得できない場合は、
推測でUIを変更せず、取得できなかった理由を報告してください。

### Secret

認証には環境変数 `FIGMA_ACCESS_TOKEN` を使用します。

`FIGMA_ACCESS_TOKEN` の値そのものを以下へ絶対に出力しないでください。

- GitHub Actionsログ
- Issueコメント
- Pull Request
- コード
- ドキュメント
- テスト結果
- エラー報告
- Claudeの回答

### Figma Fidelity

Figmaにデザインが存在する画面では、取得可能な以下の値を
Claudeの判断で変更しないでください。

- Color
- Typography
- Font Size
- Font Weight
- Size
- Spacing
- Padding
- Margin
- Position
- Alignment
- Border Radius
- Shadow
- Icon Size

Figmaから取得可能な値はFigmaの値を優先してください。

---

## UI実装フロー

UIを実装・変更する場合は、原則として以下の順序で確認してください。

1. `docs/PRODUCT_SPEC.md`
2. `docs/DESIGN.md`
3. 対象Figma Node
4. `./figma-fetch <node-id>` でFigmaデータを取得
5. FigmaのVisual Valueを確認
6. 既存Design Tokenを確認
7. 既存Componentを確認
8. 実装
9. Figmaと比較
10. 差異をPull Requestへ記載

同じ役割のComponentやDesign Tokenを重複して作成しないでください。

---

## GitHub上の言語

GitHub上でユーザーに表示する文章は、原則として日本語で記述してください。

対象:

- Issueコメント
- Pull Requestタイトル
- Pull Request本文
- 作業報告
- エラー報告
- テスト結果
- Figmaとの差異
- 懸念事項
- 確認事項

以下は必要に応じて英語のままで構いません。

- コード
- コマンド
- ファイル名
- API名
- ライブラリ名
- 型名
- 原文のエラーメッセージ

---

## Package Manager

Package ManagerはBunです。

原則として以下を使用してください。

```bash
bun install
bun run lint
bun run typecheck
bun run test
```

npm / yarn / pnpmへ変更しないでください。

---

## Local First

SQLiteをローカルデータのPrimary Storeとして扱います。

ログイン後も、基本的なアプリ操作をサーバー依存にしないでください。

同期可能なEntityでは、必要に応じて以下を考慮してください。

- `id`
- `createdAt`
- `updatedAt`
- `deletedAt`

削除同期ではTombstoneを使用します。

履歴系データはAppend-onlyを基本とします。

同期設計の詳細は `docs/ARCHITECTURE.md` に従ってください。

---

## Notes

ノート機能はMarkdownを使用します。

以下は実装しません。

- 手書きノート
- Apple Pencil
- PencilKit

Figmaや過去の資料に該当UIが存在しても、
PRODUCT_SPECと競合する場合は実装しないでください。

---

## Review

復習アルゴリズムには `ts-fsrs` を使用します。

SM-2へ置き換えないでください。

FSRSの状態は問題本体とは適切に分離してください。

---

## Phase

`docs/ARCHITECTURE.md` に定義されたPhaseに従って開発してください。

現在依頼されているPhaseを超えて、
次Phaseの機能を独自判断で実装しないでください。

---

## Testing

実装後は可能な範囲で以下を実行してください。

```bash
bun install
bun run lint
bun run typecheck
bun run test
```

テストを実行できなかった場合は、実行できなかった項目と理由を報告してください。

失敗したテストを成功したものとして報告しないでください。

---

## Pull Request

Pull Requestのタイトル・本文は原則として日本語で記述してください。

PR本文には必要に応じて以下を記載してください。

- 実装内容
- テスト結果
- Figmaとの差異
- 未対応事項
- 懸念事項

UI変更を含む場合は、Figmaとの差異を確認してください。

差異がない場合:

```md
## Figmaとの差異

- 差異なし
```

差異がある場合:

```md
## Figmaとの差異

- 対象:
- 差異:
- 理由:
- 対応:
```

Figmaを取得できなかった場合は、その事実を明記してください。

---

## 禁止事項

以下を行わないでください。

- PRODUCT_SPECにない機能を独自判断で追加する
- 指示されていない次Phaseへ進む
- Figmaデザイン済み画面を推測値で変更する
- Figma REST APIを直接 `curl` で呼び出す
- `FIGMA_ACCESS_TOKEN` を出力する
- npm / yarn / pnpmへPackage Managerを変更する
- FSRSをSM-2へ置き換える
- Markdownノートを手書きノートへ変更する
- 既存ComponentやDesign Tokenを確認せず重複実装する