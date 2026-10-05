import { describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/testing/db";
import { createCardRepository } from "@/lib/cards/repository";
import { createSubscriberRepository } from "@/lib/subscribers/repository";
import { CardInputSchema } from "@/lib/cards/validation";
import type { ApnsSender } from "@/lib/apple/apns";
import { isCronAuthorized, refreshGlow } from "./refresh";

const TOKEN = "a".repeat(64);

async function setup() {
  const db = await createTestDb();
  const cards = createCardRepository(db);
  const subscribers = createSubscriberRepository(db);
  const card = await cards.create(CardInputSchema.parse({ name: "A", organizationName: "B", slug: "a", dayGlow: "on" }));
  const plain = await cards.create(CardInputSchema.parse({ name: "P", organizationName: "B", slug: "p" }));
  for (const [c, token] of [[card, TOKEN], [plain, "b".repeat(64)]] as const) {
    const sub = await subscribers.create({ cardId: c.id, platform: "apple" });
    await subscribers.registerAppleDevice({ deviceLibraryId: `d-${c.slug}`, pushToken: token, serialNumber: sub.serialNumber, passTypeId: "pass.test" });
  }
  const pushed: string[][] = [];
  const apns: ApnsSender = {
    async sendPassUpdates(tokens) {
      pushed.push(tokens);
      return { sent: tokens.length, failed: 0, invalidTokens: [], errors: [] };
    },
  };
  return { cards, subscribers, apns, pushed, card };
}

describe("refreshGlow", () => {
  it("pushes once per slot change and only for day-glow cards", async () => {
    const s = await setup();
    const deps = { cards: s.cards, subscribers: s.subscribers, apns: s.apns, timeZone: "Europe/Rome" };
    const at = (iso: string) => () => new Date(iso);

    expect(await refreshGlow({ ...deps, now: at("2026-10-10T07:30:00Z") })).toEqual({ cards: 1, pushed: 1 });
    expect(await refreshGlow({ ...deps, now: at("2026-10-10T08:30:00Z") })).toEqual({ cards: 0, pushed: 0 });
    expect(await refreshGlow({ ...deps, now: at("2026-10-10T10:30:00Z") })).toEqual({ cards: 1, pushed: 1 });
    expect(s.pushed).toEqual([[TOKEN], [TOKEN]]);
    expect((await s.cards.findById(s.card.id))?.glowSlot).toBe(3);
  });

  it("does nothing without APNs", async () => {
    const s = await setup();
    expect(await refreshGlow({ cards: s.cards, subscribers: s.subscribers, apns: null, timeZone: "Europe/Rome" })).toEqual({
      cards: 0,
      pushed: 0,
    });
  });

  it("checks the bearer secret", () => {
    const secret = "s3cret-s3cret-s3cret";
    expect(isCronAuthorized(`Bearer ${secret}`, secret)).toBe(true);
    expect(isCronAuthorized("Bearer nope", secret)).toBe(false);
    expect(isCronAuthorized(secret, secret)).toBe(false);
    expect(isCronAuthorized(null, secret)).toBe(false);
    expect(isCronAuthorized("Bearer x", undefined)).toBe(false);
  });
});
