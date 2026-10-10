-- Phase 8 PR 6 修正: 進行中の画像アップロード(R2書き込み)の記録。
-- アカウント削除は、これが残っている間は完了にしない(削除後のR2書き込みの取りこぼし防止)。
-- user への外部キーは意図的に持たない(user 削除後も残り、削除の完了判定に使う)。
-- 作成は「削除依頼が無いこと」を条件に原子的に行う。started_at から一定時間を過ぎた行は失効扱い。
CREATE TABLE `image_uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`started_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `image_uploads_user_idx` ON `image_uploads` (`user_id`);
