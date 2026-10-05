# つみノート Design Specification

## 1. Source of Truth

### Figma

https://www.figma.com/design/2YR8QWeewgVF9tIM9yfLu7/%E5%AD%A6%E7%BF%92%E3%82%A2%E3%83%97%E3%83%AA%EF%BD%9CBlue---Charcoal?node-id=190-32

### Claude Artifact

https://claude.ai/artifact/6zU6y5LDsyWVe9ctj3YBF2

---

# 2. Priority

仕様・デザインが競合した場合：

```text
1. PRODUCT_SPEC.md
2. Figma
3. Claude Artifact
```

を優先する。

`PRODUCT_SPEC.md` は機能仕様のSource of Truth。

FigmaはVisual DesignのSource of Truth。

Claude Artifactは画面全体やUI意図を理解する補助資料として扱う。

---

# 3. Figma MCP

Figma MCPが利用可能な開発環境では、UI実装前に対象Nodeを確認する。

可能な限り以下をFigmaから取得する。

- Colors
- Typography
- Font Weight
- Font Size
- Line Height
- Spacing
- Padding
- Gap
- Border Radius
- Border
- Shadow
- Icons
- Component Size
- Layout
- States

見た目を推測だけで実装しない。

---

# 4. Design System

React Native側でDesign Tokensを定義する。

対象：

```text
Colors
Typography
Spacing
Radius
Shadow
Icon Size
```

Component内で、

```text
#xxxxxx
```

のような色コードや任意のspacing値を大量に直接記述しない。

NativeWind等から再利用できる構造とする。

Web用Tailwind設定をそのままコピーするのではなく、React Native向けに適切に構築する。

---

# 5. Visual Direction

Figmaの「Blue - Charcoal」を基本とする。

アプリ全体で、

- Blue
- Charcoal
- Neutral background
- Clear hierarchy
- High readability

を維持する。

独自の別Design Systemを画面ごとに追加しない。

---

# 6. Bottom Navigation

5タブ：

```text
記録
ノート
タイマー
復習
マイページ
```

中央：

```text
タイマー
```

を視覚的に強調する。

Figmaのサイズ・位置・余白・アイコンを確認して再現する。

---

# 7. Designed Screens

以下はデザイン済み。

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

これらについては独自に再設計せずFigmaを優先する。

---

# 8. Undesigned Screens / States

以下は未デザイン。

- Timer Focus State
- Timer Break State
- Timer Paused State
- Timer Round Complete
- Timer Settings
- Note Action Menu
- Folder Edit
- Folder Delete Confirmation
- Question Detail
- Question Edit
- Question Delete Confirmation
- Review Timeout
- Review Complete
- Goal Create
- Goal Edit
- Login
- Notification Settings
- Privacy / Data

これらも必要な画面・状態であり、未デザインだから不要という意味ではない。

実装時は既存FigmaのDesign System・Component・Spacing・Typography等を再利用する。

---

# 9. Notes

ノートUIはMarkdown専用。

手書きUIを実装しない。

Apple Pencil / PencilKit向けUIも作成しない。

---

# 10. Dark Mode

Dark Modeに対応する。

Design TokenをLight / Darkで切り替えられる構造にする。

FigmaにDark Modeの完全な指定が存在しない箇所については、既存のBlue / Charcoal Design Systemとの一貫性を維持する。

---

# 11. Responsive Layout

対象：

- iPhone
- iPad

固定pixel位置だけに依存しない。

iPhoneとiPadで破綻しないlayoutを使用する。

ただしFigmaとの差異を避けるため、過剰に独自responsive layoutへ変更しない。

---

# 12. Accessibility

最低限考慮する。

- Touch Target
- Text Contrast
- Dynamic content
- Screen Reader label
- Disabled State
- Loading State
- Error State

Visual Designを大きく変更せずaccessibilityを確保する。

---

# 13. Implementation Rule

UIを実装するとき：

```text
PRODUCT_SPEC.mdを確認
↓
Figma対象画面を確認
↓
既存Design Token / Componentを確認
↓
実装
↓
Figmaと比較
↓
差異修正
```

の順で行う。

Figmaとの差異が残る場合はPRに理由を記載する。

---

# 14. New UI Rule

未デザイン画面を実装する場合：

1. 既存Figma Componentを探す
2. 類似画面のlayoutを再利用する
3. Design Tokenを利用する
4. 新しいDesign Patternの追加を最小限にする

Claude独自のDesign Systemを勝手に作らない。

---

# 15. Design Review

主要UIのPRでは可能な限り、

- Figma
- Simulator / Device implementation

を比較する。

特に確認：

- Layout
- Spacing
- Typography
- Colors
- Radius
- Icons
- Navigation
- iPhone
- iPad