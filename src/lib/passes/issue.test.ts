import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseConfig } from "@/lib/config/env";
import { createTestDb } from "@/lib/testing/db";
import { testAppleConfig } from "@/lib/testing/certs";
import { createCardRepository } from "@/lib/cards/repository";
import { createSubscriberRepository } from "@/lib/subscribers/repository";
import { CardInputSchema } from "@/lib/cards/validation";
import type { GoogleWalletApi } from "@/lib/google/client";
import { issueApplePass, issueGooglePass, IssueRequestSchema, PlatformDisabledError } from "./issue";

const baseConfig = parseConfig({ BASE_URL: "https://wc.test", SESSION_SECRET: "x".repeat(32) });

async function setup() {
  const db = await createTestDb();
  const card = await createCardRepository(db).create(
    CardInputSchema.parse({ name: "Lu", organizationName: "Lu", slug: "lu" }),
  );
  return { card, subscribers: createSubscriberRepository(db) };
}

describe("IssueRequestSchema", () => {
  it("normalises optional email and source", () => {
    expect(IssueRequestSchema.parse({})).toEqual({ email: null, src: null });
    expect(IssueRequestSchema.parse({ email: " A@B.co ", src: "window-1" })).toEqual({ email: "a@b.co", src: "window-1" });
    expect(IssueRequestSchema.parse({ email: "", src: "" })).toEqual({ email: null, src: null });
    expect(IssueRequestSchema.safeParse({ email: "nope" }).success).toBe(false);
    expect(IssueRequestSchema.safeParse({ src: "../x" }).success).toBe(false);
  });
});

describe("issuing passes", () => {
  it("refuses platforms that are not configured", async () => {
    const { card, subscribers } = await setup();
    const req = { email: null, src: null };
    await expect(issueApplePass(baseConfig, subscribers, card, req)).rejects.toBeInstanceOf(PlatformDisabledError);
    const api = {} as GoogleWalletApi;
    await expect(issueGooglePass(baseConfig, subscribers, api, card, req)).rejects.toBeInstanceOf(PlatformDisabledError);
  });

  it("creates an Apple subscriber and returns a pkpass", async () => {
    const { card, subscribers } = await setup();
    const config = { ...baseConfig, apple: testAppleConfig() };
    const pkpass = await issueApplePass(config, subscribers, card, { email: "a@b.co", src: "door" });
    expect(pkpass.subarray(0, 2).toString()).toBe("PK");
    expect(await subscribers.countBySource(card.id)).toEqual([expect.objectContaining({ source: "door" })]);
  });

  it("upserts the Google class and returns a save link", async () => {
    const { card, subscribers } = await setup();
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    const config = {
      ...baseConfig,
      google: { issuerId: "iss", serviceAccount: { client_email: "a@b.iam", private_key: privateKey } },
    };
    const classes: string[] = [];
    const api: GoogleWalletApi = {
      async upsertGenericClass(c) {
        classes.push(c.id);
      },
      async patchGenericObject() {},
      async addMessageToGenericObject() {},
    };
    const url = await issueGooglePass(config, subscribers, api, card, { email: null, src: null });
    expect(url).toMatch(/^https:\/\/pay\.google\.com\/gp\/v\/save\//);
    expect(classes).toHaveLength(1);
    expect(await subscribers.listActiveGoogle(card.id)).toHaveLength(1);
  });
});
