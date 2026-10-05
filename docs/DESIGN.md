# DESIGN

## 1. Purpose

このドキュメントは「つみノート」のVisual Designと、
Figmaを利用したUI実装ルールを定義します。

機能仕様は `PRODUCT_SPEC.md`、
技術設計は `ARCHITECTURE.md`、
Visual DesignはFigmaをSource of Truthとします。

---

## 2. Source of Truth

役割は以下のとおりです。

| Source | Role |
| --- | --- |
| `PRODUCT_SPEC.md` | 何を作るか |
| `ARCHITECTURE.md` | どのように作るか |
| Figma | どのように見せるか |
| Claude Artifact | 補助資料 |

判断に迷った場合は以下に従います。

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

機能要件とデザインが競合した場合はPRODUCT_SPECを優先します。

視覚表現についてはFigmaを優先します。

---

## 3. Figma

### Design URL

https://www.figma.com/design/2YR8QWeewgVF9tIM9yfLu7/学習アプリ｜Blue---Charcoal?node-id=190-32

### File Key

```text
2YR8QWeewgVF9tIM9yfLu7
```

### Initial Node

```text
190:32
```

FigmaはVisual DesignのSource of Truthです。

デザイン済み画面について、Figmaから取得可能なVisual Valueを
独自判断で変更しないでください。

対象:

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

---

## 4. Figmaデザインの取得

GitHub Actions上のClaude CodeからFigmaを参照する場合は、
リポジトリルートの `figma-fetch` を使用します。

### Usage

```bash
./figma-fetch <node-id>
```

例:

```bash
./figma-fetch 190:32
```

`figma-fetch` はFigma REST APIへのアクセスをラップします。

ClaudeからFigma REST APIを直接 `curl` で呼び出さないでください。

### Authentication

認証にはGitHub Secretとして管理する
`FIGMA_ACCESS_TOKEN` を使用します。

アクセストークンそのものを以下へ出力してはいけません。

- GitHub Actionsログ
- Issue
- Pull Request
- コード
- ドキュメント
- Claudeの回答

### Failure

Figmaデータを取得できない場合は、
推測でVisual Valueを決定しないでください。

取得失敗の理由を報告し、確認可能になるまで
デザイン済みUIの推測による変更を行わないでください。

---

## 5. Claude Artifact

補助資料:

https://claude.ai/artifact/6zU6y5LDsyWVe9ctj3YBF2

Claude Artifactは補助的なデザイン資料として使用します。

Figmaと競合する場合はFigmaを優先します。

PRODUCT_SPECと競合する場合はPRODUCT_SPECを優先します。

---

## 6. Design Direction

基本的なVisual Directionは Blue / Charcoal です。

ただし、具体的なColor Valueを名称や見た目から推測しないでください。

Figmaに値が存在する場合は、その値を使用します。

---

## 7. Design Tokens

再利用可能なVisual Valueは可能な限りDesign Tokenとして管理します。

対象:

- Colors
- Typography
- Spacing
- Radius
- Shadow
- Icon Size

同一値を画面ごとにハードコードすることは避けてください。

既存Tokenが存在する場合は、新しいTokenを作成する前に
再利用可能か確認してください。

Figmaと既存Tokenが異なる場合は、
影響範囲を確認した上で適切にTokenを更新してください。

---

## 8. Styling

React NativeのStylingにはNativeWindを使用します。

Design TokenとNativeWindを組み合わせ、
画面間でVisual Designを統一します。

Figmaを再現するために必要な場合でも、
既存のDesign Systemとの整合性を確認してから実装してください。

---

## 9. Components

共通化できるUIはComponentとして管理します。

例:

- Button
- Card
- Header
- Tab Item
- Timer Control
- Form Field
- Empty State
- Loading State
- Error State

同じVisual Patternを画面ごとに独立実装しないでください。

既存Componentを確認してから新規Componentを作成してください。

---

## 10. Bottom Navigation

Bottom Navigationは5タブです。

1. 記録
2. ノート
3. タイマー
4. 復習
5. マイページ

中央の「タイマー」を視覚的に強調します。

実装時はFigmaから以下を確認してください。

- Tab Bar Height
- Background
- Active Color
- Inactive Color
- Icon Size
- Label Style
- Timer Button Size
- Timer Button Position
- Border Radius
- Shadow
- Safe Area

中央タイマーの形状・位置・サイズを独自判断で変更しないでください。

---

## 11. Splash Screen

Splash ScreenもFigmaをSource of Truthとします。

実装時はFigmaから以下を確認してください。

- Background Color
- Logo / Icon
- Logo / Icon Size
- Position
- Alignment
- Typography
- Spacing

Native SplashからReact Native側のSplashへ切り替わる際に、
Figmaに存在しない白背景などが一瞬表示されないようにしてください。

`app.json` のNative Splashとアプリ側SplashのVisual Valueを
可能な限り一致させます。

仮置きのColor Valueを最終値として使用しないでください。

---

## 12. App Icon

正式なApp Iconは以下です。

```text
assets/AppIcon.png
```

Expo / iOSのアプリアイコン設定では、このファイルを使用します。

仮アイコンへ戻さないでください。

---

## 13. Notes

ノート機能はMarkdown方式です。

以下は対象外です。

- Handwriting
- Apple Pencil
- PencilKit

Figmaまたは過去のArtifactに手書きを示唆するUIが存在しても、
PRODUCT_SPECと競合する場合は実装しません。

---

## 14. Icons

同じ意味のIconはアプリ全体で統一します。

Figmaに指定がある場合はFigmaを優先します。

Icon Sizeも可能な限りDesign Tokenとして管理します。

---

## 15. UI States

画面実装時は通常状態だけでなく、
必要に応じて以下の状態も考慮します。

- Loading
- Empty
- Error
- Disabled
- Selected
- Active
- Completed
- Offline
- Syncing

Figmaに状態デザインが存在する場合は、そのデザインを使用します。

存在しない場合は、既存Design Systemとの一貫性を優先します。

---

## 16. Light / Dark Mode

Light / Dark Modeの両方を考慮します。

Figmaに対応デザインが存在する場合は、その値を使用します。

Figmaに存在しない状態を実装する場合は、
既存Design Tokenとの一貫性を優先します。

---

## 17. iPhone / iPad

iPhone / iPadの両方を対象とします。

固定座標だけに依存せず、
Safe Areaと画面サイズを考慮してください。

ただし、レスポンシブ対応を理由として
Figmaで明示されたレイアウトを不必要に変更しないでください。

---

## 18. Accessibility

以下を考慮します。

- 十分なTap Target
- Text Contrast
- 状態の識別
- Accessibility Label
- VoiceOver

アクセシビリティ対応によってFigmaとの差異が発生する場合は、
Pull Requestにその理由を記載してください。

---

## 19. Sync UI

同期機能では必要に応じて以下を表示します。

- Syncing
- Last Sync
- Sync Error
- Offline

ただし、同期機能は対応Phaseより前に実装しません。

---

## 20. UI Implementation Flow

UIを実装・変更する場合は以下の順序で確認します。

1. `PRODUCT_SPEC.md` を確認
2. `DESIGN.md` を確認
3. 対象Figma Nodeを特定
4. `./figma-fetch <node-id>` でFigmaデータを取得
5. FigmaのVisual Valueを確認
6. 既存Design Tokenを確認
7. 既存Componentを確認
8. 実装
9. Figmaと比較
10. 差異をPull Requestへ記載

Figma取得前に見た目を推測して実装しないでください。

---

## 21. Pull Request

UI変更を含むPull Requestでは、
Figmaとの差異を確認してください。

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

Figmaを取得できなかった場合は、その事実と理由を明記してください。

---

## 22. Definition of Done

UI実装は少なくとも以下を確認します。

- PRODUCT_SPECに準拠している
- 対象Figma Nodeを確認している
- `figma-fetch` でFigmaデータを取得している
- FigmaのVisual Valueを可能な限り再現している
- 推測値でデザイン済みUIを変更していない
- 既存Design Tokenを確認・再利用している
- 既存Componentを確認・再利用している
- iPhoneでレイアウトが破綻していない
- iPadを考慮している
- Safe Areaを考慮している
- 必要なUI Stateを考慮している
- Figmaとの差異を確認している
- 差異がある場合はPull Requestに理由を記載している

---

## 23. Final Rule

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

デザイン済み画面について、
Figmaから取得可能な値をClaudeの推測で置き換えないでください。

Figmaを取得できない場合は、
推測して実装を続行せず、その理由を報告してください。