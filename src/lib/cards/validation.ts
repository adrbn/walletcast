import { z } from "zod";

const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex color like #1a2b3c");

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;

const optionalUrl = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(z.url({ protocol: /^https?$/ }).nullable());

export const CardInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  organizationName: z.string().trim().min(1, "Organization is required").max(60),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(SLUG_PATTERN, "Slug: lowercase letters, digits and dashes (max 48)"),
  description: z.string().trim().max(500).default(""),
  welcomeText: z.string().trim().max(200).default(""),
  websiteUrl: optionalUrl.default(null),
  bgColor: hexColor.default("#111827"),
  fgColor: hexColor.default("#ffffff"),
  labelColor: hexColor.default("#9ca3af"),
  barcode: z.stringbool().default(false),
  latestLabel: z
    .string()
    .trim()
    .transform((v) => v || "LATEST")
    .pipe(z.string().max(12, "Label: 12 characters max"))
    .default("LATEST"),
  contactUrl: optionalUrl.default(null),
  logoText: z.string().trim().max(20, "Logo text: 20 characters max").default(""),
  headerLabel: z.string().trim().max(12, "Header label: 12 characters max").default(""),
  headerValue: z.string().trim().max(20, "Header value: 20 characters max").default(""),
  dayGlow: z.stringbool().default(false),
});

export type CardInput = z.infer<typeof CardInputSchema>;

export const MessageInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(40),
  body: z.string().trim().min(1, "Message is required").max(300),
});

export type MessageInput = z.infer<typeof MessageInputSchema>;

/** Derive a URL-safe slug from free text ("Lu's Café" -> "lus-cafe"). */
export function slugify(text: string): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return slug || "card";
}
