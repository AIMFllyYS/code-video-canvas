ALTER TABLE `canvas_nodes` ADD `status` text DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE `canvas_nodes` ADD `content_hash` text;--> statement-breakpoint
ALTER TABLE `canvas_nodes` ADD `lane_key` text;--> statement-breakpoint
ALTER TABLE `canvas_nodes` ADD `lane_role` text;