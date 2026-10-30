-- v1.1.0: APIトークンの権限(scopes)と有効期限。
-- 既存のトークンは従来どおり「学習記録の登録のみ・期限なし」のまま動く(DEFAULTで後方互換)。
-- scopes はカンマ区切り。許可する値: study_sessions:write / study_sessions:read
ALTER TABLE `api_tokens` ADD `scopes` text DEFAULT 'study_sessions:write' NOT NULL;
--> statement-breakpoint
ALTER TABLE `api_tokens` ADD `expires_at` integer;
