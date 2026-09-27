import { and, count, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { cards, messages, subscribers, type Card, type Message } from "@/lib/db/schema";
import type { CardInput } from "./validation";

export class SlugTakenError extends Error {
  constructor(slug: string) {
    super(`The link "${slug}" is already used by another card`);
    this.name = "SlugTakenError";
  }
}

export interface CardWithStats extends Card {
  appleSubscribers: number;
  googleSubscribers: number;
}

export interface CardImages {
  logo?: Buffer | null;
  icon?: Buffer | null;
}

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createCardRepository(db: Db) {
  async function slugExists(slug: string, exceptId?: string): Promise<boolean> {
    const rows = await db.select({ id: cards.id }).from(cards).where(eq(cards.slug, slug));
    return rows.some((r) => r.id !== exceptId);
  }

  return {
    async create(input: CardInput, images: CardImages = {}): Promise<Card> {
      if (await slugExists(input.slug)) throw new SlugTakenError(input.slug);
      try {
        const [card] = await db
          .insert(cards)
          .values({ ...input, logo: images.logo ?? null, icon: images.icon ?? null })
          .returning();
        return card;
      } catch (error) {
        if (isUniqueViolation(error)) throw new SlugTakenError(input.slug);
        throw error;
      }
    },

    async update(id: string, input: CardInput, images: CardImages = {}): Promise<Card | null> {
      if (await slugExists(input.slug, id)) throw new SlugTakenError(input.slug);
      const imagePatch: CardImages = {};
      if (images.logo !== undefined) imagePatch.logo = images.logo;
      if (images.icon !== undefined) imagePatch.icon = images.icon;
      const now = new Date();
      return db.transaction(async (tx) => {
        const [card] = await tx
          .update(cards)
          .set({ ...input, ...imagePatch, updatedAt: now })
          .where(eq(cards.id, id))
          .returning();
        if (!card) return null;
        // Apple's "passes updated since" query looks at subscribers: mark them changed too.
        await tx
          .update(subscribers)
          .set({ updatedAt: now })
          .where(and(eq(subscribers.cardId, id), eq(subscribers.status, "active")));
        return card;
      });
    },

    async findById(id: string): Promise<Card | null> {
      if (!UUID_PATTERN.test(id)) return null;
      const [card] = await db.select().from(cards).where(eq(cards.id, id));
      return card ?? null;
    },

    async findBySlug(slug: string): Promise<Card | null> {
      const [card] = await db.select().from(cards).where(eq(cards.slug, slug));
      return card ?? null;
    },

    async listWithStats(): Promise<CardWithStats[]> {
      const rows = await db.select().from(cards).orderBy(desc(cards.createdAt));
      const counts = await db
        .select({ cardId: subscribers.cardId, platform: subscribers.platform, n: count() })
        .from(subscribers)
        .where(eq(subscribers.status, "active"))
        .groupBy(subscribers.cardId, subscribers.platform);
      return rows.map((card) => ({
        ...card,
        appleSubscribers: counts.find((c) => c.cardId === card.id && c.platform === "apple")?.n ?? 0,
        googleSubscribers: counts.find((c) => c.cardId === card.id && c.platform === "google")?.n ?? 0,
      }));
    },

    async delete(id: string): Promise<void> {
      await db.delete(cards).where(eq(cards.id, id));
    },

    /** Store the latest broadcast on the card and mark every active pass as changed. */
    async setLatestMessage(id: string, text: string, at: Date): Promise<void> {
      await db.transaction(async (tx) => {
        await tx
          .update(cards)
          .set({ latestMessage: text, latestMessageAt: at, updatedAt: at })
          .where(eq(cards.id, id));
        await tx
          .update(subscribers)
          .set({ updatedAt: at })
          .where(and(eq(subscribers.cardId, id), eq(subscribers.status, "active")));
      });
    },

    async listMessages(cardId: string, limit = 50): Promise<Message[]> {
      return db
        .select()
        .from(messages)
        .where(eq(messages.cardId, cardId))
        .orderBy(desc(messages.createdAt))
        .limit(limit);
    },

    async countMessagesSince(cardId: string, since: Date): Promise<number> {
      const [row] = await db
        .select({ n: count() })
        .from(messages)
        .where(and(eq(messages.cardId, cardId), sql`${messages.createdAt} >= ${since.toISOString()}`));
      return row?.n ?? 0;
    },
  };
}

export type CardRepository = ReturnType<typeof createCardRepository>;
