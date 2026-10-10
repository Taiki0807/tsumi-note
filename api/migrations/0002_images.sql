-- Phase 8 PR 5: ノート画像。ファイル本体は R2(非公開)、D1 にはメタデータのみ。
-- r2_key はサーバーが `u/<user_id>/<sha256>` で決める(クライアントは指定できない)。
-- 同じ内容(sha256)は1ユーザーにつき1オブジェクトに重複排除する。
CREATE TABLE `image_objects` (
	`user_id` text NOT NULL,
	`file_name` text NOT NULL,
	`sha256` text NOT NULL,
	`size` integer NOT NULL,
	`content_type` text NOT NULL,
	`r2_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`deleted_at` integer,
	PRIMARY KEY(`user_id`, `file_name`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `image_objects_user_sha_idx` ON `image_objects` (`user_id`,`sha256`);
