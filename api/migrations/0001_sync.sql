-- Phase 8 PR 4: 差分同期。ユーザーごとに完全分離(user_id は常にセッション由来)。
-- Drizzle のスキーマには含めず、同期モジュール(api/src/sync)が生のSQLで扱う。
CREATE TABLE `sync_counters` (
	`user_id` text PRIMARY KEY NOT NULL,
	`seq` integer NOT NULL DEFAULT 0,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sync_records` (
	`user_id` text NOT NULL,
	`entity` text NOT NULL,
	`id` text NOT NULL,
	`data` text NOT NULL,
	`deleted_at` integer,
	`server_seq` integer NOT NULL,
	PRIMARY KEY(`user_id`, `entity`, `id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sync_records_user_seq_idx` ON `sync_records` (`user_id`,`server_seq`);
--> statement-breakpoint
CREATE TABLE `sync_ops` (
	`user_id` text NOT NULL,
	`op_id` text NOT NULL,
	`server_seq` integer NOT NULL,
	PRIMARY KEY(`user_id`, `op_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
