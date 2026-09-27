import {
  customType,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/** Binary column (PNG images). PGlite returns Uint8Array, postgres-js Buffer: normalise to Buffer. */
const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array }>({
  dataType: () => "bytea",
  fromDriver: (value) => (Buffer.isBuffer(value) ? value : Buffer.from(value)),
});

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const cards = pgTable("cards", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  organizationName: text("organization_name").notNull(),
  description: text("description").notNull().default(""),
  welcomeText: text("welcome_text").notNull().default(""),
  websiteUrl: text("website_url"),
  bgColor: text("bg_color").notNull().default("#111827"),
  fgColor: text("fg_color").notNull().default("#ffffff"),
  labelColor: text("label_color").notNull().default("#9ca3af"),
  logo: bytea("logo"),
  icon: bytea("icon"),
  latestMessage: text("latest_message"),
  latestMessageAt: timestamp("latest_message_at", { withTimezone: true }),
  ...timestamps,
});

export const PLATFORMS = ["apple", "google"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const subscribers = pgTable(
  "subscribers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cardId: uuid("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    platform: text("platform", { enum: PLATFORMS }).notNull(),
    serialNumber: text("serial_number").notNull().unique(),
    authToken: text("auth_token").notNull(),
    email: text("email"),
    source: text("source"),
    status: text("status", { enum: ["active", "removed"] }).notNull().default("active"),
    ...timestamps,
  },
  (t) => [index("subscribers_card_idx").on(t.cardId, t.platform, t.status)],
);

export const appleDevices = pgTable("apple_devices", {
  deviceLibraryId: text("device_library_id").primaryKey(),
  pushToken: text("push_token").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const appleRegistrations = pgTable(
  "apple_registrations",
  {
    deviceLibraryId: text("device_library_id")
      .notNull()
      .references(() => appleDevices.deviceLibraryId, { onDelete: "cascade" }),
    serialNumber: text("serial_number")
      .notNull()
      .references(() => subscribers.serialNumber, { onDelete: "cascade" }),
    passTypeId: text("pass_type_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.deviceLibraryId, t.serialNumber] })],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cardId: uuid("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    appleTargets: integer("apple_targets").notNull().default(0),
    appleSent: integer("apple_sent").notNull().default(0),
    appleFailed: integer("apple_failed").notNull().default(0),
    googleTargets: integer("google_targets").notNull().default(0),
    googleSent: integer("google_sent").notNull().default(0),
    googleFailed: integer("google_failed").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_card_idx").on(t.cardId, t.createdAt)],
);

export type Card = typeof cards.$inferSelect;
export type NewCard = typeof cards.$inferInsert;
export type Subscriber = typeof subscribers.$inferSelect;
export type Message = typeof messages.$inferSelect;
