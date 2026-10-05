# つみノート Architecture

## 1. Architecture Goals

つみノートはLocal Firstアプリとして設計する。

原則：

```text
UI
↓
Feature / Hook
↓
Domain / Service / Repository
↓
Local SQLite
```

ネットワークを通常操作の必須条件にしない。

ログイン後もローカルSQLiteをアプリの主要データソースとして使用する。

---

# 2. Technology Stack

## Mobile

- Expo
- React Native
- TypeScript
- Expo Router
- NativeWind
- expo-sqlite
- Drizzle ORM
- ts-fsrs
- expo-notifications

## Authentication

- Better Auth
- @better-auth/expo
- expo-secure-store

Authentication Providers：

- Sign in with Apple
- Google
- Email / Password

## API

v1で実装する。

- Cloudflare Workers
- Hono

## Server Database

- Cloudflare D1
- Drizzle ORM

## Package Manager

- Bun

採用時には現在の安定版および相互互換性を確認する。

過去に検討したバージョン番号を固定採用しない。

---

# 3. Repository

Repository：

```text
tsumi-note/
```

既存LPとは別リポジトリ。

現時点ではモノレポ化しない。

MobileとAPIの具体的なディレクトリ分離は、API実装前にExpo / Cloudflare Workers双方のtoolingを確認して決定する。

MobileとWorkersのruntime・依存関係を混在させない。

---

# 4. Local First

アカウントなしでも全主要機能を利用できる。

```text
┌──────────────────┐
│ React Native App │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Repository Layer │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ SQLite + Drizzle │
└──────────────────┘
```

ログイン後：

```text
                    ┌─────────────────────┐
                    │ Cloudflare Workers  │
                    │ Hono + Better Auth  │
                    └──────────┬──────────┘
                               │
                               ▼
┌───────────────┐       ┌──────────────┐
│ iPhone SQLite │◄─────►│ Cloudflare D1│
└───────────────┘ Sync  └──────┬───────┘
                               │
                        Sync   │
                               ▼
                        ┌─────────────┐
                        │ iPad SQLite │
                        └─────────────┘
```

D1を画面表示の直接的なSource of Truthにはしない。

---

# 5. Account Creation

匿名状態：

```text
Local SQLite
```

アカウント作成：

```text
Local SQLite
↓
Authentication
↓
既存ローカルデータをAccountへ関連付け
↓
Initial Sync
↓
Cloudflare D1
```

既存ローカルデータを消去してサーバーデータへ置き換えない。

---

# 6. Data Model Principles

同期対象のMutable Entityは必要に応じて、

```text
id
createdAt
updatedAt
deletedAt
```

を持つ。

IDはオフライン生成可能かつ端末間で衝突しない形式を採用する。

UUID / ULID等を実装時に比較して決定する。

---

# 7. Mutable Entity

例：

- Folder
- Note
- Question
- Goal
- Settings

更新されるデータ。

v1では必要に応じてLast Write Winsを利用できる。

ただし同期実装時に競合ルールを明示する。

---

# 8. Append-only Event

例：

- Study Session
- Answer History
- Review History

履歴データは基本的に追記型とする。

過去履歴を更新して失わない。

---

# 9. Database

想定ドメイン：

```text
Folder
Note
Question
Answer History
Review History
FSRS State
Study Session
Goal
Settings
Sync Metadata
```

実装時に適切な正規化・relationを検討する。

この名称をそのままテーブル名として強制するものではない。

重要：

```text
Review History ≠ FSRS Current State
```

履歴と現在状態を分離する。

---

# 10. FSRS

`ts-fsrs` を使用する。

採用時点の実際のAPI・型を確認してDBを設計する。

推測したFSRS schemaを先に固定しない。

概念：

```text
Question
   │
   ▼
Review History
   │
   ▼
FSRS
   │
   ▼
Current Scheduling State
   │
   ▼
Next Due
```

---

# 11. Timer

単純なsetIntervalを正としない。

概念：

```text
startedAt
endAt

remaining = endAt - now
```

Background / Foreground復帰時に現在時刻から再計算する。

Study Session完了時にSQLiteへ履歴を保存する。

---

# 12. Sync

同期対象：

- Study Sessions
- Notes
- Folders
- Questions
- Review State
- Review History
- Goals
- Settings

同期候補タイミング：

- App Launch
- Foreground復帰
- Local変更後
- Manual Sync

UIを同期完了までblockしない。

---

# 13. Differential Sync

毎回全データを送受信しない。

ただし、

```text
updatedAt > lastSyncedAt
```

だけに依存しない。

端末clock skewを考慮する。

本格実装時には、

- Server Cursor
- Revision
- Change Sequence

等を検討する。

同期プロトコルはAPI実装Phaseで正式決定する。

---

# 14. Deletion

同期対象Mutable Entityは原則として即時物理削除しない。

```text
deletedAt
```

を利用したtombstone方式を基本とする。

他端末へ削除を同期できるようにする。

物理削除のタイミングは同期設計時に決定する。

---

# 15. Logout

LogoutとAccount Deletionを分離する。

LogoutではServer Dataを削除しない。

以下の事故を防止する。

```text
User A
↓
Logout
↓
User B Login
↓
User AのLocal DataがUser BへSync
```

認証実装前に、

- Anonymous Data
- Account-owned Data
- ownerId / accountId
- Logout後のLocal Data

の扱いを正式決定する。

---

# 16. Account Deletion

Account Delete時：

- Authentication Account
- Server Sync Data
- Account-owned Local Data

を削除対象とする。

複数端末にも削除状態を伝播可能にする。

App Store公開要件を考慮する。

---

# 17. Security

禁止：

- PasswordをSQLiteへ保存
- Token / SessionをAsyncStorageへ平文保存
- API SecretをMobile Appへ埋め込む
- SecretをGitへCommit

認証情報：

```text
expo-secure-store
```

等の安全なstorageを利用する。

API側でもinput validationを実施する。

---

# 18. Code Structure

基本：

```text
UI
↓
Feature / Hook
↓
Domain / Service
↓
Repository
↓
SQLite
```

避ける：

- Componentから直接SQL
- UIへのFSRSロジック直書き
- any乱用
- 巨大Component
- 不要なGlobal State
- Error握りつぶし
- 過剰なClean Architecture

---

# 19. Database Migration

Drizzleによるmigration可能な構成とする。

App Storeリリース後もユーザーの既存SQLiteデータを失わずschema migrationできることを前提とする。

---

# 20. Testing

特に以下をUIから分離してtest可能にする。

- Timer Calculation
- Study Time Aggregation
- Error Rate Calculation
- Review Selection
- FSRS Integration
- Repository
- Sync Logic

lint / format / typecheck / testをCIで実行可能な構成とする。

---

# 21. Development Phases

## Phase 1 — Foundation

- Expo / React Native / TypeScript
- Expo Router
- NativeWind
- Design System
- Bottom Navigation
- Splash
- SQLite
- Drizzle
- Migration
- Local First Repository foundation
- lint / format / typecheck / test

## Phase 2 — Timer

Timer + Study Session。

## Phase 3 — Records

Weekly Study Records / Analytics。

## Phase 4 — Folder & Questions

Folder / Question / Answer History。

## Phase 5 — FSRS Review

FSRS / Review Session / Review History。

## Phase 6 — Notes

Markdown Notes。

## Phase 7 — Goals & Settings

Goal / Notification / Settings。

## Phase 8 — Account / API / Sync

- Better Auth
- Apple
- Google
- Email / Password
- Cloudflare Workers
- Hono
- Cloudflare D1
- Initial Upload
- Differential Sync
- iPhone / iPad Sync
- Logout lifecycle
- Account deletion propagation

## Phase 9 — Release

- Data Export
- Privacy
- Terms
- TestFlight
- App Store preparation

API・Authentication・Syncはv1正式スコープであり、Phase 8で実装する。