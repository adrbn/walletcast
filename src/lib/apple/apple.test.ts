import http2 from "node:http2";
import { inflateRawSync } from "node:zlib";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/client";
import { createTestDb } from "@/lib/testing/db";
import { createSelfSignedCert, testAppleConfig } from "@/lib/testing/certs";
import { createCardRepository } from "@/lib/cards/repository";
import { createSubscriberRepository } from "@/lib/subscribers/repository";
import { CardInputSchema } from "@/lib/cards/validation";
import { buildApplePass, latestMessageText } from "./pass";
import { createApnsSender, summarisePushResults } from "./apns";
import { createAppleWebService, safeEqual } from "./webservice";

const apple = testAppleConfig();
const cardInput = CardInputSchema.parse({ name: "Lu's Café", organizationName: "Lu", slug: "lu" });

/** Minimal zip reader: list file names in a .pkpass (stored/deflated entries). */
function zipEntries(buf: Buffer): string[] {
  const names: string[] = [];
  let offset = 0;
  while (buf.readUInt32LE(offset) === 0x04034b50) {
    const compressedSize = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    names.push(buf.subarray(offset + 30, offset + 30 + nameLen).toString());
    offset += 30 + nameLen + extraLen + compressedSize;
  }
  return names;
}

/** Read one entry of a .pkpass (stored or deflated). */
function zipRead(buf: Buffer, name: string): Buffer {
  let offset = 0;
  while (buf.readUInt32LE(offset) === 0x04034b50) {
    const method = buf.readUInt16LE(offset + 8);
    const size = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const start = offset + 30 + nameLen + extraLen;
    if (buf.subarray(offset + 30, offset + 30 + nameLen).toString() === name) {
      const data = buf.subarray(start, start + size);
      return method === 8 ? inflateRawSync(data) : data;
    }
    offset = start + size;
  }
  throw new Error(`${name} not in pass`);
}

async function passJsonFor(over: Record<string, unknown>, extra: { timeZone?: string; now?: Date } = {}) {
  const db = await createTestDb();
  const card = await createCardRepository(db).create(CardInputSchema.parse({ name: "Lu's Café", organizationName: "Lu", slug: "lu", ...over }));
  const sub = await createSubscriberRepository(db).create({ cardId: card.id, platform: "apple" });
  const pkpass = await buildApplePass({ card, subscriber: sub, apple, baseUrl: "https://wc.test", ...extra });
  return { card, pkpass, json: JSON.parse(zipRead(pkpass, "pass.json").toString()) };
}

describe("buildApplePass", () => {
  it("keeps plain cards generic, labelled LATEST and without barcode", async () => {
    const { json } = await passJsonFor({});
    expect(json.generic.secondaryFields[0].label).toBe("LATEST");
    expect(json.storeCard).toBeUndefined();
    expect(json.barcodes).toBeUndefined();
    expect(JSON.stringify(json)).not.toMatch(/\u2014|—/);
  });

  it("adds the share QR and the custom label", async () => {
    const { json } = await passJsonFor({ slug: "adrien", barcode: "on", latestLabel: "NOW" });
    expect(json.barcodes[0]).toMatchObject({ format: "PKBarcodeFormatQR", message: "https://wc.test/c/adrien?src=pass" });
    expect(json.generic.secondaryFields[0].label).toBe("NOW");
  });

  it("shows the logo text and an optional header field", async () => {
    const { json } = await passJsonFor({ logoText: "adrbn", headerLabel: "Rome", headerValue: "DevFest" });
    expect(json.logoText).toBe("adrbn");
    expect(json.generic.headerFields[0]).toMatchObject({ label: "ROME", value: "DevFest" });
    const plain = await passJsonFor({});
    expect(plain.json.logoText).toBe(plain.card.name);
    expect(plain.json.generic.headerFields).toEqual([]);
  });

  it("turns day-glow cards into store cards with a strip", async () => {
    const { card, pkpass, json } = await passJsonFor(
      { dayGlow: "on" },
      { timeZone: "Europe/Rome", now: new Date("2026-10-10T07:30:00Z") },
    );
    expect(json.storeCard.primaryFields[0].value).toBe(card.name);
    expect(json.generic).toBeUndefined();
    expect(zipEntries(pkpass)).toEqual(expect.arrayContaining(["strip.png", "strip@2x.png", "strip@3x.png"]));
  });

  it("produces a signed pkpass bundle", async () => {
    const db = await createTestDb();
    const card = await createCardRepository(db).create(cardInput);
    const sub = await createSubscriberRepository(db).create({ cardId: card.id, platform: "apple" });
    const pkpass = await buildApplePass({ card, subscriber: sub, apple, baseUrl: "https://wc.test" });
    const entries = zipEntries(pkpass);
    expect(entries).toEqual(expect.arrayContaining(["pass.json", "manifest.json", "signature", "icon.png", "icon@2x.png"]));
  });

  it("includes logo files when the card has a logo", async () => {
    const db = await createTestDb();
    const { generateDefaultIcon } = await import("@/lib/cards/images");
    const logo = await generateDefaultIcon("L", "#000000", "#ffffff");
    const card = await createCardRepository(db).create(cardInput, { logo });
    const sub = await createSubscriberRepository(db).create({ cardId: card.id, platform: "apple" });
    const entries = zipEntries(await buildApplePass({ card, subscriber: sub, apple, baseUrl: "https://wc.test" }));
    expect(entries).toContain("logo@2x.png");
  });

  it("falls back to welcome text then a default", () => {
    expect(latestMessageText({ latestMessage: "New!", welcomeText: "Hi" })).toBe("New!");
    expect(latestMessageText({ latestMessage: null, welcomeText: "Hi" })).toBe("Hi");
    expect(latestMessageText({ latestMessage: null, welcomeText: "" })).toMatch(/updates/);
  });
});

describe("apple web service", () => {
  let db: Db;
  let ws: ReturnType<typeof createAppleWebService>;
  let serial: string;
  let token: string;
  let cardId: string;
  const device = "device-1";
  const pushToken = "a".repeat(64);

  beforeEach(async () => {
    db = await createTestDb();
    const cards = createCardRepository(db);
    const subscribers = createSubscriberRepository(db);
    const card = await cards.create(cardInput);
    cardId = card.id;
    const sub = await subscribers.create({ cardId: card.id, platform: "apple" });
    serial = sub.serialNumber;
    token = sub.authToken;
    ws = createAppleWebService({
      apple,
      cards,
      subscribers,
      buildPass: async () => Buffer.from("PKPASS"),
      log: () => {},
    });
  });

  const auth = () => `ApplePass ${token}`;
  const reg = (over: Partial<Parameters<typeof ws.register>[0]> = {}) =>
    ws.register({
      deviceLibraryId: device,
      passTypeId: apple.passTypeId,
      serialNumber: serial,
      authorization: auth(),
      body: { pushToken },
      ...over,
    });

  it("registers a device (201 then 200) and lists its passes", async () => {
    expect((await reg()).status).toBe(201);
    expect((await reg()).status).toBe(200);

    const list = await ws.listUpdated({ deviceLibraryId: device, passTypeId: apple.passTypeId, passesUpdatedSince: null });
    expect(list.status).toBe(200);
    const body = JSON.parse(String(list.body));
    expect(body.serialNumbers).toEqual([serial]);

    const none = await ws.listUpdated({
      deviceLibraryId: device,
      passTypeId: apple.passTypeId,
      passesUpdatedSince: body.lastUpdated,
    });
    expect(none.status).toBe(204);

    expect(await createSubscriberRepository(db).applePushTokensForCard(cardId)).toEqual([pushToken]);
  });

  it("rejects bad auth, wrong pass type and bad push tokens", async () => {
    expect((await reg({ authorization: "ApplePass nope" })).status).toBe(401);
    expect((await reg({ authorization: null })).status).toBe(401);
    expect((await reg({ passTypeId: "pass.other" })).status).toBe(401);
    expect((await reg({ serialNumber: "unknown" })).status).toBe(401);
    expect((await reg({ body: { pushToken: "zz" } })).status).toBe(400);
    expect((await reg({ body: null })).status).toBe(400);
    const wrongType = await ws.listUpdated({ deviceLibraryId: device, passTypeId: "x", passesUpdatedSince: null });
    expect(wrongType.status).toBe(404);
  });

  it("serves the latest pass with Last-Modified / 304 support", async () => {
    const res = await ws.getPass({ passTypeId: apple.passTypeId, serialNumber: serial, authorization: auth(), ifModifiedSince: null });
    expect(res.status).toBe(200);
    expect(res.headers?.["content-type"]).toBe("application/vnd.apple.pkpass");
    const lastModified = res.headers!["last-modified"];
    const cached = await ws.getPass({ passTypeId: apple.passTypeId, serialNumber: serial, authorization: auth(), ifModifiedSince: lastModified });
    expect(cached.status).toBe(304);
    const garbage = await ws.getPass({ passTypeId: apple.passTypeId, serialNumber: serial, authorization: auth(), ifModifiedSince: "garbage" });
    expect(garbage.status).toBe(200);
    const unauthorized = await ws.getPass({ passTypeId: apple.passTypeId, serialNumber: serial, authorization: null, ifModifiedSince: null });
    expect(unauthorized.status).toBe(401);
  });

  it("returns 404 when the card was deleted", async () => {
    // Detach: delete card after fetching the subscriber reference.
    const cards = createCardRepository(db);
    const subscribers = createSubscriberRepository(db);
    const orphanWs = createAppleWebService({
      apple,
      cards: { ...cards, findById: async () => null },
      subscribers,
      buildPass: async () => Buffer.from(""),
    });
    const res = await orphanWs.getPass({ passTypeId: apple.passTypeId, serialNumber: serial, authorization: auth(), ifModifiedSince: null });
    expect(res.status).toBe(404);
  });

  it("reports the pass as updated after a card design edit", async () => {
    await reg();
    const first = await ws.listUpdated({ deviceLibraryId: device, passTypeId: apple.passTypeId, passesUpdatedSince: null });
    const tag = JSON.parse(String(first.body)).lastUpdated;
    await new Promise((r) => setTimeout(r, 5));
    await createCardRepository(db).update(cardId, { ...cardInput, bgColor: "#ff0000" });
    const next = await ws.listUpdated({ deviceLibraryId: device, passTypeId: apple.passTypeId, passesUpdatedSince: tag });
    expect(JSON.parse(String(next.body)).serialNumbers).toEqual([serial]);
  });

  it("unregisters and marks the subscriber removed", async () => {
    await reg();
    expect((await ws.unregister({ deviceLibraryId: device, passTypeId: apple.passTypeId, serialNumber: serial, authorization: auth() })).status).toBe(200);
    expect((await createSubscriberRepository(db).findBySerial(serial))?.status).toBe("removed");
    const { appleDevices } = await import("@/lib/db/schema");
    expect(await db.select().from(appleDevices)).toEqual([]);
    expect((await ws.unregister({ deviceLibraryId: device, passTypeId: apple.passTypeId, serialNumber: serial, authorization: null })).status).toBe(401);
  });

  it("accepts logs", async () => {
    const lines: string[] = [];
    const logging = createAppleWebService({
      apple,
      cards: createCardRepository(db),
      subscribers: createSubscriberRepository(db),
      buildPass: async () => Buffer.from(""),
      log: (m) => lines.push(m),
    });
    expect((await logging.log({ logs: ["a", "b"] })).status).toBe(200);
    expect((await logging.log(null)).status).toBe(200);
    expect(lines).toEqual(["a", "b"]);
  });

  it("compares tokens in constant time", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("APNs sender", () => {
  const tls = createSelfSignedCert("localhost");
  let server: http2.Http2SecureServer;
  let host: string;
  const seen: { path: string; topic: string }[] = [];

  beforeAll(async () => {
    server = http2.createSecureServer({ key: tls.key, cert: tls.cert });
    server.on("stream", (stream, headers) => {
      const path = String(headers[":path"]);
      seen.push({ path, topic: String(headers["apns-topic"]) });
      stream.on("data", () => {});
      stream.on("end", () => {
        if (path.endsWith("gone")) {
          stream.respond({ ":status": 410 });
          stream.end(JSON.stringify({ reason: "Unregistered" }));
        } else if (path.endsWith("bad")) {
          stream.respond({ ":status": 400 });
          stream.end(JSON.stringify({ reason: "BadTopic" }));
        } else {
          stream.respond({ ":status": 200 });
          stream.end();
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    host = `https://localhost:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server.close();
  });

  it("pushes to every token and reports invalid ones", async () => {
    const sender = createApnsSender(apple, { host, ca: tls.cert });
    const result = await sender.sendPassUpdates(["ok1", "ok2", "gone", "bad"]);
    expect(result.sent).toBe(2);
    expect(result.failed).toBe(2);
    expect(result.invalidTokens).toEqual(["gone"]);
    expect(result.errors[0]).toMatch(/BadTopic/);
    expect(seen.every((s) => s.topic === apple.passTypeId)).toBe(true);
    expect(seen[0].path).toBe("/3/device/ok1");
  });

  it("does nothing without tokens and survives connection errors", async () => {
    const sender = createApnsSender(apple, { host: "https://127.0.0.1:1" });
    expect(await sender.sendPassUpdates([])).toEqual({ sent: 0, failed: 0, invalidTokens: [], errors: [] });
    const failed = await sender.sendPassUpdates(["t1"]);
    expect(failed.failed).toBe(1);
  });

  it("summarises results", () => {
    expect(summarisePushResults([{ token: "x", status: 0, reason: "BadDeviceToken" }]).invalidTokens).toEqual(["x"]);
  });
});
