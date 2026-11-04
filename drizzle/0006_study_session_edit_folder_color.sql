ALTER TABLE `folders` ADD `color` text;--> statement-breakpoint
ALTER TABLE `study_sessions` ADD `updated_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `study_sessions` ADD `deleted_at` integer;
--> statement-breakpoint
-- 既存の学習記録: 更新日時は作成日時で埋める(deleted_at は NULL=削除なし)。
UPDATE `study_sessions` SET `updated_at` = `created_at`;--> statement-breakpoint
-- 既存フォルダー: 現在の表示色(作成順に primary → warning → info を循環)をそのまま color に引き継ぐ。
UPDATE `folders` SET `color` = CASE (
  SELECT COUNT(*) FROM `folders` AS f2
  WHERE f2.`deleted_at` IS NULL
    AND (f2.`created_at` < `folders`.`created_at`
      OR (f2.`created_at` = `folders`.`created_at` AND f2.`rowid` < `folders`.`rowid`))
) % 3 WHEN 0 THEN 'primary' WHEN 1 THEN 'warning' ELSE 'info' END
WHERE `deleted_at` IS NULL;--> statement-breakpoint
-- 学習記録が編集可能になったので、更新も変更検知トリガー(0004 と同じ形式)の対象にする。
CREATE TRIGGER `sync_capture_study_sessions_upd` AFTER UPDATE ON `study_sessions` WHEN (SELECT value FROM sync_metadata WHERE key = 'sync.capture') = '1'
BEGIN INSERT INTO sync_outbox (entity, entity_id, created_at) VALUES ('study_sessions', NEW.id, CAST(strftime('%s','now') AS INTEGER) * 1000); END;
