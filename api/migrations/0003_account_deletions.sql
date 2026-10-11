-- Phase 8 PR 6: アカウント削除。削除の依頼を記録する(user への外部キーは意図的に持たない)。
-- 行が残っている間は、そのユーザーIDで /v1/* にアクセスできない(他端末からの再同期の防止)。
-- user 行の削除後も R2 の残骸を掃除できるよう、completed_at が NULL の行は定期的に再実行する。
-- 保存するのは不透明なユーザーIDと時刻のみ(メールアドレス等の個人情報は含まない)。
CREATE TABLE `account_deletions` (
	`user_id` text PRIMARY KEY NOT NULL,
	`requested_at` integer NOT NULL,
	`completed_at` integer,
	`last_scanned_at` integer
);
