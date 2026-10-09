# Phase 8 外部サービス設定手順

PR 1(基盤＋メール認証)で必要な設定と、PR 2 以降で必要になる設定をまとめる。
**以下の外部サービスはいずれも設定状況が未確認**であり、記載の値(ドメイン・ID等)は例。実値は開発者が設定する。
秘密情報(APIキー・秘密鍵・Secret)は絶対にコミットしない。

## 0. Expo設定から確認できた値

| 項目 | 値 | 出典 |
|---|---|---|
| iOS Bundle Identifier | `dev.hosokawalab.tsuminote` | `app.json` `expo.ios.bundleIdentifier` |
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

**PR 2 で追加(API / Worker)**

| 名前 | 種別 | 用途 | 設定場所 |
|---|---|---|---|
| `APPLE_APP_BUNDLE_ID` | 非機密 | 設定するとSign in with Appleが有効。IDトークンの audience として検証する(`dev.hosokawalab.tsuminote`) | `wrangler.toml` `[vars]`(環境ごと) |
| `GOOGLE_CLIENT_IDS` | 非機密 | 設定するとGoogleログインが有効。iOSクライアントID(カンマ区切りで複数可)。IDトークンの audience として検証する | 同上 |

どちらも未設定ならそのプロバイダーは無効。ネイティブのIDトークン方式のみを使うため、Apple の `.p8` / client secret や Google の client secret は**不要**(API は保持しない)。

**PR 2 で追加(アプリ / Expo、`.env.example` 参照。`EXPO_PUBLIC_*` はビルドに埋め込まれる公開値)**

| 名前 | 用途 |
|---|---|
| `EXPO_PUBLIC_API_URL` | 認証APIのURL。未設定ならアカウント機能は無効(ゲスト利用のみ)。本番は https 必須、開発のみ `http://localhost` / プライベートIPを許可 |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | GoogleのiOSクライアントID。未設定ならGoogleログインは無効。設定すると `app.config.ts` が逆順ドメインのURL schemeを登録する |

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
5. `[env.production.vars]` の `BETTER_AUTH_URL`(https 必須)・`EMAIL_FROM` と `[[env.production.d1_databases]]` の `database_id` を実値に変更し、`bun run deploy`。
   - `bun run deploy` は `check:deploy`(`scripts/check-deploy.ts`)で設定を検証してから `wrangler deploy --env production` を実行する。
     ダミー値(`.invalid` / `0000…`)の残存、top-level への `APP_ENV`/D1 配置、http の `BETTER_AUTH_URL` は検出して中止する。
   - `wrangler.toml` の top-level には `APP_ENV` を置かない。環境指定なしの `wrangler deploy` を直接実行しても、`APP_ENV` 未設定のため Worker は 500 で停止する。**直接 `wrangler deploy` は使わない**こと。
   - 開発用Workerのデプロイは提供しない(開発は `bun run dev` のローカルのみ)。
6. ローカル開発: `api/.dev.vars.example` を `api/.dev.vars` にコピーして値を設定し `bun run dev`(`--env development`、`http://localhost:8787`)。

開発と本番の違い: 開発は `APP_ENV=development`(`RESEND_API_KEY` 未設定ならメール送信をスキップ、Cookieの `Secure` なし、ローカル/プライベートIPの `exp://…/--/<path>` を許可)。
本番は `APP_ENV=production`(APIキー未設定ならメール送信が失敗、Secure Cookie 必須、https 必須、`exp://` 不許可)。D1・Secrets は環境ごとに分離する。
`APP_ENV` は `production` / `development` 以外(未設定含む)だと全リクエストが 500 になる。

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
- **リダイレクト先は完全一致の許可リストのみ**(`api/src/redirect-policy.ts`)。`callbackURL` / `redirectTo` / `errorCallbackURL` / `newUserCallbackURL` は
  `tsumi-note://reset-password` と `tsumi-note://verified`(および任意設定の Universal Link `<APP_UNIVERSAL_LINK_ORIGIN>/auth/<path>`)以外は 403 で拒否し、メール送信もトークン発行もしない。
  `%` エンコード・userinfo・大文字小文字違い・末尾スラッシュ・query/fragment 付きも拒否する。PR 2 のアプリ側 deep link はこの2つに合わせる。
- **Origin とリダイレクト先の分離**: `@better-auth/expo` は `expo-origin`(= `tsumi-note://`)を `Origin` に設定し、Better Auth は
  `Origin` もリダイレクト先も同じ `trustedOrigins` で検証する。そのため `trustedOrigins` には `tsumi-note://` を含めるが、
  これだけでは `tsumi-note://evil/steal` も通ってしまう。リダイレクト先は `before` hook(`isAllowedRedirect`)が完全一致で必ず再検証する(hook を外してはならない)。
  `disableOriginCheck: false` を明示し、`NODE_ENV=test` でも Origin 検証が有効になるようにしている。Cookie 付きのPOSTは `Origin` が必須(クライアントは常に `expo-origin` を送る)。
- **Universal Links の評価**: カスタムURL Schemeは他アプリが同じSchemeを登録すると再設定トークンを奪われる余地が残る。
  本番では Universal Links(HTTPS + `apple-app-site-association`)への移行を推奨する。`APP_UNIVERSAL_LINK_ORIGIN` を設定すると
  `https://<origin>/auth/reset-password` 等を許可できる(AASA配置・Associated Domains はPR 2 以降で対応。未確認)。
- deep link を受ける画面は PR 2 で追加済み: `tsumi-note://verified` → `app/verified.tsx`、`tsumi-note://reset-password?token=…` → `app/reset-password.tsx`
  (expo-router がパスに対応づける)。これ以外のパスは `app/+not-found.tsx` でホームへ戻す。認証情報らしきクエリ(`cookie` / `session_token` / `bearer` / `access_token`)が付いたリンクは信用しない(`src/features/auth/deep-link.ts`)。

## 5. Apple(PR 2 で実装済み・設定と実機動作は未確認)

実装方式: アプリが `expo-apple-authentication` でIDトークンを取得(`nonce` はログインごとにランダム生成し、SHA-256をAppleへ、生値をAPIへ渡す)し、
`POST /api/auth/sign-in/social` に `idToken` を送る。API は Apple の公開鍵・issuer・audience(`APPLE_APP_BUNDLE_ID`)・nonce を検証する。

1. Apple Developer Program に加入済みであることを確認。
2. Certificates, Identifiers & Profiles → Identifiers → App ID(`dev.hosokawalab.tsuminote`)で **Sign in with Apple** Capability を有効化。
3. アプリ側: `app.json` に `ios.usesAppleSignIn: true` と `expo-apple-authentication` プラグインを設定済み。**Expo Go では動かない**ため、Development Build(`expo prebuild` + EAS Build など)が必要。Provisioning Profile の再生成が必要になる場合がある。
4. ネイティブのみのため Services ID・`.p8` Key・client secret は不要(Web/Androidフローを使う場合のみ必要)。
5. API の `APPLE_APP_BUNDLE_ID` に Bundle ID を設定する。
6. Hide My Email: リレーアドレス(`@privaterelay.appleid.com`)で届く。メール送信元ドメインを Apple の「Sign in with Apple for Email Communication」に登録しないとリレー宛メールが届かない。

## 6. Google(PR 2 で実装済み・設定と実機動作は未確認)

実装方式: アプリが `expo-auth-session` で認可コードフロー(**PKCE + state + nonce**)を行い、Googleのトークンエンドポイントからアプリ内で `id_token` を取得して
`POST /api/auth/sign-in/social` に `idToken`(+ nonce)を送る。セッションを deep link に載せるブラウザ経由のリダイレクト方式は使わず、API も拒否する
(`idToken` なしの `/sign-in/social`、`/callback/*`、`/link-social` は 400/404)。API は Google の公開鍵・issuer・audience(`GOOGLE_CLIENT_IDS`)・nonce を検証する。

1. Google Cloud Console でプロジェクト作成 → OAuth同意画面(アプリ名・サポートメール・プライバシーポリシーURL等)。
2. 認証情報 → OAuth クライアントID → 種類「iOS」、Bundle ID に `dev.hosokawalab.tsuminote` を指定。
3. 発行された iOS クライアントIDを、アプリの `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` と API の `GOOGLE_CLIENT_IDS` の両方に設定する。
   リダイレクトURI(`com.googleusercontent.apps.<id>:/oauthredirect`)の URL scheme は `app.config.ts` が自動で Info.plist に登録する(Development Build の再ビルドが必要)。
4. client secret は不要(iOSクライアントはPKCEを使用)。
5. 公開状態が「テスト」の間はテストユーザーのみ利用可。

## 6.5 アカウントの扱い(PR 2 の範囲)

- 同じメールアドレスでも、認証方式が異なるアカウントは自動統合しない(`accountLinking` は無効)。メール登録済みのメールでGoogle/Appleを使うと、APIはログインを拒否する。連携機能はv1では提供しない。
- PR 2 時点では、ログインしても**ローカルDBの切替・ゲストデータ引き継ぎ・同期は行わない**(PR 3 以降)。ゲストの学習データには触れず、ログアウトしても削除しない。

## 7. 開発環境と本番環境

| 項目 | 開発 | 本番 |
|---|---|---|
| Worker | `wrangler dev`(localhost:8787) | `--env production` |
| D1 | ローカル(`.wrangler/`) | 別のD1データベース |
| Secrets | `.dev.vars` | `wrangler secret put --env production` |
| メール | スキップ可 | Resend 必須 |
| iOS実機から開発APIへ | `BETTER_AUTH_URL` を端末から到達可能なURLにする(例: LAN IP / トンネル) | 独自ドメイン |

## 8. メール確認後の再ログイン

`emailVerification.autoSignInAfterVerification` は `false` のままにしてください。`true` にすると、確認後のカスタムURL Schemeへの遷移URLにセッションCookieが付与され、同じschemeを登録した別アプリに漏れます。確認後はアプリで改めてログインする仕様です。

## 9. ローカルでの動作確認手順(PR 2)

1. API: `cd api && cp .dev.vars.example .dev.vars`(`BETTER_AUTH_SECRET` を32文字以上で設定。`RESEND_API_KEY` 未設定ならメール送信はスキップされる)→ `bun run db:migrate:local` → `bun run dev`。
2. アプリ: ルートで `.env.example` を `.env` にコピーし、`EXPO_PUBLIC_API_URL` に**端末から到達できる**APIのURLを設定する(実機ならLANのIP。例 `http://192.168.0.10:8787`。API側の `BETTER_AUTH_URL` も同じURLにする)。
3. Development Build で起動する(Apple / Google ログインとdeep linkは Expo Go では確認できない)。
4. 確認の流れ: マイページ →「アカウントを作成」→ メールで登録 → 確認メールのリンク → `tsumi-note://verified` でアプリが開く → ログイン → マイページのメールアドレスとログアウトを確認。
5. `EXPO_PUBLIC_API_URL` を空にして起動すると、アカウント機能は無効(ボタンは無効化)で、ゲスト利用だけが通常どおり動く。
