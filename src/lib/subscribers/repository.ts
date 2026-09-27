import { randomBytes } from "node:crypto";
import { and, count, desc, eq, gt, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import {
  appleDevices,
  appleRegistrations,
  subscribers,
  type Platform,
  type Subscriber,
} from "@/lib/db/schema";

export interface NewSubscriberInput {
  cardId: string;
  platform: Platform;
  email?: string | null;
  source?: string | null;
}

function randomToken(bytes: number): string {
  return randomBytes(bytes).toString("base64url");
}

export function createSubscriberRepository(db: Db) {
  return {
    async create(input: NewSubscriberInput): Promise<Subscriber> {
      const [row] = await db
        .insert(subscribers)
        .values({
          cardId: input.cardId,
          platform: input.platform,
          email: input.email ?? null,
          source: input.source ?? null,
          serialNumber: `wc-${randomToken(12)}`,
          // Apple requires >= 16 chars for authenticationToken.
          authToken: randomToken(24),
        })
        .returning();
      return row;
    },

    async findBySerial(serialNumber: string): Promise<Subscriber | null> {
      const [row] = await db.select().from(subscribers).where(eq(subscribers.serialNumber, serialNumber));
      return row ?? null;
    },

    async listForCard(cardId: string, limit = 200): Promise<Subscriber[]> {
      return db
        .select()
        .from(subscribers)
        .where(eq(subscribers.cardId, cardId))
        .orderBy(desc(subscribers.createdAt))
        .limit(limit);
    },

    async countBySource(cardId: string): Promise<{ source: string | null; n: number }[]> {
      return db
        .select({ source: subscribers.source, n: count() })
        .from(subscribers)
        .where(eq(subscribers.cardId, cardId))
        .groupBy(subscribers.source);
    },

    async listActiveGoogle(cardId: string): Promise<Subscriber[]> {
      return db
        .select()
        .from(subscribers)
        .where(
          and(eq(subscribers.cardId, cardId), eq(subscribers.platform, "google"), eq(subscribers.status, "active")),
        );
    },

    async setStatus(serialNumber: string, status: Subscriber["status"]): Promise<void> {
      await db
        .update(subscribers)
        .set({ status, updatedAt: new Date() })
        .where(eq(subscribers.serialNumber, serialNumber));
    },

    // ---- Apple device registrations -------------------------------------

    /** Returns true when the registration is new (Apple expects 201 vs 200). */
    async registerAppleDevice(args: {
      deviceLibraryId: string;
      pushToken: string;
      serialNumber: string;
      passTypeId: string;
    }): Promise<boolean> {
      return db.transaction(async (tx) => {
        await tx
          .insert(appleDevices)
          .values({ deviceLibraryId: args.deviceLibraryId, pushToken: args.pushToken })
          .onConflictDoUpdate({
            target: appleDevices.deviceLibraryId,
            set: { pushToken: args.pushToken, updatedAt: new Date() },
          });
        const inserted = await tx
          .insert(appleRegistrations)
          .values({
            deviceLibraryId: args.deviceLibraryId,
            serialNumber: args.serialNumber,
            passTypeId: args.passTypeId,
          })
          .onConflictDoNothing()
          .returning();
        await tx
          .update(subscribers)
          .set({ status: "active" })
          .where(eq(subscribers.serialNumber, args.serialNumber));
        return inserted.length > 0;
      });
    },

    async unregisterAppleDevice(deviceLibraryId: string, serialNumber: string): Promise<void> {
      await db.transaction(async (tx) => {
        await tx
          .delete(appleRegistrations)
          .where(
            and(
              eq(appleRegistrations.deviceLibraryId, deviceLibraryId),
              eq(appleRegistrations.serialNumber, serialNumber),
            ),
          );
        const [left] = await tx
          .select({ n: count() })
          .from(appleRegistrations)
          .where(eq(appleRegistrations.serialNumber, serialNumber));
        if ((left?.n ?? 0) === 0) {
          await tx
            .update(subscribers)
            .set({ status: "removed", updatedAt: new Date() })
            .where(eq(subscribers.serialNumber, serialNumber));
        }
        const [deviceLeft] = await tx
          .select({ n: count() })
          .from(appleRegistrations)
          .where(eq(appleRegistrations.deviceLibraryId, deviceLibraryId));
        if ((deviceLeft?.n ?? 0) === 0) {
          await tx.delete(appleDevices).where(eq(appleDevices.deviceLibraryId, deviceLibraryId));
        }
      });
    },

    /** Serials registered on a device for a pass type, optionally only those updated after `since`. */
    async serialsForDevice(
      deviceLibraryId: string,
      passTypeId: string,
      since?: Date,
    ): Promise<{ serialNumber: string; updatedAt: Date }[]> {
      const conditions = [
        eq(appleRegistrations.deviceLibraryId, deviceLibraryId),
        eq(appleRegistrations.passTypeId, passTypeId),
      ];
      if (since) conditions.push(gt(subscribers.updatedAt, since));
      return db
        .select({ serialNumber: subscribers.serialNumber, updatedAt: subscribers.updatedAt })
        .from(appleRegistrations)
        .innerJoin(subscribers, eq(subscribers.serialNumber, appleRegistrations.serialNumber))
        .where(and(...conditions));
    },

    /** Distinct push tokens of devices holding an active pass of this card. */
    async applePushTokensForCard(cardId: string): Promise<string[]> {
      const rows = await db
        .selectDistinct({ pushToken: appleDevices.pushToken })
        .from(appleRegistrations)
        .innerJoin(appleDevices, eq(appleDevices.deviceLibraryId, appleRegistrations.deviceLibraryId))
        .innerJoin(subscribers, eq(subscribers.serialNumber, appleRegistrations.serialNumber))
        .where(and(eq(subscribers.cardId, cardId), eq(subscribers.status, "active")));
      return rows.map((r) => r.pushToken);
    },

    /** APNs said the token is gone (410): forget those devices. */
    async removeApplePushTokens(tokens: string[]): Promise<void> {
      if (tokens.length === 0) return;
      await db.delete(appleDevices).where(inArray(appleDevices.pushToken, tokens));
    },
  };
}

export type SubscriberRepository = ReturnType<typeof createSubscriberRepository>;
