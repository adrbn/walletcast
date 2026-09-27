import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/client";
import { createTestDb } from "@/lib/testing/db";
import { createCardRepository, type CardRepository } from "@/lib/cards/repository";
import { createSubscriberRepository, type SubscriberRepository } from "@/lib/subscribers/repository";
import { CardInputSchema } from "@/lib/cards/validation";
import type { ApnsSender } from "@/lib/apple/apns";
import type { GoogleWalletApi } from "@/lib/google/client";
import { broadcast, CardNotFoundError, GOOGLE_DAILY_NOTIFICATION_LIMIT, passText } from "./broadcast";

const input = { title: "Flash sale", body: "-20% today only" };

describe("broadcast", () => {
  let db: Db;
  let cards: CardRepository;
  let subscribers: SubscriberRepository;
  let cardId: string;

  beforeEach(async () => {
    db = await createTestDb();
    cards = createCardRepository(db);
    subscribers = createSubscriberRepository(db);
    cardId = (await cards.create(CardInputSchema.parse({ name: "Lu", organizationName: "Lu", slug: "lu" }))).id;
  });

  async function addApple(token: string) {
    const sub = await subscribers.create({ cardId, platform: "apple" });
    await subscribers.registerAppleDevice({
      deviceLibraryId: `dev-${token}`,
      pushToken: token,
      serialNumber: sub.serialNumber,
      passTypeId: "pass.x",
    });
  }

  it("pushes to Apple and Google, stores stats and prunes dead tokens", async () => {
    await addApple("t-ok");
    await addApple("t-dead");
    const g1 = await subscribers.create({ cardId, platform: "google" });
    const g2 = await subscribers.create({ cardId, platform: "google" });

    const pushed: string[][] = [];
    const apns: ApnsSender = {
      async sendPassUpdates(tokens) {
        pushed.push([...tokens].sort());
        return { sent: 1, failed: 1, invalidTokens: ["t-dead"], errors: ["t-dead: Unregistered"] };
      },
    };
    const googleCalls: string[] = [];
    const api: GoogleWalletApi = {
      async upsertGenericClass() {},
      async patchGenericObject(id) {
        googleCalls.push(`patch ${id}`);
        if (id.endsWith(g2.serialNumber)) throw new Error("boom");
      },
      async addMessageToGenericObject(id) {
        googleCalls.push(`msg ${id}`);
      },
    };

    const result = await broadcast(
      { db, baseUrl: "https://wc.test", cards, subscribers, apns, google: { api, issuerId: "iss" }, now: () => new Date(5000) },
      cardId,
      input,
    );

    expect(pushed).toEqual([["t-dead", "t-ok"]]);
    expect(await subscribers.applePushTokensForCard(cardId)).toEqual(["t-ok"]);
    expect(googleCalls).toContain(`msg iss.${g1.serialNumber}`);
    expect(googleCalls).not.toContain(`msg iss.${g2.serialNumber}`);
    expect(result.message).toMatchObject({
      appleTargets: 2,
      appleSent: 1,
      appleFailed: 1,
      googleTargets: 2,
      googleSent: 1,
      googleFailed: 1,
    });
    expect(result.errors).toEqual(["Apple: t-dead: Unregistered", "Google: boom"]);
    expect((await cards.findById(cardId))?.latestMessage).toBe(passText(input));
  });

  it("works with no platform configured and warns past the Google daily limit", async () => {
    const deps = { db, baseUrl: "https://wc.test", cards, subscribers, apns: null, google: null };
    for (let i = 0; i < GOOGLE_DAILY_NOTIFICATION_LIMIT; i++) {
      expect((await broadcast(deps, cardId, input)).warnings).toEqual([]);
    }
    const last = await broadcast(deps, cardId, input);
    expect(last.warnings[0]).toMatch(/Google Wallet/);
    expect(last.message.appleTargets).toBe(0);
    expect(await cards.listMessages(cardId, 10)).toHaveLength(GOOGLE_DAILY_NOTIFICATION_LIMIT + 1);
  });

  it("rejects unknown cards", async () => {
    await expect(
      broadcast({ db, baseUrl: "https://wc.test", cards, subscribers, apns: null, google: null }, "00000000-0000-0000-0000-000000000000", input),
    ).rejects.toBeInstanceOf(CardNotFoundError);
  });
});
