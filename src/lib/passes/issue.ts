import { z } from "zod";
import type { AppConfig } from "@/lib/config/env";
import type { Card } from "@/lib/db/schema";
import type { SubscriberRepository } from "@/lib/subscribers/repository";
import { buildApplePass } from "@/lib/apple/pass";
import { createSaveUrl, type GoogleWalletApi } from "@/lib/google/client";
import { buildGenericClass, buildGenericObject } from "@/lib/google/objects";

/** Public "add to wallet" form. Email is optional; `src` tracks the QR placement. */
export const IssueRequestSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .transform((v) => (v === "" ? null : v))
    .pipe(z.email().max(254).nullable())
    .optional()
    .default(null),
  src: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .pipe(z.string().regex(/^[\w-]{1,40}$/).nullable())
    .optional()
    .default(null),
});

export type IssueRequest = z.infer<typeof IssueRequestSchema>;

export class PlatformDisabledError extends Error {
  constructor(platform: string) {
    super(`${platform} is not configured on this WalletCast server`);
    this.name = "PlatformDisabledError";
  }
}

export async function issueApplePass(
  config: AppConfig,
  subscribers: SubscriberRepository,
  card: Card,
  request: IssueRequest,
): Promise<Buffer> {
  if (!config.apple) throw new PlatformDisabledError("Apple Wallet");
  const subscriber = await subscribers.create({
    cardId: card.id,
    platform: "apple",
    email: request.email,
    source: request.src,
  });
  return buildApplePass({ card, subscriber, apple: config.apple, baseUrl: config.baseUrl });
}

export async function issueGooglePass(
  config: AppConfig,
  subscribers: SubscriberRepository,
  api: GoogleWalletApi,
  card: Card,
  request: IssueRequest,
): Promise<string> {
  if (!config.google) throw new PlatformDisabledError("Google Wallet");
  await api.upsertGenericClass(buildGenericClass(config.google.issuerId, card));
  const subscriber = await subscribers.create({
    cardId: card.id,
    platform: "google",
    email: request.email,
    source: request.src,
  });
  const object = buildGenericObject(config.google.issuerId, card, subscriber, config.baseUrl);
  return createSaveUrl(config.google, object, config.baseUrl);
}
