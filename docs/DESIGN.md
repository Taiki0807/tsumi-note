# つみノート Design Specification

## 1. Purpose

このドキュメントは「つみノート」のVisual DesignおよびUI実装ルールを定義する。

機能要件については `PRODUCT_SPEC.md`、技術設計については `ARCHITECTURE.md` をSource of Truthとする。

---

# 2. Design Source of Truth

## Figma

Visual DesignのSource of Truthとして以下のFigmaを使用する。

```text
https://www.figma.com/design/2YR8QWeewgVF9tIM9yfLu7/%E5%AD%A6%E7%BF%92%E3%82%A2%E3%83%97%E3%83%AA%EF%BD%9CBlue---Charcoal?node-id=190-32
```

Figma File Key:

```text
2YR8QWeewgVF9tIM9yfLu7
```

Initial Node:

```text
190:32
```

## Claude Artifact

画面全体の意図や補助的なデザイン資料として以下を使用する。

```text
https://claude.ai/artifact/6zU6y5LDsyWVe9ctj3YBF2
```

Claude Artifactは補助資料であり、Figmaより優先しない。

---

# 3. Priority

仕様やデザインが競合する場合、以下の順で優先する。

```text
1. PRODUCT_SPEC.md
2. Figma
3. Claude Artifact
```

役割は以下とする。

- `PRODUCT_SPEC.md`
  - 機能仕様のSource of Truth
- Figma
  - Visual DesignのSource of Truth
- `ARCHITECTURE.md`
  - 技術設計・実装方針のSource of Truth
- Claude Artifact
  - UI意図や画面構成を理解するための補助資料

機能要件とFigmaが競合した場合は `PRODUCT_SPEC.md` を優先する。

---

# 4. Figma Access

## GitHub Actions / Claude Code Action

GitHub Actions上のClaude Codeでは、Figma REST APIを使用してデザインを読み取る。

環境変数として以下が設定されている。

```text
FIGMA_ACCESS_TOKEN
FIGMA_FILE_KEY
```

`FIGMA_ACCESS_TOKEN` はGitHub Actions Secretから渡される。

Tokenを以下へ出力してはならない。

- Source Code
- Log
- Issue
- Pull Request
- README
- Documentation
- Commit

Figma APIは読み取り用途に限定する。

Figmaへの変更・書き込みを行わない。

---

# 5. Figma REST API

UIを実装する場合、必要に応じてFigma REST APIから対象Nodeを取得する。

例：

```bash
curl \
  --fail \
  --silent \
  --show-error \
  -H "X-Figma-Token: $FIGMA_ACCESS_TOKEN" \
  "https://api.figma.com/v1/files/$FIGMA_FILE_KEY/nodes?ids=190:32"
```

Node IDは実装対象画面に応じて変更する。

Figma APIから最低限以下を確認する。

- Node hierarchy
- Frame size
- Layout
- Auto Layout
- Width / Height
- Padding
- Gap / itemSpacing
- Colors
- Background
- Typography
- Font size
- Font weight
- Line height
- Border
- Border radius
- Effects / Shadow
- Component hierarchy
- Component instances
- Icons
- Alignment

APIから取得できない情報については推測で断定しない。

必要に応じてPRの「Figmaとの差異」に記載する。

---

# 6. Figma MCP

ローカルClaude Code等でFigma MCPが利用可能な場合は、Figma MCPを使用してよい。

優先順位：

```text
Figma MCPが利用可能
    ↓
Figma MCPを使用

Figma MCPが利用不可
    ↓
Figma REST APIを使用
```

GitHub ActionsではFigma REST APIによる読み取りを標準手段とする。

Figma MCPの有無によってVisual DesignのSource of Truth自体は変わらない。

---

# 7. UI Implementation Flow

UIを実装するときは以下の順番で進める。

```text
PRODUCT_SPEC.md
        ↓
対象機能・状態を確認
        ↓
DESIGN.md
        ↓
Figma Nodeを特定
        ↓
Figma REST API / Figma MCP
        ↓
Design情報を取得
        ↓
既存Design Tokens / Componentsを確認
        ↓
React Nativeで実装
        ↓
Figmaとの差異を確認
        ↓
必要に応じて修正
```

Figmaを確認せず、見た目を推測だけで実装しない。

---

# 8. Design System

React Native側にDesign Tokensを定義する。

最低限以下をToken化する。

```text
Colors
Typography
Spacing
Radius
Shadow
Icon Size
```

可能な限りFigmaから取得した値を基準とする。

Component内で任意の値を大量に直接記述しない。

例：

```text
#xxxxxx
padding: 17
borderRadius: 13
```

のような値を画面ごとに無秩序に追加しない。

共通値はDesign Tokensへ集約する。

---

# 9. NativeWind

StylingにはNativeWindを使用する。

ただしWeb用Tailwind設定をそのまま流用せず、React Native向けに構築する。

Design TokensとNativeWindの設定を可能な限り連携させる。

---

# 10. Visual Direction

Figmaの「Blue - Charcoal」を基本とする。

アプリ全体で以下を維持する。

- BlueをPrimary Accentとして使用
- Charcoal系Text
- Neutral Background
- 明確なVisual Hierarchy
- 高い可読性
- 適切な余白
- 一貫したRadius
- 一貫したComponent Design

画面ごとに独自のDesign Systemを作らない。

---

# 11. Bottom Navigation

Bottom Navigationは5タブ。

```text
記録
ノート
タイマー
復習
マイページ
```

中央の、

```text
タイマー
```

を他タブより視覚的に強調する。

実装前にFigmaから以下を確認する。

- Navigation height
- Icon size
- Icon position
- Label typography
- Active state
- Inactive state
- Background
- Center timer button size
- Center timer button position
- Shadow
- Radius
- Safe Area

独自のBottom Navigationデザインへ変更しない。

---

# 12. Designed Screens

以下はFigma等でデザイン済み。

```text
00  起動画面
01  タイマー
02  学習記録
03  ノート一覧
04  ノート詳細・編集
06  目標
06b 目標削除確認
07  フォルダー一覧
08  問題管理
09  問題作成
10  復習
11  復習設定
12  フォルダー作成
13  アカウント作成
14  Email登録
15  マイページ（未登録）
16  マイページ（登録済み）
17  アカウント
18  アカウント削除
```

これらについては独自に再設計せず、FigmaをVisual DesignのSource of Truthとして実装する。

---

# 13. Undesigned Screens / States

以下は現時点で未デザイン。

## Timer

- Focus State
- Break State
- Paused State
- Round Complete
- Timer Settings

## Notes

- Note Action Menu

## Folder

- Folder Edit
- Folder Delete Confirmation

## Questions

- Question Detail
- Question Edit
- Question Delete Confirmation

## Review

- Review Timeout
- Review Complete

## Goal

- Goal Create
- Goal Edit

## Account

- Login

## Settings

- Notification Settings
- Privacy / Data

未デザインは「不要」という意味ではない。

`PRODUCT_SPEC.md` に記載されている機能は実装対象である。

未デザイン画面については、既存FigmaのDesign Systemを使用してデザインする。

---

# 14. New UI Rule

未デザイン画面を実装する場合は以下の順番で判断する。

1. Figma内に類似Componentがないか確認
2. Figma内に類似画面がないか確認
3. 既存Design Tokensを使用
4. 既存Componentを再利用
5. 既存Spacing / Typographyを使用
6. 新しいDesign Patternの追加を最小限にする

Claude独自のDesign Systemを新しく作らない。

---

# 15. Notes Design

ノートはMarkdown専用。

対応：

- Heading
- List
- Checklist
- Link
- Code

手書き機能は実装しない。

以下も実装しない。

- Apple Pencil UI
- PencilKit
- Drawing Canvas
- Handwriting Toolbar

---

# 16. Light / Dark Mode

Dark Modeに対応できるDesign Token構造とする。

例：

```text
Light Theme
├── background
├── surface
├── textPrimary
├── textSecondary
├── border
└── primary

Dark Theme
├── background
├── surface
├── textPrimary
├── textSecondary
├── border
└── primary
```

FigmaにDark Modeの完全な指定が存在しない場合、既存Blue / Charcoal Design Systemとの一貫性を維持する。

推測で大量の独自色を追加しない。

---

# 17. iPhone / iPad

v1対象：

- iPhone
- iPad

固定座標だけに依存した実装を避ける。

以下を考慮する。

- Safe Area
- Screen width
- Screen height
- Orientation requirements
- iPad width
- Content max width
- Modal / Sheet size

ただしFigmaとの差異が大きくなる独自Responsive Designは避ける。

---

# 18. Accessibility

最低限以下を考慮する。

- Touch Target
- Text Contrast
- Accessibility Label
- Screen Reader
- Disabled State
- Loading State
- Error State
- Selected State
- Focus State

Accessibility対応を理由にFigmaのVisual Designを不必要に変更しない。

---

# 19. Component Policy

共通UIは再利用可能なComponentとして実装する。

例：

```text
Button
IconButton
Card
Input
SearchInput
Sheet
Modal
Badge
EmptyState
SectionHeader
TabBar
TimerRing
```

ただし、まだ1箇所でしか使わないUIまで過剰にComponent化しない。

実際に共通化する価値があるものを抽出する。

---

# 20. Icon Policy

Figmaで指定されているIconを優先する。

同一Icon Setを可能な限り使用し、画面ごとに異なるIcon Libraryを混在させない。

FigmaでIconが特定できない場合は、既存UIとのVisual Consistencyを優先する。

---

# 21. Loading / Empty / Error States

主要画面では必要に応じて以下を考慮する。

```text
Loading
Empty
Error
Disabled
Offline
Syncing
```

Local Firstアプリのため、ネットワーク切断だけを理由に主要機能を利用不能にしない。

---

# 22. Sync UI

アカウント登録後のマイページでは同期状態を表示する。

例：

```text
最終同期 3分前
```

必要に応じて以下の状態を表現する。

```text
Synced
Syncing
Offline
Sync Error
```

同期処理によって通常操作をblockしない。

---

# 23. Figma Difference Reporting

Figmaを完全に再現できない場合、Claudeは勝手に無視せずPRで報告する。

Phase完了報告には、

```text
## Figmaとの差異
```

を含める。

記載例：

```text
- Figmaでは○○だがReact Nativeの制約により△△で実装
- Dark ModeはFigma未定義のため既存Tokenから派生
- 対象StateがFigma未デザインのため既存Componentから作成
```

差異がない場合：

```text
特になし
```

とする。

---

# 24. Security

Figma Access Tokenを以下に含めてはならない。

```text
Source Code
Commit
Git History
Issue
Pull Request
Log
README
Documentation
Screenshot
```

TokenそのものをClaudeの回答へ出力しない。

Figma APIへのアクセスは読み取り目的に限定する。

---

# 25. Definition of Done for UI

UI実装を完了とする前に以下を確認する。

- [ ] `PRODUCT_SPEC.md` を確認した
- [ ] `DESIGN.md` を確認した
- [ ] 対象Figma Nodeを確認した
- [ ] Figma REST APIまたはFigma MCPからデザイン情報を取得した
- [ ] Design Tokensを使用している
- [ ] 既存Componentを可能な範囲で再利用している
- [ ] iPhoneでレイアウトが破綻しない
- [ ] iPadでレイアウトが破綻しない
- [ ] Light / Dark Modeを考慮している
- [ ] Loading / Error等の必要状態を考慮した
- [ ] Accessibilityを考慮した
- [ ] Figmaとの差異を確認した
- [ ] 差異がある場合はPRに記載した

---

# 26. Final Rule

つみノートのUI実装では、

```text
機能
    → PRODUCT_SPEC.md

技術
    → ARCHITECTURE.md

Visual Design
    → Figma

補助資料
    → Claude Artifact
```

を基本原則とする。

GitHub Actions上のClaude Codeは、Figma MCPが利用できない場合でもFigma REST APIを利用してVisual Designを確認してからUIを実装する。

Figmaを確認できない場合は、デザイン済み画面を推測だけで完成扱いにしない。

その場合は制約としてIssue / PRへ報告する。