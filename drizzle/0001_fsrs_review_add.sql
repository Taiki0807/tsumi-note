ALTER TABLE `fsrs_states` ADD `stability` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `fsrs_states` ADD `difficulty` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `fsrs_states` ADD `elapsed_days` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `fsrs_states` ADD `scheduled_days` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `fsrs_states` ADD `learning_steps` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `fsrs_states` ADD `reps` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `fsrs_states` ADD `lapses` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `fsrs_states` ADD `state` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `fsrs_states` ADD `last_review` integer;--> statement-breakpoint
ALTER TABLE `review_history` ADD `state` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `review_history` ADD `due` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `review_history` ADD `stability` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `review_history` ADD `difficulty` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `review_history` ADD `scheduled_days` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `review_history` ADD `learning_steps` integer DEFAULT 0 NOT NULL;