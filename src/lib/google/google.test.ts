import { generateKeyPairSync } from "node:crypto";
import { decodeJwt, decodeProtectedHeader, importSPKI, jwtVerify } from "jose";
import { describe, expect, it } from "vitest";
import type { GoogleConfig } from "@/lib/config/env";
import type { Card, Subscriber } from "@/lib/db/schema";
import { createGoogleWalletApi, createSaveUrl, GoogleWalletError, WALLET_API } from "./client";
import {
  buildGenericClass,
  buildGenericObject,
  buildNotifyMessage,
  buildObjectPatch,
  classId,
  objectId,
} from "./objects";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const google: GoogleConfig = {
  issuerId: "3388000000012345678",
  serviceAccount: { client_email: "wallet@proj.iam.gserviceaccount.com", private_key: privateKey },
};

const card = {
  id: "0b8f6c3e-1111-2222-3333-444455556666",
  slug: "lu",
  name: "Lu's Café",
  organizationName: "Lu",
  description: "Best coffee",
  welcomeText: "Welcome!",
  websiteUrl: "https://lu.example",
  bgColor: "#111827",
  fgColor: "#ffffff",
  labelColor: "#9ca3af",
  logo: null,
  icon: null,
  latestMessage: null,
  latestMessageAt: null,
  createdAt: new Date(0),
  updatedAt: new Date(1000),
} as Card;

const subscriber = { serialNumber: "wc-abc_DEF-123" } as Subscriber;

describe("google object mapping", () => {
  it("builds stable ids", () => {
    expect(classId(google.issuerId, card)).toBe(`${google.issuerId}.wc_0b8f6c3e111122223333444455556666`);
    expect(objectId(google.issuerId, { serialNumber: "wc-a/b" })).toBe(`${google.issuerId}.wc-a_b`);
  });

  it("maps a card to a generic object", () => {
    const obj = buildGenericObject(google.issuerId, card, subscriber, "https://wc.test");
    expect(obj.classId).toBe(classId(google.issuerId, card));
    expect(obj.textModulesData[0]).toEqual({ id: "latest", header: "Latest", body: "Welcome!" });
    expect(obj.logo.sourceUri.uri).toBe(`https://wc.test/api/cards/${card.id}/image/icon?v=1000`);
    expect(obj).not.toHaveProperty("wideLogo");
    expect(obj.linksModuleData.uris).toHaveLength(1);

    const withLogo = buildGenericObject(google.issuerId, { ...card, logo: Buffer.from("x"), websiteUrl: null, description: "" }, subscriber, "https://wc.test");
    expect(withLogo).toHaveProperty("wideLogo");
    expect(withLogo.linksModuleData.uris).toEqual([]);
    expect(withLogo.textModulesData).toHaveLength(1);
  });

  it("builds class, patch and message payloads", () => {
    expect(buildGenericClass(google.issuerId, card).id).toBe(classId(google.issuerId, card));
    expect(buildObjectPatch({ ...card, latestMessage: "Sale!" }, "https://wc.test").textModulesData[0].body).toBe("Sale!");
    expect(buildNotifyMessage("Hi", "There", "m1").message).toEqual({
      id: "m1",
      header: "Hi",
      body: "There",
      messageType: "TEXT_AND_NOTIFY",
    });
  });
});

function fakeFetch(responses: Record<string, number>) {
  const calls: { method: string; url: string; body?: string; auth?: string }[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    const method = init.method ?? "GET";
    const headers = init.headers as Record<string, string>;
    calls.push({ method, url, body: init.body as string | undefined, auth: headers.authorization });
    const status = responses[`${method} ${url.replace(WALLET_API, "")}`] ?? 200;
    return new Response(status === 200 ? "{}" : "nope", { status });
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}

describe("google wallet api", () => {
  const getAccessToken = async () => "tok";

  it("creates a class when it does not exist", async () => {
    const { calls, fetchFn } = fakeFetch({ "GET /genericClass/c1": 404 });
    await createGoogleWalletApi(google, { fetch: fetchFn, getAccessToken }).upsertGenericClass({ id: "c1" });
    expect(calls.map((c) => c.method)).toEqual(["GET", "POST"]);
    expect(calls[1].url).toBe(`${WALLET_API}/genericClass`);
    expect(calls[0].auth).toBe("Bearer tok");
  });

  it("updates an existing class", async () => {
    const { calls, fetchFn } = fakeFetch({});
    await createGoogleWalletApi(google, { fetch: fetchFn, getAccessToken }).upsertGenericClass({ id: "c1" });
    expect(calls.map((c) => c.method)).toEqual(["GET", "PUT"]);
  });

  it("patches objects and adds messages", async () => {
    const { calls, fetchFn } = fakeFetch({});
    const api = createGoogleWalletApi(google, { fetch: fetchFn, getAccessToken });
    await api.patchGenericObject("i.o1", { a: 1 });
    await api.addMessageToGenericObject("i.o1", { message: {} });
    expect(calls.map((c) => `${c.method} ${c.url.replace(WALLET_API, "")}`)).toEqual([
      "PATCH /genericObject/i.o1",
      "POST /genericObject/i.o1/addMessage",
    ]);
    expect(JSON.parse(calls[0].body!)).toEqual({ a: 1 });
  });

  it("raises GoogleWalletError on API errors", async () => {
    const { fetchFn } = fakeFetch({ "PATCH /genericObject/x": 403, "GET /genericClass/c": 500 });
    const api = createGoogleWalletApi(google, { fetch: fetchFn, getAccessToken });
    await expect(api.patchGenericObject("x", {})).rejects.toMatchObject({ name: "GoogleWalletError", status: 403 });
    await expect(api.upsertGenericClass({ id: "c" })).rejects.toBeInstanceOf(GoogleWalletError);
  });
});

describe("createSaveUrl", () => {
  it("returns a save link with a JWT signed by the service account", async () => {
    const obj = buildGenericObject(google.issuerId, card, subscriber, "https://wc.test");
    const url = await createSaveUrl(google, obj, "https://wc.test");
    expect(url.startsWith("https://pay.google.com/gp/v/save/")).toBe(true);
    const jwt = url.split("/").pop()!;
    expect(decodeProtectedHeader(jwt).alg).toBe("RS256");
    const { payload } = await jwtVerify(jwt, await importSPKI(publicKey, "RS256"), {
      issuer: google.serviceAccount.client_email,
      audience: "google",
    });
    expect(payload.typ).toBe("savetowallet");
    expect(payload.origins).toEqual(["https://wc.test"]);
    expect((decodeJwt(jwt).payload as { genericObjects: unknown[] }).genericObjects[0]).toEqual(obj);
  });
});
