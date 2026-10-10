CREATE TABLE `image_transfers` (
	`file_name` text PRIMARY KEY NOT NULL,
	`sha256` text,
	`state` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`updated_at` integer NOT NULL
);
