# Phase 8 外部サービス設定手順

PR 1(基盤＋メール認証)で必要な設定と、PR 2 以降で必要になる設定をまとめる。
**以下の外部サービスはいずれも設定状況が未確認**であり、記載の値(ドメイン・ID等)は例。実値は開発者が設定する。
秘密情報(APIキー・秘密鍵・Secret)は絶対にコミットしない。

## 0. Expo設定から確認できた値

| 項目 | 値 | 出典 |
|---|---|---|
| iOS Bundle Identifier | `com.taiki0807.tsuminote` | `app.json` `expo.ios.bundleIdentifier` |
| URL Scheme | `tsumi-note` | `app.json` `expo.scheme` |
| Expo SDK | 57 / React Native 0.86 | `package.json` |

Apple Developer 側の App ID がこの Bundle Identifier で登録済みかは未確認。

## 1. 環境変数・Secrets 一覧

| 名前 | 種別 | 用途 | 設定場所 |
|---|---|---|---|
| `BETTER_AUTH_SECRET` | 秘密 | Better Auth の署名・暗号化鍵(32文字以上) | `wrangler secret put` / ローカルは `.dev.vars` |
| `RESEND_API_KEY` | 秘密 | メール送信(Resend) | 同上 |
| `BETTER_AUTH_URL` | 非機密 | APIの公開URL。メール内リンクの生成元 | `wrangler.toml` `[vars]` |
| `EMAIL_FROM` | 非機密 | 送信元(Resendで認証済みドメイン) | 同上 |
| `APP_ENV` | 非機密 | `development` / `production` | 同上 |
| `APP_SCHEME` | 非機密 | メール内リンクのリダイレクト先(deep link) | 同上 |
| `DB` | binding | Cloudflare D1 | `wrangler.toml` `[[d1_databases]]` |

PR 2 以降: `APPLE_CLIENT_ID` `APPLE_TEAM_ID` `APPLE_KEY_ID` `APPLE_PRIVATE_KEY` / `GOOGLE_IOS_CLIENT_ID` 等。
PR 5 以降: R2 binding(`IMAGES`)。

## 2. Cloudflare(Workers / D1)

1. Cloudflare アカウントを用意し `bunx wrangler login`(`api/` で実行)。
2. D1 作成: `bunx wrangler d1 create tsumi-note-db`(本番は `tsumi-note-db-production`)。
   出力された `database_id` を `api/wrangler.toml` に設定する(現在はダミーの `0000…`)。
3. マイグレーション適用:
   - ローカル: `bun run db:migrate:local`
   - 本番: `bun run db:migrate:remote`(`--env production` を付けて本番DBを対象にする)
4. Secrets 登録:
   `bunx wrangler secret put BETTER_AUTH_SECRET`、`bunx wrangler secret put RESEND_API_KEY`
   (本番は `--env production`)。
5. `BETTER_AUTH_URL` を実際のWorker URL(またはカスタムドメイン)に変更し `bun run deploy`。
6. ローカル開発: `api/.dev.vars.example` を `api/.dev.vars` にコピーして値を設定し `bun run dev`(`http://localhost:8787`)。

開発と本番の違い: 開発は `APP_ENV=development`(`RESEND_API_KEY` 未設定ならメール送信をスキップ、Cookieの `Secure` なし、`exp://` を許可)。
本番は `APP_ENV=production`(APIキー未設定ならメール送信が失敗、Secure Cookie、`exp://` 不許可)。D1・Secrets は環境ごとに分離する。

## 3. Resend(メール送信)

1. Resend でアカウント作成、送信ドメインを追加。
2. 表示される DNS レコード(SPF / DKIM、推奨で DMARC)を DNS に登録し、Verified になるまで待つ。
3. API キーを発行(Sending access 権限・対象ドメイン限定を推奨)→ `RESEND_API_KEY` に登録。
4. `EMAIL_FROM` を認証済みドメインのアドレスにする(例 `つみノート <noreply@<your-domain>>`)。
未認証ドメインからは送信できない。ドメイン未取得の間は Resend のテスト送信元でのみ検証可能(本番利用不可)。

## 4. 確認・再設定メールのリンクとアプリ側

- 確認メールのリンク: `<BETTER_AUTH_URL>/api/auth/verify-email?token=…&callbackURL=tsumi-note://…`
  サーバーが検証後、`callbackURL`(deep link)へリダイレクトする。
- 再設定メールのリンク: `<BETTER_AUTH_URL>/api/auth/reset-password/<token>?callbackURL=tsumi-note://reset-password`
  サーバーが検証後、`tsumi-note://reset-password?token=…` へリダイレクトする(無効・期限切れは `?error=INVALID_TOKEN`)。
- クライアントの `requestPasswordReset({ redirectTo: 'tsumi-note://reset-password' })` / `sendVerificationEmail({ callbackURL: 'tsumi-note://…' })` で指定する。
- deep link を受ける画面・クライアント実装は PR 2(認証画面)で追加する。PR 1 はサーバー側のみ。

## 5. Apple(PR 2 で使用・未確認)

1. Apple Developer Program に加入済みであることを確認。
2. Certificates, Identifiers & Profiles → Identifiers → App ID(`com.taiki0807.tsuminote`)で **Sign in with Apple** Capability を有効化。
3. ネイティブ(iOSアプリ)のみなら Services ID は不要。Web/Androidフローを使う場合のみ Services ID と Return URL を作る。
4. Keys → Sign in with Apple を有効にした Key を作成し `.p8` をダウンロード(再ダウンロード不可)。Key ID・Team ID を控える。
5. `.p8` の内容から client secret(JWT)を生成してSecretに登録する。**`.p8` はコミットしない。**
6. Hide My Email: リレーアドレス(`@privaterelay.appleid.com`)で届く。メール送信元ドメインを Apple の「Sign in with Apple for Email Communication」に登録しないとリレー宛メールが届かない。

## 6. Google(PR 2 で使用・未確認)

1. Google Cloud Console でプロジェクト作成 → OAuth同意画面(アプリ名・サポートメール・プライバシーポリシーURL等)。
2. 認証情報 → OAuth クライアントID → 種類「iOS」、Bundle ID に `com.taiki0807.tsuminote` を指定。
3. 発行される iOS クライアントID と、その reverse client ID(`com.googleusercontent.apps.<id>`)を URL scheme に追加する(`app.json`。PR 2 で対応)。
4. サーバー側で ID トークンを検証するため、サーバーの client ID(Web クライアント)も必要になる場合がある。
5. 公開状態が「テスト」の間はテストユーザーのみ利用可。

## 7. 開発環境と本番環境

| 項目 | 開発 | 本番 |
|---|---|---|
| Worker | `wrangler dev`(localhost:8787) | `--env production` |
| D1 | ローカル(`.wrangler/`) | 別のD1データベース |
| Secrets | `.dev.vars` | `wrangler secret put --env production` |
| メール | スキップ可 | Resend 必須 |
| iOS実機から開発APIへ | `BETTER_AUTH_URL` を端末から到達可能なURLにする(例: LAN IP / トンネル) | 独自ドメイン |
