-- Phase 8 PR 6 修正: 削除済みアカウントのR2オブジェクトを後から消すための永続的な掃除タスク。
-- 画像アップロードは、R2へ書き込む「前」にこのタスクを記録する(write-ahead)。
-- 書き込み後にD1が読めなくても、アカウント削除の完了後に遅れて書き込まれても、書き込み先のキーが失われない。
-- id はアップロードごとに一意(同じキーの並行アップロードが互いのタスクを消さない)。
-- キーはアップロードごとに一意で再利用しない。status: pending(PUT完了未確認) / abandoned(タイムアウト・失敗。後から着地し得る)。
-- user への外部キーは持たない(user 削除後も残す)。通常の完了時は自分のタスクを消す。
-- 削除依頼のあるユーザーのタスクだけを定期掃除が処理し、R2の削除に成功した時点で行を消す(冪等)。
CREATE TABLE `r2_cleanup_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`r2_key` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `r2_cleanup_tasks_user_idx` ON `r2_cleanup_tasks` (`user_id`);
