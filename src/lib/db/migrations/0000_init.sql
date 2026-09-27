CREATE TABLE "apple_devices" (
	"device_library_id" text PRIMARY KEY NOT NULL,
	"push_token" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apple_registrations" (
	"device_library_id" text NOT NULL,
	"serial_number" text NOT NULL,
	"pass_type_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "apple_registrations_device_library_id_serial_number_pk" PRIMARY KEY("device_library_id","serial_number")
);
--> statement-breakpoint
CREATE TABLE "cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"organization_name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"welcome_text" text DEFAULT '' NOT NULL,
	"website_url" text,
	"bg_color" text DEFAULT '#111827' NOT NULL,
	"fg_color" text DEFAULT '#ffffff' NOT NULL,
	"label_color" text DEFAULT '#9ca3af' NOT NULL,
	"logo" "bytea",
	"icon" "bytea",
	"latest_message" text,
	"latest_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cards_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"apple_targets" integer DEFAULT 0 NOT NULL,
	"apple_sent" integer DEFAULT 0 NOT NULL,
	"apple_failed" integer DEFAULT 0 NOT NULL,
	"google_targets" integer DEFAULT 0 NOT NULL,
	"google_sent" integer DEFAULT 0 NOT NULL,
	"google_failed" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscribers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"serial_number" text NOT NULL,
	"auth_token" text NOT NULL,
	"email" text,
	"source" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscribers_serial_number_unique" UNIQUE("serial_number")
);
--> statement-breakpoint
ALTER TABLE "apple_registrations" ADD CONSTRAINT "apple_registrations_device_library_id_apple_devices_device_library_id_fk" FOREIGN KEY ("device_library_id") REFERENCES "public"."apple_devices"("device_library_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apple_registrations" ADD CONSTRAINT "apple_registrations_serial_number_subscribers_serial_number_fk" FOREIGN KEY ("serial_number") REFERENCES "public"."subscribers"("serial_number") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_card_idx" ON "messages" USING btree ("card_id","created_at");--> statement-breakpoint
CREATE INDEX "subscribers_card_idx" ON "subscribers" USING btree ("card_id","platform","status");