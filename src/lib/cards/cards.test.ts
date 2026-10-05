import { beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import type { Db } from "@/lib/db/client";
import { createTestDb } from "@/lib/testing/db";
import { createSubscriberRepository } from "@/lib/subscribers/repository";
import { createCardRepository, SlugTakenError } from "./repository";
import { CardInputSchema, MessageInputSchema, slugify } from "./validation";
import {
  generateDefaultIcon,
  ImageUploadError,
  processIconUpload,
  processLogoUpload,
} from "./images";

const input = (over: Record<string, unknown> = {}) =>
  CardInputSchema.parse({ name: "Lu's Café", organizationName: "Lu", slug: "lus-cafe", ...over });

describe("validation", () => {
  it("slugifies accents and apostrophes", () => {
    expect(slugify("Lu's Café — Roma!")).toBe("lus-cafe-roma");
    expect(slugify("!!!")).toBe("card");
  });

  it("applies defaults and normalises empty website", () => {
    const parsed = input({ websiteUrl: "" });
    expect(parsed.websiteUrl).toBeNull();
    expect(parsed.bgColor).toBe("#111827");
  });

  it("rejects bad colors, slugs and urls", () => {
    expect(CardInputSchema.safeParse({ ...input(), bgColor: "red" }).success).toBe(false);
    expect(CardInputSchema.safeParse({ ...input(), slug: "-bad" }).success).toBe(false);
    expect(CardInputSchema.safeParse({ ...input(), websiteUrl: "javascript:alert(1)" }).success).toBe(false);
  });

  it("validates messages", () => {
    expect(MessageInputSchema.safeParse({ title: "", body: "x" }).success).toBe(false);
    expect(MessageInputSchema.parse({ title: " Hi ", body: " Coffee! " })).toEqual({ title: "Hi", body: "Coffee!" });
  });
});

describe("card repository", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("creates, finds, updates and deletes cards", async () => {
    const repo = createCardRepository(db);
    const card = await repo.create(input());
    expect((await repo.findBySlug("lus-cafe"))?.id).toBe(card.id);

    const updated = await repo.update(card.id, input({ name: "Lu" }), { logo: Buffer.from("x") });
    expect(updated?.name).toBe("Lu");
    expect((await repo.findById(card.id))?.logo?.toString()).toBe("x");

    await repo.update(card.id, input({ name: "Lu 2" }));
    expect((await repo.findById(card.id))?.logo?.toString()).toBe("x");

    await repo.delete(card.id);
    expect(await repo.findById(card.id)).toBeNull();
    expect(await repo.findById("not-a-uuid")).toBeNull();
    expect(await repo.update(card.id, input())).toBeNull();
  });

  it("refuses duplicate slugs", async () => {
    const repo = createCardRepository(db);
    const a = await repo.create(input());
    await expect(repo.create(input())).rejects.toBeInstanceOf(SlugTakenError);
    const b = await repo.create(input({ slug: "other" }));
    await expect(repo.update(b.id, input())).rejects.toBeInstanceOf(SlugTakenError);
    expect(await repo.update(a.id, input())).not.toBeNull();
  });

  it("lists cards with subscriber counts and sets latest message", async () => {
    const cardsRepo = createCardRepository(db);
    const subs = createSubscriberRepository(db);
    const card = await cardsRepo.create(input());
    await subs.create({ cardId: card.id, platform: "apple" });
    await subs.create({ cardId: card.id, platform: "google" });
    const removed = await subs.create({ cardId: card.id, platform: "google" });
    await subs.setStatus(removed.serialNumber, "removed");

    const [listed] = await cardsRepo.listWithStats();
    expect(listed.appleSubscribers).toBe(1);
    expect(listed.googleSubscribers).toBe(1);

    const at = new Date(Date.now() + 1000);
    await cardsRepo.setLatestMessage(card.id, "Hello", at);
    expect((await cardsRepo.findById(card.id))?.latestMessage).toBe("Hello");
    const [sub] = await subs.listActiveGoogle(card.id);
    expect(sub.updatedAt.getTime()).toBe(at.getTime());
    expect(await cardsRepo.listMessages(card.id)).toEqual([]);
    expect(await cardsRepo.countMessagesSince(card.id, new Date(0))).toBe(0);
  });
});

describe("images", () => {
  const png = async (w: number, h: number) =>
    new File(
      [new Uint8Array(await sharp({ create: { width: w, height: h, channels: 3, background: "#f00" } }).png().toBuffer())],
      "a.png",
      { type: "image/png" },
    );

  it("resizes logo and icon uploads", async () => {
    const logo = await processLogoUpload(await png(1000, 1000));
    expect((await sharp(logo!).metadata()).height).toBe(150);
    const icon = await processIconUpload(await png(300, 200));
    expect((await sharp(icon!).metadata()).width).toBe(87);
  });

  it("ignores empty uploads and rejects bad ones", async () => {
    expect(await processLogoUpload(null)).toBeUndefined();
    expect(await processIconUpload(new File([], "x.png", { type: "image/png" }))).toBeUndefined();
    await expect(processLogoUpload(new File(["x"], "x.gif", { type: "image/gif" }))).rejects.toBeInstanceOf(ImageUploadError);
    await expect(processIconUpload(new File(["nope"], "x.png", { type: "image/png" }))).rejects.toThrow(/could not be read/);
    await expect(processLogoUpload(new File(["nope"], "x.png", { type: "image/png" }))).rejects.toThrow(/could not be read/);
    const big = new File([new Uint8Array(3 * 1024 * 1024)], "big.png", { type: "image/png" });
    await expect(processLogoUpload(big)).rejects.toThrow(/2 MB/);
  });

  it("generates a default icon", async () => {
    const icon = await generateDefaultIcon("<Lu>", "#000000", "#ffffff");
    expect((await sharp(icon).metadata()).width).toBe(87);
  });
});

describe("business-card options", () => {
  it("defaults every option off", () => {
    expect(input()).toMatchObject({ barcode: false, dayGlow: false, latestLabel: "LATEST", contactUrl: null });
    expect(input({ latestLabel: "  " }).latestLabel).toBe("LATEST");
  });

  it("parses checkbox values and trims the label", () => {
    const parsed = input({ barcode: "on", dayGlow: "on", latestLabel: " NOW ", contactUrl: "https://adrbn.dev/me.vcf" });
    expect(parsed).toMatchObject({ barcode: true, dayGlow: true, latestLabel: "NOW", contactUrl: "https://adrbn.dev/me.vcf" });
  });

  it("rejects long labels and non-http contact links", () => {
    expect(CardInputSchema.safeParse({ ...input(), latestLabel: "x".repeat(13) }).success).toBe(false);
    expect(CardInputSchema.safeParse({ ...input(), contactUrl: "javascript:alert(1)" }).success).toBe(false);
  });

  it("lists day-glow cards and records the pushed slot on cards and passes", async () => {
    const db = await createTestDb();
    const repo = createCardRepository(db);
    const subs = createSubscriberRepository(db);
    const glow = await repo.create(input({ slug: "glow", dayGlow: "on" }));
    await repo.create(input({ slug: "plain" }));
    const sub = await subs.create({ cardId: glow.id, platform: "apple" });

    expect((await repo.listDayGlow()).map((c) => c.slug)).toEqual(["glow"]);

    const at = new Date("2030-10-10T08:00:00Z");
    await repo.markGlowSlot(glow.id, 2, at);
    expect((await repo.findById(glow.id))?.glowSlot).toBe(2);
    expect((await subs.findBySerial(sub.serialNumber))?.updatedAt.getTime()).toBe(at.getTime());
  });
});
