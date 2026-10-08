# Phase 8 設計書（アカウント認証・クラウド同期）

ステータス: **設計確定(2026-10-08 Issue #16 での決定事項を反映)**。実装はPR単位で進める。
Source of Truth: `docs/PRODUCT_SPEC.md`(機能) / `docs/ARCHITECTURE.md`(技術) / Figma(Visual)。
外部サービスの設定手順: `docs/PHASE8_SETUP.md`。

最優先事項は **既存の学習データを失わないこと**。

## 0. 決定事項と進行状況

| # | 決定 | 内容 |
|---|---|---|
| 1 | PR分割 | 下表の6分割。原則として前のPRがマージされてから次へ進む |
| 2 | 所有モデル | アカウント別SQLiteファイル方式(§2) |
| 3 | 競合 | 競合コピー方式(§4.4) |
| 4 | 変更検知 | Outboxテーブル方式(§4.3) |
| 5 | 画像 | マッピングテーブル方式。既存ファイル名・Markdown参照は書き換えない(§5) |
| 6 | アカウント連携 | v1は連携機能なし。メール一致による自動統合なし。将来連携できるデータモデル(§6) |

| PR | 内容 | 状態 |
|---|---|---|
| 1 | 基盤構築(Workers/Hono/D1)＋メール認証 | **実装済み(レビュー待ち)** |
| 2 | Apple / Google認証＋認証画面 | 未着手(PR 1 のレビュー・確認後) |
| 3 | アカウント別DB切替＋ゲストデータ引き継ぎ | 未着手 |
| 4 | 差分同期 | 未着手 |
| 5 | ノート画像同期 | 未着手 |
| 6 | マイページ・ログアウト・アカウント削除 | 未着手 |

## 1. 現状調査の要約

- ローカルDB: expo-sqlite + Drizzle。`src/db/schema.ts`、migrationは `drizzle/0000`〜`0003`。
- Mutable: `folders` `notes` `questions` `goals`(id/createdAt/updatedAt/deletedAt)、`settings`(key主キー、deletedAtあり)、`fsrs_states`(questionId主キー、現在状態のみ。deletedAtなし)。
- Append-only: `study_sessions` `answer_history` `review_history`。
- `sync_metadata`(key/value)は未使用のプレースホルダー。
- owner/account列は未導入(schema.ts冒頭コメントでPhase 8に決定を委ねている)。
- ノート画像: `<documentDirectory>/note-images/` にファイル保存(`note-image-store.ts`)。Markdown本文から `note-image://<fileName>` で参照。
- Expo設定: bundle identifier `com.taiki0807.tsuminote`、URL scheme `tsumi-note`(`app.json`)。
- ARCHITECTURE §15 は「認証実装前に Anonymous Data / Account-owned Data / ownerId / Logout後のLocal Data の扱いを正式決定する」と定めている → 本書の§2。

## 2. ローカルデータ所有モデル(決定: アカウント別SQLiteファイル)

- ゲスト: `tsumi-note.db`(現行ファイルをそのまま使用。**移行不要・既存データに一切触れない**)。画像は現行の `note-images/`。
- アカウント: `accounts/<accountKey>/tsumi-note.db`、画像は `accounts/<accountKey>/note-images/`。
  `accountKey = sha256(userId)` の先頭を用い、ファイル名に生のuserIdやメールを使わない。
- ログアウトしても各DBは削除しない(再ログインで高速復帰)。別アカウントは別ファイルのため **物理的に閲覧不可**。
- アカウント切替時: ①同期ワーカー停止 ②DBハンドルclose ③画面のキャッシュ(クエリ・状態)破棄 ④画像参照ルート切替 ⑤新DBを開いて同期再開。切替処理は単一のAccountContextに集約し、旧アカウントのハンドルが画面に残らないようにする。
- 案B(全テーブルに `ownerId`)は、クエリの条件漏れが漏洩になり既存機能の書き換えが大きいため不採用。

### 端末内データ保護

DBファイル分離だけでは端末内のアクセス防止にならないため、以下を併用する(PR 3 で実装)。

- 保存先はアプリのサンドボックス内(`documentDirectory`)。iOSのData Protection(既定: 初回ロック解除後まで暗号化)に従う。ファイルには明示的に `NSFileProtectionComplete` 相当を指定できる範囲で指定する。
- 認証トークンは `expo-secure-store`(Keychain)に保存し、アクセシビリティは `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`(iCloudキーチェーンに同期しない)。DBや AsyncStorage にトークンを置かない。
- ログアウト時はトークン削除・メモリ上のキャッシュ破棄を必須とする。
- 共用端末向けに「この端末からアカウントデータを削除」を用意する(ゲストDBは無変更)。
- v1ではSQLCipher等によるDB全体暗号化は行わない(Expo managed構成との相性・複雑さのため)。**懸念事項**として記録し、必要なら別途判断する。

## 3. ゲストデータの引き継ぎ(PR 3)

1. 新規アカウント作成直後: 確認画面 →「この端末のデータを引き継ぐ」。
2. 引き継ぎ = **ゲストDBの内容を新しいアカウントDBへコピー**(ゲストDBは削除・変更しない)。その後アップロード。
3. 既存アカウントでログイン: 端末にゲストデータがある場合は選択画面
   - 「引き継ぐ」: クラウドデータとマージ(IDはUUIDで衝突せず、同一IDは冪等)
   - 「引き継がない」: ゲストDBは **残す**(ログアウト後に再びゲストとして使える)
4. 進捗(件数)を表示。失敗・中断時は再開可能(送信済みはID/opIdで冪等)。
5. 引き継ぎ済みマーカーはゲストDBの `sync_metadata` に記録(二重引き継ぎの確認用)。ゲストデータは自動削除しない。

## 4. 同期プロトコル(PR 4)

### 4.1 サーバー側(D1)

- 全同期テーブルに `user_id` を持たせ、**すべてのクエリで認証済みセッションの `user_id` を条件にする**(クライアント送信のuserIdは使わない)。
- 各行に `server_seq`(ユーザー単位で単調増加)を採番し、これを **同期カーソル** とする。端末時計には依存しない。
- 画像は `note_images`(id, user_id, sha256, size, content_type, deleted_at)。実体はR2(キー `users/<userId>/<sha256>`)。

### 4.2 エンドポイント(Hono)

- `POST /v1/sync/push`: 変更バッチ(最大N件)。`opId` で冪等。バッチ単位でトランザクション。
- `GET /v1/sync/pull?cursor=<server_seq>&limit=N`: `server_seq > cursor` の差分をページング。
- 画像: `PUT /v1/images/:sha256`(存在すればスキップ)、`GET /v1/images/:sha256`(Worker経由で認可して配信)。
- すべて `/v1/*` の認証ミドルウェア(検証済みセッション必須・メール確認済み必須)の配下に置く(PR 1 で実装済み)。

### 4.3 変更検知(決定: Outbox)

- クライアントに `sync_outbox`(opId UUID, entity, entityId, operation(upsert/delete), payload, createdAt, sentAt)を追加。
- **ローカルデータの変更とoutbox登録は同一トランザクション**。登録漏れ防止のためリポジトリ層の書き込み関数に集約する。
- 送信 → サーバーが `opId` を記録(同じopIdは再処理せず前回結果を返す=冪等) → 成功後に `sentAt` を更新。失敗時は未送信のまま再送。
- 削除もoutboxの `delete`(tombstone)として同期する。
- `sync_metadata` に cursor / lastSyncedAt / deviceId を保存。端末の `updatedAt` は順序判定に使わない。
- トリガー: 起動・フォアグラウンド復帰・ローカル変更後(デバウンス)・手動。UIをブロックしない。失敗時は指数バックオフ。
- ログアウト/アカウント切替時は同期を停止し、DBハンドルを切り替える。

### 4.4 競合解決(決定: 競合コピー)

原則: **ユーザーが入力した内容と学習履歴を失わない**。順序は常に「サーバーが受信した順(server_seq)」で決める。

| 対象 | 方式 |
|---|---|
| `study_sessions` `answer_history` `review_history`(Append-only) | IDで重複排除して和集合。更新・削除しない。同時追加でも両方残る |
| `fsrs_states` | 同期対象にするが真実は `review_history`。pull後に履歴から問題ごとに `ts-fsrs` で再計算(履歴を時系列にreplay)。同時復習でも履歴は両方残り、状態は一意に決まる |
| `notes` | 競合コピー対象。本文・タイトルが競合した場合、server_seqで後の変更を本体に採用し、**上書きされる側の内容を新しいノート(競合コピー)として保存** |
| `questions` | 競合コピー対象。上書きされる側を別の問題として保存。競合コピーは新規問題(新ID・FSRS状態は新規)で、元問題の履歴は元IDに残る |
| `folders` | 行単位LWW(server_seq)。名前の競合はコピーを作らない(内容損失が小さいため)。 |
| `goals` / 行動プラン / `settings` | 行単位LWW(server_seq)。コピーは作らない |
| 削除 vs 編集 | 削除(tombstone)を維持し、削除を上書きする復活はさせない。**ただし編集側がノート・問題の場合は編集内容を競合コピーとして保存**し、内容を失わない |
| 削除済みIDの再出現 | サーバーが拒否(tombstoneが勝つ)。古い端末からのupsertで復活しない |
| フォルダー削除 vs ノート移動 | 参照先が削除済みのノート・問題はフォルダー未所属(ルート)に移す。参照整合性を維持 |

競合コピーの扱い:

- ノート・問題に `conflictOfId`(元IDへの参照、nullable)を持たせる(PR 4 でSQLite/D1にカラム追加。既存行はnullで影響なし)。
- UI: 一覧・詳細に「競合コピー」バッジを表示し、元との比較・コピーの統合(内容を元へ反映)・削除ができる(PR 4 〜 6 で実装。Figmaは未デザインのため既存コンポーネントで仮実装し、その旨をPRに記載)。
- 競合コピーも通常の行として同期される(別端末にも同じコピーが現れ、重複作成しない: コピーIDはサーバーが決定的に生成する)。

## 5. ノート画像(決定: マッピングテーブル方式 / PR 5)

- **既存の画像ファイル名とMarkdown本文の `note-image://<fileName>` は変更しない。**既存ノートを壊す移行は行わない。
- ローカルに `note_image_assets`(fileName 主キー, sha256, size, remoteKey, uploadState, downloadState, updatedAt)を追加し、ローカルファイル名 ↔ sha256 ↔ R2オブジェクトの対応を管理する。
- sha256が同一の画像は、R2へは1オブジェクトのみアップロード(`PUT` 前に存在確認)。複数のfileNameが同じsha256を指してよい。
- 状態: `pending_upload / uploaded / pending_download / downloaded / failed`。アップロード失敗でもローカル画像は保持し、再試行する。
- 他端末: Markdown内の `note-image://<fileName>` が未取得なら、マッピングからR2を取得してローカルに同名保存して表示する。
- 未使用画像の削除: どのノート(削除済み含む)からも参照されず、猶予期間(例: 30日)を過ぎたもののみ。参照状態を毎回確認する。
- 画像データはD1に入れない。R2キーは `users/<userId>/<sha256>`、ユーザー単位で認可する。

## 6. 認証(PR 1: メール / PR 2: Apple・Google)

### 6.1 技術選定と互換性(PR 1 で検証)

| 項目 | 結果 |
|---|---|
| `better-auth` 1.7.7 | Hono + Cloudflare D1(Drizzle `sqlite`)で動作。`drizzle-orm ^0.45.2` が peer 要件を満たす。API側のテスト(20件)で動作確認済み |
| `@better-auth/expo` 1.7.7 | サーバープラグイン(`expo()`)をAPIに組み込み済み。クライアント側の peer は `expo-secure-store` `expo-network` `expo-web-browser` `expo-linking` `expo-constants`。いずれも SDK 57 対応版(`57.x`)がnpmに存在することを確認。**アプリ(RN 0.86)への組み込みと実機動作は PR 2 で検証(未確認)** |
| Workers 上の実行 | `wrangler dev` / 実デプロイでの動作は未確認(CI環境にCloudflare認証情報がないため)。テストはBun上のSQLite(同一のmigration SQLを適用)で実施 |
| パスワードハッシュ | Better Auth 既定のscrypt。平文保存なし(テストで確認) |

APIは `api/`(別 `package.json`)。アプリ側の `lint/typecheck/test` からは除外し、`cd api && bun run typecheck && bun run test` で検証する。

### 6.2 メール+パスワード(PR 1 実装)

- 確認メール必須(`requireEmailVerification`)。未確認ではセッションを発行せず403。**確認後も自動サインインしない**(Expoプラグインが `tsumi-note://` への遷移URLにセッションCookieを `cookie` クエリとして付与し、同じschemeを登録した別アプリへ漏れるため)。確認リンクはHTTPSのAPIで処理し、セッションなしで `tsumi-note://verified` を開く。ユーザーはアプリで改めてログインする。`app.ts` の `stripCredentialsFromRedirect` が確認・再設定レスポンスから Set-Cookie と認証情報クエリを多層防御として除去する。
- 確認・再設定トークンの有効期限は1時間。再設定後は全セッションを失効。再設定トークンは使い捨て。
- パスワードポリシー: 10〜128文字、英字+数字、メールのローカル部を含まない。登録・再設定・変更のすべてに適用(`api/src/password-policy.ts`)。
- 列挙対策: 未登録メールへの再設定要求・ログイン失敗・登録済みメールでの再登録は、外形上同じ応答。登録済みメールには本人にだけ通知メールを送る。送信は `waitUntil` で応答と非同期に行う。
- レート制限(IP単位・D1保存、`cf-connecting-ip` のみ信頼): ログイン 5回/分、新規登録 5回/5分、確認メール再送・再設定メール 1回/分、再設定・変更 5回/分、既定 60回/分。
- メール送信失敗はログ(宛先・本文・リンクを含まない)に残す。本番でAPIキー未設定の場合は送信が失敗する(黙って成功扱いにしない)。
- セッション: 有効30日(1日ごとに更新)。`BETTER_AUTH_SECRET` が未設定/32文字未満ならWorkerは500を返し起動しない。
- `/v1/*` は検証済みセッション+メール確認済みを必須とするミドルウェア。ユーザーIDは常にセッション由来。

### 6.3 アカウント連携(決定)

- v1では連携機能を実装しない。`accountLinking` は無効で、**メールが同じでも別プロバイダーのアカウントを自動統合しない**。
- 同じプロバイダーの同じアカウント(`providerId` + `accountId`)での再ログインは既存ユーザーとして扱う。
- データモデルは `user` 1 : N `account`(providerId, accountId, password…)。将来、ログイン済み+再認証を伴うフローで `account` 行を追加すれば連携できる。

### 6.4 Apple / Google(PR 2 予定)

- Apple: `expo-apple-authentication`(ネイティブ)のidToken+nonceをサーバーで検証。Hide My Email対応。
- Google: iOS client IDのidToken、またはPKCE付きOAuth。

## 7. ログアウト / アカウント削除(PR 6)

- ログアウト: セッション破棄・同期停止・DBをゲストへ切替。**アカウントDBは端末に残す**。未同期変更がある場合は警告し「同期してからログアウト」を提示。
- アカウント削除: 再認証 → サーバー: ①全セッション失効 ②D1データ削除 ③R2の `users/<userId>/` 削除 ④Better Authユーザー削除。各段階は冪等でリトライ可能(`deletion_jobs`で進捗管理)。
- 他端末: 次回同期で401/`account_deleted`を受け、同期停止・アカウントDBを削除してゲストへ戻る(ゲストDBは無変更)。

## 8. Figma調査結果

`./figma-fetch 0:1`(ページ「01 · App screens」)を調査した。ページ内のフレーム名にログイン・アカウント・マイページ等に該当する画面は**見つからなかった**(確認できたのは学習・問題・フォルダー・復習関連フレームのみ)。
`./figma-fetch` は Node ID 指定のみで、ファイルのページ一覧を取得できない。他のページに存在する可能性は否定できない。

| 対象(PRODUCT_SPEC番号) | Node ID | 状態 |
|---|---|---|
| 13 アカウント作成 / 14 Email登録 / 17 アカウント / 18 アカウント削除 | 不明 | 未特定 |
| 15 マイページ(未登録) / 16 マイページ(登録済み) | 不明 | 未特定 |

UIを実装するPR 2 以降では、Node IDが得られない画面を**未デザイン**として扱い、既存デザインシステムで仮実装し、PRに「Figma準拠は未確認」と明記する。PR 1 にUI変更はない。

## 9. 懸念事項

- IP単位のレート制限のみで、分散した資格情報スタッフィングには弱い。アカウント単位のロックアウト/遅延は別途検討が必要(PR 2 以降)。
- 端末内DBの暗号化は行わない(§2)。
- `@better-auth/expo` のアプリ組み込み、Workers実環境、メール配信は未確認。
- D1にはトランザクションAPIの制約があり、同期のバッチ処理は `D1.batch` ベースの設計が必要(PR 4 で詳細化)。
