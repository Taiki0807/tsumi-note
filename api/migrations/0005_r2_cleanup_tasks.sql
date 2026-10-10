-- Phase 8 PR 6 修正: 削除済みアカウントのR2オブジェクトを後から消すための永続的な掃除タスク。
-- 失効したアップロードが削除完了後に書き込んだ分など、アカウント削除の完了後に生じた残骸を追跡する。
-- user への外部キーは持たない(user 削除後も残す)。R2の削除に成功した時点で行を消す(冪等)。
CREATE TABLE `r2_cleanup_tasks` (
	`r2_key` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL
);
