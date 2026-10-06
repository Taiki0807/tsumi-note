# つみノート

勉強する → 記録する → 復習する、を1つのアプリで完結させる iPhone / iPad 向け学習管理アプリ（Local First）。

仕様は `docs/` を参照してください。

- [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md) — 機能仕様
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — 技術設計
- [`docs/DESIGN.md`](docs/DESIGN.md) — デザイン（Figma が Visual Design の正）

現在は **Phase 1（アプリ基盤）** まで実装済みです。各タブの画面本体は後続 Phase で実装します。

## 技術スタック

| 用途            | 採用                                          |
| --------------- | --------------------------------------------- |
| Framework       | Expo SDK 57 / React Native 0.86 / React 19    |
| Language        | TypeScript (strict)                           |
| Routing         | Expo Router (file-based, `app/`)              |
| Styling         | NativeWind v4 + Tailwind CSS v3               |
| Local DB        | expo-sqlite + Drizzle ORM                     |
| Package Manager | Bun                                           |
| Test            | Jest (jest-expo) / DB テストは better-sqlite3 |
| Lint / Format   | ESLint (eslint-config-expo) / Prettier        |

## セットアップ

必要なもの: [Bun](https://bun.sh)、Node.js 20+、Xcode（iOS Simulator を使う場合は macOS）。

```bash
bun install
```

## 実行方法

```bash
bun run start   # Expo dev server
bun run ios     # iOS Simulator で起動 (macOS + Xcode)
```

`expo-sqlite` などネイティブモジュールを含むため Expo Go ではなく、必要に応じて development build を使用します。

```bash
bunx expo run:ios
```

## 開発コマンド

```bash
bun run lint          # ESLint
bun run format        # Prettier で整形
bun run format:check  # Prettier のチェックのみ
bun run typecheck     # tsc --noEmit
bun run test          # Jest
bun run check         # 上記すべて（CI 相当）
```

## ディレクトリ構成

```text
app/                  Expo Router（画面）
  _layout.tsx         Root: フォント読み込み / Splash / DB Migration
  (tabs)/             5タブ: records / notes / timer / review / mypage
src/
  components/         共通 UI（TabBar, SplashView, Icon ...）
  design/             Design Tokens（Figma 由来）, useTheme
  db/
    schema.ts         Drizzle schema
    client.ts         expo-sqlite の open / drizzle 初期化
    database-provider.tsx  Migration 実行 + Repository を Context で提供
    repositories/     Repository（UI から SQL を直接書かない）
drizzle/              生成された Migration（SQL + journal）
```

## Design Tokens

`src/design/tokens.ts` に Figma（Blue & Charcoal）から取得した Colors / Typography / Spacing / Radius / Shadow / Icon Size を定義しています。
`tailwind.config.ts` がこれを読み込むため、NativeWind の class（例: `bg-primary`, `text-body-sm`, `rounded-lg`）と同じ値を共有します。
Light / Dark の Theme は `useTheme()` で取得します。画面内で色などを直接書かず、Token を使用してください。

## Database

- Local SQLite が主要なデータソースです（Local First）。ネットワークは通常操作の必須条件ではありません。
- Mutable Entity は `id`（UUID）/ `createdAt` / `updatedAt` / `deletedAt`（tombstone）を持ちます。
- 履歴（Study Session / Answer History / Review History）は追記専用です。Review History と FSRS の現在状態は別テーブルです。
- 時刻はすべて epoch milliseconds です。

### Migration

schema (`src/db/schema.ts`) を変更したら Migration を生成してコミットします。

```bash
bun run db:generate
```

アプリ起動時に `DatabaseProvider` が未適用の Migration を自動実行します。リリース後も既存ユーザーのデータを保持できるよう、
生成済みの Migration ファイルは編集しないでください。

### Repository

```ts
const { folders } = useRepositories();
folders.create({ name: '韓国語' });
```

Repository は `{ db, now, newId }` を受け取るため、テストでは in-memory SQLite と固定の時計 / ID を注入できます（`src/db/test-utils.ts`）。

## Phase 1 で実装していないもの

Better Auth / Sign in with Apple / Google / Email 認証 / Cloudflare Workers / Hono / D1 / Sync は Phase 8 で実装します。
