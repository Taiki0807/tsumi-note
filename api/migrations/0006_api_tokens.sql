-- v1.1.0: 外部サービス連携API。他の学習サービスが学習記録を登録するための個人用APIトークン。
-- トークン本体は保存しない(SHA-256ハッシュのみ)。作成時に一度だけ表示する。
-- トークンは学習記録の登録(study_sessions:write)だけができ、読み取りやアカウント操作には使えない。
-- user 削除時に ON DELETE CASCADE で一緒に消える(アカウント削除でトークンも失効)。
CREATE TABLE `api_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`token_prefix` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_tokens_token_hash_unique` ON `api_tokens` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `api_tokens_user_id_idx` ON `api_tokens` (`user_id`);
