import type { Db } from "@/lib/db/client";
import { messages, type Message } from "@/lib/db/schema";
import type { CardRepository } from "@/lib/cards/repository";
import type { SubscriberRepository } from "@/lib/subscribers/repository";
import type { MessageInput } from "@/lib/cards/validation";
import type { ApnsSender } from "@/lib/apple/apns";
import type { GoogleWalletApi } from "@/lib/google/client";
import { buildNotifyMessage, buildObjectPatch, objectId } from "@/lib/google/objects";
import { mapWithConcurrency } from "@/lib/http/concurrency";

/** Google only shows ~3 notifying messages per pass per 24h. */
export const GOOGLE_DAILY_NOTIFICATION_LIMIT = 3;

export interface BroadcastDeps {
  db: Db;
  baseUrl: string;
  cards: CardRepository;
  subscribers: SubscriberRepository;
  apns: ApnsSender | null;
  google: { api: GoogleWalletApi; issuerId: string } | null;
  now?: () => Date;
}

export interface BroadcastResult {
  message: Message;
  warnings: string[];
  errors: string[];
}

export class CardNotFoundError extends Error {
  constructor() {
    super("Card not found");
    this.name = "CardNotFoundError";
  }
}

/** Text stored on the pass: this is what Apple shows in the lock-screen notification. */
export function passText(input: MessageInput): string {
  return `${input.title} — ${input.body}`;
}

export async function broadcast(deps: BroadcastDeps, cardId: string, input: MessageInput): Promise<BroadcastResult> {
  const now = deps.now?.() ?? new Date();
  const card = await deps.cards.findById(cardId);
  if (!card) throw new CardNotFoundError();

  const warnings: string[] = [];
  const errors: string[] = [];
  const dayAgo = new Date(now.getTime() - 24 * 3600_000);
  if ((await deps.cards.countMessagesSince(cardId, dayAgo)) >= GOOGLE_DAILY_NOTIFICATION_LIMIT) {
    warnings.push(
      `More than ${GOOGLE_DAILY_NOTIFICATION_LIMIT} messages in 24h: Google Wallet may update the pass silently without notifying.`,
    );
  }

  await deps.cards.setLatestMessage(cardId, passText(input), now);
  const updatedCard = { ...card, latestMessage: passText(input), latestMessageAt: now, updatedAt: now };

  // Apple: empty push -> devices fetch the new pass -> changeMessage notification.
  let apple = { targets: 0, sent: 0, failed: 0 };
  if (deps.apns) {
    const tokens = await deps.subscribers.applePushTokensForCard(cardId);
    const result = await deps.apns.sendPassUpdates(tokens);
    await deps.subscribers.removeApplePushTokens(result.invalidTokens);
    apple = { targets: tokens.length, sent: result.sent, failed: result.failed };
    errors.push(...result.errors.map((e) => `Apple: ${e}`));
  }

  // Google: patch the pass text, then add a notifying message.
  let google = { targets: 0, sent: 0, failed: 0 };
  if (deps.google) {
    const { api, issuerId } = deps.google;
    const targets = await deps.subscribers.listActiveGoogle(cardId);
    const patch = buildObjectPatch(updatedCard, deps.baseUrl);
    const messageId = `m${now.getTime()}`;
    const outcomes = await mapWithConcurrency(targets, 10, async (sub) => {
      const id = objectId(issuerId, sub);
      try {
        await api.patchGenericObject(id, patch);
        await api.addMessageToGenericObject(id, buildNotifyMessage(input.title, input.body, messageId));
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    });
    const failures = outcomes.filter((o): o is string => o !== null);
    google = { targets: targets.length, sent: targets.length - failures.length, failed: failures.length };
    errors.push(...failures.slice(0, 5).map((e) => `Google: ${e}`));
  }

  const [message] = await deps.db
    .insert(messages)
    .values({
      cardId,
      title: input.title,
      body: input.body,
      createdAt: now,
      appleTargets: apple.targets,
      appleSent: apple.sent,
      appleFailed: apple.failed,
      googleTargets: google.targets,
      googleSent: google.sent,
      googleFailed: google.failed,
    })
    .returning();

  return { message, warnings, errors };
}
