CREATE TABLE `sync_outbox` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sync_outbox_entity_idx` ON `sync_outbox` (`entity`,`entity_id`);--> statement-breakpoint
CREATE TABLE `sync_record_meta` (
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`server_seq` integer NOT NULL,
	PRIMARY KEY(`entity`, `entity_id`)
);
--> statement-breakpoint
-- 変更検知トリガー: 変更と同じ文(=同じトランザクション)で sync_outbox に登録する。
-- `sync.capture` が '1' のアカウントDBでのみ有効(ゲストDBでは行われず、既存データには一切触れない)。
-- 同期エンジンがサーバーの変更を反映する間は '0' にして、反映した変更が再送されないようにする。
CREATE TRIGGER `sync_capture_folders_ins` AFTER INSERT ON `folders` WHEN (SELECT value FROM sync_metadata WHERE key = 'sync.capture') = '1'
BEGIN INSERT INTO sync_outbox (entity, entity_id, created_at) VALUES ('folders', NEW.id, CAST(strftime('%s','now') AS INTEGER) * 1000); END;
--> statement-breakpoint
CREATE TRIGGER `sync_capture_folders_upd` AFTER UPDATE ON `folders` WHEN (SELECT value FROM sync_metadata WHERE key = 'sync.capture') = '1'
BEGIN INSERT INTO sync_outbox (entity, entity_id, created_at) VALUES ('folders', NEW.id, CAST(strftime('%s','now') AS INTEGER) * 1000); END;
--> statement-breakpoint
CREATE TRIGGER `sync_capture_notes_ins` AFTER INSERT ON `notes` WHEN (SELECT value FROM sync_metadata WHERE key = 'sync.capture') = '1'
BEGIN INSERT INTO sync_outbox (entity, entity_id, created_at) VALUES ('notes', NEW.id, CAST(strftime('%s','now') AS INTEGER) * 1000); END;
--> statement-breakpoint
CREATE TRIGGER `sync_capture_notes_upd` AFTER UPDATE ON `notes` WHEN (SELECT value FROM sync_metadata WHERE key = 'sync.capture') = '1'
BEGIN INSERT INTO sync_outbox (entity, entity_id, created_at) VALUES ('notes', NEW.id, CAST(strftime('%s','now') AS INTEGER) * 1000); END;
--> statement-breakpoint
CREATE TRIGGER `sync_capture_questions_ins` AFTER INSERT ON `questions` WHEN (SELECT value FROM sync_metadata WHERE key = 'sync.capture') = '1'
BEGIN INSERT INTO sync_outbox (entity, entity_id, created_at) VALUES ('questions', NEW.id, CAST(strftime('%s','now') AS INTEGER) * 1000); END;
--> statement-breakpoint
CREATE TRIGGER `sync_capture_questions_upd` AFTER UPDATE ON `questions` WHEN (SELECT value FROM sync_metadata WHERE key = 'sync.capture') = '1'
BEGIN INSERT INTO sync_outbox (entity, entity_id, created_at) VALUES ('questions', NEW.id, CAST(strftime('%s','now') AS INTEGER) * 1000); END;
--> statement-breakpoint
CREATE TRIGGER `sync_capture_goals_ins` AFTER INSERT ON `goals` WHEN (SELECT value FROM sync_metadata WHERE key = 'sync.capture') = '1'
BEGIN INSERT INTO sync_outbox (entity, entity_id, created_at) VALUES ('goals', NEW.id, CAST(strftime('%s','now') AS INTEGER) * 1000); END;
--> statement-breakpoint
CREATE TRIGGER `sync_capture_goals_upd` AFTER UPDATE ON `goals` WHEN (SELECT value FROM sync_metadata WHERE key = 'sync.capture') = '1'
BEGIN INSERT INTO sync_outbox (entity, entity_id, created_at) VALUES ('goals', NEW.id, CAST(strftime('%s','now') AS INTEGER) * 1000); END;
--> statement-breakpoint
CREATE TRIGGER `sync_capture_settings_ins` AFTER INSERT ON `settings` WHEN (SELECT value FROM sync_metadata WHERE key = 'sync.capture') = '1' AND (NEW.key LIKE 'review.%' OR NEW.key IN ('timer.focusMinutes', 'timer.breakMinutes', 'timer.rounds', 'appearance.darkMode'))
BEGIN INSERT INTO sync_outbox (entity, entity_id, created_at) VALUES ('settings', NEW.key, CAST(strftime('%s','now') AS INTEGER) * 1000); END;
--> statement-breakpoint
CREATE TRIGGER `sync_capture_settings_upd` AFTER UPDATE ON `settings` WHEN (SELECT value FROM sync_metadata WHERE key = 'sync.capture') = '1' AND (NEW.key LIKE 'review.%' OR NEW.key IN ('timer.focusMinutes', 'timer.breakMinutes', 'timer.rounds', 'appearance.darkMode'))
BEGIN INSERT INTO sync_outbox (entity, entity_id, created_at) VALUES ('settings', NEW.key, CAST(strftime('%s','now') AS INTEGER) * 1000); END;
--> statement-breakpoint
CREATE TRIGGER `sync_capture_fsrs_states_ins` AFTER INSERT ON `fsrs_states` WHEN (SELECT value FROM sync_metadata WHERE key = 'sync.capture') = '1'
BEGIN INSERT INTO sync_outbox (entity, entity_id, created_at) VALUES ('fsrs_states', NEW.question_id, CAST(strftime('%s','now') AS INTEGER) * 1000); END;
--> statement-breakpoint
CREATE TRIGGER `sync_capture_fsrs_states_upd` AFTER UPDATE ON `fsrs_states` WHEN (SELECT value FROM sync_metadata WHERE key = 'sync.capture') = '1'
BEGIN INSERT INTO sync_outbox (entity, entity_id, created_at) VALUES ('fsrs_states', NEW.question_id, CAST(strftime('%s','now') AS INTEGER) * 1000); END;
--> statement-breakpoint
CREATE TRIGGER `sync_capture_study_sessions_ins` AFTER INSERT ON `study_sessions` WHEN (SELECT value FROM sync_metadata WHERE key = 'sync.capture') = '1'
BEGIN INSERT INTO sync_outbox (entity, entity_id, created_at) VALUES ('study_sessions', NEW.id, CAST(strftime('%s','now') AS INTEGER) * 1000); END;
--> statement-breakpoint
CREATE TRIGGER `sync_capture_answer_history_ins` AFTER INSERT ON `answer_history` WHEN (SELECT value FROM sync_metadata WHERE key = 'sync.capture') = '1'
BEGIN INSERT INTO sync_outbox (entity, entity_id, created_at) VALUES ('answer_history', NEW.id, CAST(strftime('%s','now') AS INTEGER) * 1000); END;
--> statement-breakpoint
CREATE TRIGGER `sync_capture_review_history_ins` AFTER INSERT ON `review_history` WHEN (SELECT value FROM sync_metadata WHERE key = 'sync.capture') = '1'
BEGIN INSERT INTO sync_outbox (entity, entity_id, created_at) VALUES ('review_history', NEW.id, CAST(strftime('%s','now') AS INTEGER) * 1000); END;
