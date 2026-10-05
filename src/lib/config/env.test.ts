import { describe, expect, it } from "vitest";
import { decodeJson, decodePem, parseConfig } from "./env";

const PEM = "-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----";

describe("parseConfig", () => {
  it("boots with an empty environment", () => {
    const config = parseConfig({});
    expect(config.baseUrl).toBe("http://localhost:3000");
    expect(config.apple).toBeNull();
    expect(config.google).toBeNull();
    expect(config.warnings).toEqual([]);
  });

  it("reads the glow time zone and cron secret", () => {
    expect(parseConfig({}).glowTimeZone).toBe("Europe/Rome");
    const config = parseConfig({ GLOW_TIMEZONE: "Europe/Lisbon", CRON_SECRET: "s".repeat(24) });
    expect([config.glowTimeZone, config.cronSecret]).toEqual(["Europe/Lisbon", "s".repeat(24)]);
    expect(() => parseConfig({ GLOW_TIMEZONE: "Mars/Olympus" })).toThrow();
  });

  it("strips trailing slashes from BASE_URL", () => {
    expect(parseConfig({ BASE_URL: "https://x.dev///" }).baseUrl).toBe("https://x.dev");
  });

  it("rejects a short SESSION_SECRET", () => {
    expect(() => parseConfig({ SESSION_SECRET: "short" })).toThrow(/32/);
  });

  it("warns when Apple is partially configured", () => {
    const config = parseConfig({ APPLE_PASS_TYPE_ID: "pass.x", APPLE_TEAM_ID: "T" });
    expect(config.apple).toBeNull();
    expect(config.warnings[0]).toMatch(/APPLE_SIGNER_CERT/);
  });

  it("enables Apple with base64 or raw PEM values", () => {
    const b64 = Buffer.from(PEM).toString("base64");
    const config = parseConfig({
      APPLE_PASS_TYPE_ID: "pass.dev.walletcast",
      APPLE_TEAM_ID: "TEAM123",
      APPLE_SIGNER_CERT: b64,
      APPLE_SIGNER_KEY: PEM,
      APPLE_WWDR_CERT: b64,
    });
    expect(config.apple?.signerCert).toBe(PEM);
    expect(config.apple?.signerKey).toBe(PEM);
  });

  it("enables Google with a valid service account", () => {
    const sa = { client_email: "a@b.iam.gserviceaccount.com", private_key: "-----BEGIN PRIVATE KEY-----x" };
    const config = parseConfig({
      GOOGLE_ISSUER_ID: "123",
      GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify(sa),
    });
    expect(config.google?.serviceAccount.client_email).toBe(sa.client_email);
  });

  it("warns on invalid Google JSON", () => {
    const config = parseConfig({ GOOGLE_ISSUER_ID: "1", GOOGLE_SERVICE_ACCOUNT_JSON: "{nope" });
    expect(config.google).toBeNull();
    expect(config.warnings[0]).toMatch(/not valid JSON/);
  });

  it("warns on a service account missing fields", () => {
    const config = parseConfig({ GOOGLE_ISSUER_ID: "1", GOOGLE_SERVICE_ACCOUNT_JSON: "{}" });
    expect(config.warnings[0]).toMatch(/not a valid service account/);
  });

  it("warns when only one Google var is set", () => {
    expect(parseConfig({ GOOGLE_ISSUER_ID: "1" }).warnings[0]).toMatch(/both/);
  });

  it("warns in production without admin credentials", () => {
    const config = parseConfig({ NODE_ENV: "production" });
    expect(config.warnings).toHaveLength(2);
  });
});

describe("decoders", () => {
  it("decodes escaped newlines in raw PEM", () => {
    expect(decodePem("-----BEGIN X-----\\nA\\n-----END X-----")).toContain("\nA\n");
  });
  it("decodes base64 JSON", () => {
    expect(decodeJson(Buffer.from('{"a":1}').toString("base64"))).toEqual({ a: 1 });
  });
});
