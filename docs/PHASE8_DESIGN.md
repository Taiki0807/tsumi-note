# Phase 8 設計書（ドラフト・要確認）

ステータス: **ドラフト。「9. 確認事項」の回答待ち。回答前は実装に着手しない。**
Source of Truth: `docs/PRODUCT_SPEC.md`(機能) / `docs/ARCHITECTURE.md`(技術) / Figma(Visual)。

最優先事項は **既存の学習データを失わないこと**。

---

## 1. 現状調査の要約

- ローカルDB: expo-sqlite + Drizzle。`src/db/schema.ts`、migrationは `drizzle/0000`〜`0003`。
- Mutable: `folders` `notes` `questions` `goals`(id/createdAt/updatedAt/deletedAt)、`settings`(key主キー、deletedAtあり)、`fsrs_states`(questionId主キー、現在状態のみ。deletedAtなし)。
- Append-only: `study_sessions` `answer_history` `review_history`。
- `sync_metadata`(key/value)は未使用のプレースホルダー。
- owner/account列は未導入(schema.ts冒頭コメントでPhase 8に決定を委ねている)。
- ノート画像: `<documentDirectory>/note-images/` にファイル保存(`note-image-store.ts`)。Markdown本文からファイル名で参照。
- ARCHITECTURE §15 は「認証実装前に Anonymous Data / Account-owned Data / ownerId / Logout後のLocal Data の扱いを正式決定する」と定めている → 本書の §2。

## 2. ローカルデータ所有モデル(最重要)

### 案A(推奨): アカウントごとに別のSQLiteファイル

- ゲスト: `tsumi-note.db`(現行ファイルをそのまま使用。**移行不要・既存データに一切触れない**)。
- アカウント: `tsumi-note-<hash(userId)>.db`、画像は `note-images/<hash(userId)>/`。
- ログアウトしても各DBは削除しない。別アカウントでログインしても、別ファイルなので **物理的に閲覧不可**。
- 利点: 既存スキーマ・リポジトリ・テストをほぼ無変更で使える。取り違えによる漏洩が構造的に起きない。
- 欠点: DB切替時にアプリ側のDBプロバイダー再初期化が必要。

### 案B: 全テーブルに `ownerId` 列を追加

- 全リポジトリのクエリにowner条件が必要で、既存学習機能への変更が大きく、条件漏れ=漏洩になる。Issueの「既存機能を大幅に書き換えない」に反するため非推奨。

## 3. ゲストデータの引き継ぎ

1. 新規アカウント作成直後: 確認画面 →「この端末のデータを引き継ぐ」。
2. 引き継ぎ = **ゲストDBの内容を新しいアカウントDBへコピー**(ゲストDBは削除しない)。その後アップロード。
3. 既存アカウントでログイン: 端末にゲストデータがある場合は選択画面
   - 「引き継ぐ」: クラウドデータとマージ(IDはUUIDなので衝突せず、同一IDは冪等)
   - 「引き継がない」: ゲストDBは **残す**(ログアウト後に再びゲストとして使える)
4. 引き継ぎ状況(件数/進捗)を表示。失敗・中断時は再開可能(送信済みはIDで冪等)。
5. 引き継ぎ済みマーカーはゲストDBの `sync_metadata` に記録(二重引き継ぎ確認用)。ゲストデータは自動削除しない。

## 4. 同期プロトコル

### 4.1 サーバー側(D1)

- 全同期テーブルに `user_id` を持たせ、**すべてのクエリで認証済みセッションの `user_id` を条件にする**(クライアント送信のuserIdは使わない)。
- 各行に `server_seq`(ユーザー単位で単調増加する変更番号)。書き込みのたびに採番し、これを **同期カーソル** とする。端末時計には依存しない。
- 画像は `note_images`(id, user_id, sha256, size, content_type, deleted_at)。実体はR2(キー `users/<userId>/<sha256>`)。

### 4.2 エンドポイント(Hono)

- `POST /sync/push`: 変更バッチ(最大N件)。`opId`(クライアント生成UUID)で冪等。バッチ単位でトランザクション。
- `GET /sync/pull?cursor=<server_seq>&limit=N`: `server_seq > cursor` の差分をページング。
- 画像: `PUT /images/:sha256`(存在すればスキップ)、`GET /images/:sha256`(user_idスコープ、署名なしでWorker経由の認可付き配信)。
- 認証: Better Authのセッション。全`/sync` `/images`でセッション検証。

### 4.3 クライアント

- ローカルに `sync_outbox`(未送信変更、opId付き)を追加。リポジトリの書き込みと同一トランザクションでoutboxへ記録、または `updatedAt`/dirtyフラグ方式(§9 Q4)。
- `sync_metadata` に cursor / lastSyncedAt / deviceId を保存。
- トリガー: 起動・フォアグラウンド復帰・ローカル変更後(デバウンス)・手動。UIをブロックしない。失敗時は指数バックオフ。
- ログアウト/アカウント切替時は同期を停止し、DBハンドルを切り替える。

### 4.4 競合解決

| 種別 | 方式 |
|---|---|
| Append-only(study_sessions, answer_history, review_history) | IDで重複排除し和集合。更新・削除しない。**履歴は決して失われない** |
| fsrs_states | 同期対象にするが、真実は `review_history` とする。pull後に履歴から問題ごとに状態を再計算(ts-fsrs)。同時復習でも履歴は両方残る |
| notes / questions / folders / goals / settings | フィールド単位ではなく行単位のLWW。ただし順序は **サーバー受信順(server_seq)**。端末の`updatedAt`は比較に使わない |
| 同じノートを両端末で編集 | 後勝ちで上書きされる側の本文は、**「競合コピー」ノートとして保存**(本文を失わない)※ §9 Q3 |
| 削除 vs 編集 | 削除(tombstone)が勝つが、編集側が後なら復活させず競合コピーを残す。削除済みIDの再出現はサーバーが拒否 |
| goals / action plan | 行単位LWW(v1は単一アクティブGoal) |

## 5. ノート画像

- ローカルファイル名を内容のsha256ベースにして重複アップロードを防止(現行のファイル名方式からの移行が必要:本文中の参照を書き換えず、`note_images`のマッピングで解決する案を推奨)。
- 状態: `pending_upload / uploaded / pending_download / downloaded / failed` をローカルに保持。
- アップロード失敗でもローカル画像は保持。他端末はMarkdown参照→未取得なら取得して表示。
- 未使用画像の削除: どのノート(削除済み含む)からも参照されず、かつ猶予期間(例: 30日)を過ぎたもののみ。

## 6. 認証

- Better Auth + `@better-auth/expo` + `expo-secure-store`。Hono上にマウント、D1アダプター(Drizzle/Kysely経由)。
- メール/パスワード: 確認メール必須、再設定、レート制限、パスワードポリシー(8文字以上等)。送信はResend。
- Apple: `expo-apple-authentication`(ネイティブ)でidToken+nonceをサーバー検証。Hide My Email対応(リレーアドレスを許容)。
- Google: ネイティブ(iOS client ID)のidToken、またはPKCE付きOAuth。
- **異なる認証方式のメール同一によるアカウント自動統合はしない**(`accountLinking`無効)。連携は再認証を伴う別フローで、v1では対象外とすることを提案(§9 Q6)。
- 注意: Better Auth / `@better-auth/expo` の現行バージョンとExpo SDK 57(RN 0.86)の互換性は未検証。着手時に確認する。

## 7. ログアウト / アカウント削除

- ログアウト: セッション破棄・同期停止・DBをゲストへ切替。**アカウントDBは端末に残す**(再ログイン時に高速復帰)。未同期変更がある場合は警告し「同期してからログアウト」を提示。共用端末向けに「この端末からアカウントデータを削除」も用意。
- アカウント削除: 再認証 → サーバー: ①全セッション失効 ②D1データ削除 ③R2の `users/<userId>/` 削除 ④Better Authユーザー削除。各段階は冪等でリトライ可能(`deletion_jobs`テーブルで進捗管理)。
- 他端末: 次回同期で401/`account_deleted`を受け、同期停止・アカウントDBを削除してゲストへ戻る(ゲストDBは無変更)。

## 8. 実装ステップと分割提案

`apps/api`(Workers)をこのリポジトリ内の `api/` に追加し、bun workspace化はせず別package.jsonで管理する案。ステップは Issue §18 の順。**1PRは巨大になるため、以下のPR分割を提案**(§9 Q1):

1. 設計確定 + Workers/D1/R2基盤 + メール認証(API)
2. Apple/Google + 認証画面
3. DB切替(案A) + ゲスト引き継ぎ
4. 差分同期(テキスト系データ)
5. 画像同期
6. マイページ・ログアウト・アカウント削除

## 9. 確認事項(実装前に回答が必要)

- **Q1 分割**: 上記6分割でPRを分けて良いか。それとも1PRか。
- **Q2 所有モデル**: §2 案A(アカウント別DBファイル)で良いか。
- **Q3 競合**: 編集競合時に「競合コピー」を作る方針で良いか(ノート本文を失わない代わりにノートが増える)。問題も同様に良いか。
- **Q4 変更検知**: outboxテーブル方式(推奨・既存リポジトリへの追記が必要)か、updatedAt/dirty列方式か。
- **Q5 画像命名**: sha256ベースへ移行する際、既存画像ファイルの改名とMarkdown本文の参照書き換え(データ変更を伴う)を許容するか。許容しない場合はマッピングテーブル方式。
- **Q6 アカウント連携**: 異なる認証方式の連携はv1非対応(別アカウント扱い)で良いか。
- **Q7 メール**: 送信元ドメイン・Resendアカウントの用意状況と、アプリのbundle identifier / URL scheme。
- **Q8 Figma**: `./figma-fetch` にはノードIDが必要です。アカウント関連画面(13,14,17,18、マイページ15,16)のNode IDを教えてください。

## 10. 手動設定(開発者作業・概要)

- Apple: App IDで Sign in with Apple capability有効化 / Services ID・Key(.p8) / Team ID。
- Google: OAuth client(iOS)作成、bundle ID設定、reverse client IDをURL schemeへ。
- Resend: ドメイン認証(SPF/DKIM)、APIキー。
- Cloudflare: Worker、D1作成とmigration、R2バケット、Secrets(`BETTER_AUTH_SECRET` `RESEND_API_KEY` `APPLE_*` `GOOGLE_*`)、環境別(dev/prod)。
- 秘密情報はコミットしない。変数名は `.env.example` に記載予定。
