# 外部サービス連携API（v1.1.0）

他の学習サービスから、つみノートへ学習記録を登録・参照するためのAPIです。

## 認証・認可

- 認証は **個人APIトークン**（`Authorization: Bearer tsn_...`）。
- トークンはサーバーに SHA-256 ハッシュだけを保存し、発行時の応答でのみ平文を返します（再表示不可）。平文はログにも記録しません。
- トークンには **権限（scope）** があり、APIごとに必要な権限が決まっています。足りない場合は `403 insufficient_scope`。

  | scope | できること |
  | --- | --- |
  | `study_sessions:write` | 学習記録の登録（`POST /external/v1/study-sessions`） |
  | `study_sessions:read` | 学習記録の一覧・集計の取得（`GET /external/v1/study-sessions`、`GET /external/v1/study-summary`） |

- アカウント操作、同期、トークン管理には使えません。
- 登録・取得の対象は常にトークンの持ち主です（リクエストにユーザーIDは含められません）。他のユーザーのデータは取得できません。
- 失効・期限切れ・存在しない・メール未確認・削除依頼済みのアカウントは、区別なく `401` を返します。
- アカウント削除時にトークンも削除されます（`ON DELETE CASCADE`）。
- トークンごとに 60 回/分のレート制限があります（読み取りも合算。超過は `429`）。
- 判定の順序は **認証（401） → レート制限（429） → 権限（403） → 入力検証（400/422）** です。

## トークン管理（ログイン中のセッションのみ）

| メソッド | パス | 内容 |
| --- | --- | --- |
| `POST` | `/v1/api-tokens` | 発行。`201` で `token`（平文）を返す。1ユーザー5個まで |
| `GET` | `/v1/api-tokens` | 有効なトークンの一覧（平文は含まない。期限切れも失効するまで表示） |
| `DELETE` | `/v1/api-tokens/:id` | 失効 |

発行のリクエスト:

```json
{ "name": "ドリルアプリ", "scopes": ["study_sessions:write", "study_sessions:read"], "expiresInDays": 90 }
```

- `name`（必須）: 1〜50文字。
- `scopes`（任意）: 省略時は `["study_sessions:write"]`（登録専用。v1.1.0 初期のトークンと同じ）。不正な値は `400 invalid_scopes`。
- `expiresInDays`（任意）: 1〜365 の整数。`null` または省略で無期限。不正な値は `400 invalid_expiry`。

応答・一覧の各トークンは `id` / `name` / `prefix` / `createdAt` / `lastUsedAt` / `scopes` / `expiresAt`（ms、無期限は `null`）を持ちます。

### 後方互換

`0007_api_token_scopes.sql` より前に発行されたトークンは、列の既定値により `scopes = study_sessions:write`・`expires_at = NULL` として扱われます。つまり従来どおり **登録だけができ、期限はありません**。読み取りを使うには新しいキーを発行してください。

## 学習記録の登録（`study_sessions:write`）

`POST /external/v1/study-sessions`

```json
{
  "externalId": "drill-2026-10-28-001",
  "startedAt": "2026-10-28T09:00:00+09:00",
  "endedAt": "2026-10-28T09:30:00+09:00",
  "durationSeconds": 1500,
  "folderId": "（任意）つみノートのフォルダーID"
}
```

- `externalId`（必須）: 呼び出し側が決める重複排除キー（英数字と `. _ ~ : -`、1〜64文字）。同じ値の再送は何も変えず `200 { "duplicate": true }` を返します（冪等）。
- `startedAt` / `endedAt`（必須）: **タイムゾーン付き** ISO 8601。`endedAt` は `startedAt` より後、未来（5分以上先）と24時間超は不可。
- `durationSeconds`（任意）: 実際に学習した秒数（休憩を除く場合）。省略時は `endedAt - startedAt`。範囲は 1〜(終了-開始)。
- `folderId`（任意）: トークンの持ち主のフォルダーのみ指定可（なければ `422 folder_not_found`）。省略時は未分類。
- 未知のキーは `400`。

成功すると `201 { "id": "...", "duplicate": false }`。登録内容は通常の同期レコード（`study_sessions`）になり、アプリは次回の同期で受け取ります（学習記録の週グラフ・一覧に反映）。

## 学習記録の取得（`study_sessions:read`）

### 一覧

`GET /external/v1/study-sessions?from=&to=&limit=&cursor=`

- `from` / `to`: タイムゾーン付き ISO 8601。`from <= startedAt < to`。既定は `to = 現在`、`from = to の7日前`。期間は最大366日。
- `limit`: 1〜100（既定50）。
- `cursor`: 前のページの `nextCursor` をそのまま渡します（不透明な文字列）。

```json
{
  "sessions": [
    {
      "id": "ext-…",
      "startedAt": "2026-10-28T00:00:00.000Z",
      "endedAt": "2026-10-28T00:30:00.000Z",
      "durationSeconds": 1500,
      "folderId": null
    }
  ],
  "nextCursor": null
}
```

`startedAt` の新しい順です。削除済みの記録は含みません。

### 集計

`GET /external/v1/study-summary?from=&to=&utcOffsetMinutes=`

- `from` / `to`: 一覧と同じ。期間は最大92日。
- `utcOffsetMinutes`: 日別の区切りに使うUTCからの差（分）。日本は `540`。既定 `0`。

```json
{
  "from": "…", "to": "…",
  "totalSeconds": 3000, "sessionCount": 2,
  "days": [{ "date": "2026-10-28", "totalSeconds": 3000, "sessionCount": 2 }],
  "folders": [{ "folderId": null, "totalSeconds": 3000 }]
}
```

## アプリ内の管理画面

マイページ › API連携（ログイン中のみ）から、APIキーの発行・一覧・失効ができます（Figma 16c〜16e）。発行シート（16d）で名前・権限（学習記録の追加／読み取り）・有効期限（30日／90日／1年／無期限、既定は追加のみ・90日）を選びます。平文のキーは発行直後の画面にだけ表示され、端末にもサーバーにも保存されません。

## 本番への適用（運用メモ）

1. D1 マイグレーション `0006_api_tokens.sql`・`0007_api_token_scopes.sql` を本番D1（`tsumi-note-prod`）へ適用: `cd api && bun run db:migrate:remote`。`0007` は列の追加だけで、既存データは変更しません。**必ずAPIのデプロイより先に適用してください**（新しいコードは `scopes` / `expires_at` 列を参照します）。
2. `cd api && bun run deploy`（事前チェック `check:deploy` を通過した場合のみデプロイされます）。
3. ルーティングは `wrangler.toml` の `[env.production]`（カスタムドメイン `api.tsumi-note.hosokawa-lab.dev`）。`/external/v1/*` は同じWorkerが処理します。

## 未対応

- 記録ごとの記録元（タイマー／手入力／API）の保存。
- 公開APIドキュメントのURL（Figma 16c の「APIドキュメントを見る」リンクは未実装）。
