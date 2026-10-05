import type { ApnsSender } from "@/lib/apple/apns";
import { safeEqual } from "@/lib/apple/webservice";
import type { CardRepository } from "@/lib/cards/repository";
import type { SubscriberRepository } from "@/lib/subscribers/repository";
import { glowSlot } from "./hue";

export interface RefreshGlowDeps {
  cards: CardRepository;
  subscribers: SubscriberRepository;
  apns: ApnsSender | null;
  timeZone: string;
  now?: () => Date;
}

/**
 * Move day-glow passes to the current slot. Only the strip image changes and no field
 * with a changeMessage does, so Wallet refetches the pass without a notification.
 */
export async function refreshGlow(deps: RefreshGlowDeps): Promise<{ cards: number; pushed: number }> {
  if (!deps.apns) return { cards: 0, pushed: 0 };
  const now = deps.now?.() ?? new Date();
  const slot = glowSlot(now, deps.timeZone);
  let cards = 0;
  let pushed = 0;
  for (const card of await deps.cards.listDayGlow()) {
    if (card.glowSlot === slot) continue;
    // Bump updatedAt before pushing: devices ask what changed as soon as the push lands.
    await deps.cards.markGlowSlot(card.id, slot, now);
    const result = await deps.apns.sendPassUpdates(await deps.subscribers.applePushTokensForCard(card.id));
    await deps.subscribers.removeApplePushTokens(result.invalidTokens);
    cards += 1;
    pushed += result.sent;
  }
  return { cards, pushed };
}

export function isCronAuthorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header?.startsWith("Bearer ")) return false;
  return safeEqual(header.slice("Bearer ".length), secret);
}
