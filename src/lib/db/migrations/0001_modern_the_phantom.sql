ALTER TABLE "cards" ADD COLUMN "barcode" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "latest_label" text DEFAULT 'LATEST' NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "contact_url" text;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "day_glow" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "glow_slot" integer;