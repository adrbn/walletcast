import { z } from "zod";

/**
 * Environment configuration.
 *
 * Every integration is optional so WalletCast boots with zero setup:
 * - no DATABASE_URL  -> embedded PGlite database in ./.data
 * - no Apple vars    -> Apple Wallet disabled (UI explains how to enable)
 * - no Google vars   -> Google Wallet disabled
 */

const optionalString = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  BASE_URL: z.url().default("http://localhost:3000"),
  ADMIN_PASSWORD: optionalString,
  SESSION_SECRET: optionalString,
  DATABASE_URL: optionalString,
  PGLITE_DIR: z.string().default("./.data/pglite"),

  APPLE_PASS_TYPE_ID: optionalString,
  APPLE_TEAM_ID: optionalString,
  APPLE_SIGNER_CERT: optionalString,
  APPLE_SIGNER_KEY: optionalString,
  APPLE_SIGNER_KEY_PASSPHRASE: optionalString,
  APPLE_WWDR_CERT: optionalString,

  GOOGLE_ISSUER_ID: optionalString,
  GOOGLE_SERVICE_ACCOUNT_JSON: optionalString,
});

export type RawEnv = z.infer<typeof EnvSchema>;

export interface AppleConfig {
  passTypeId: string;
  teamId: string;
  signerCert: string;
  signerKey: string;
  signerKeyPassphrase?: string;
  wwdr: string;
}

export interface GoogleServiceAccount {
  client_email: string;
  private_key: string;
}

export interface GoogleConfig {
  issuerId: string;
  serviceAccount: GoogleServiceAccount;
}

export interface AppConfig {
  env: RawEnv["NODE_ENV"];
  baseUrl: string;
  adminPassword?: string;
  sessionSecret?: string;
  databaseUrl?: string;
  pgliteDir: string;
  apple: AppleConfig | null;
  google: GoogleConfig | null;
  /** Human readable problems with partially configured integrations. */
  warnings: string[];
}

/** Accepts raw PEM or base64-encoded PEM (handy for env vars on PaaS). */
export function decodePem(value: string): string {
  const trimmed = value.trim();
  if (trimmed.includes("-----BEGIN")) return trimmed.replace(/\\n/g, "\n");
  return Buffer.from(trimmed, "base64").toString("utf8");
}

/** Accepts raw JSON or base64-encoded JSON. */
export function decodeJson(value: string): unknown {
  const trimmed = value.trim();
  const text = trimmed.startsWith("{")
    ? trimmed
    : Buffer.from(trimmed, "base64").toString("utf8");
  return JSON.parse(text);
}

const ServiceAccountSchema = z.object({
  client_email: z.email(),
  private_key: z.string().includes("PRIVATE KEY"),
});

function parseApple(raw: RawEnv, warnings: string[]): AppleConfig | null {
  const keys = [
    "APPLE_PASS_TYPE_ID",
    "APPLE_TEAM_ID",
    "APPLE_SIGNER_CERT",
    "APPLE_SIGNER_KEY",
    "APPLE_WWDR_CERT",
  ] as const;
  const present = keys.filter((k) => raw[k]);
  if (present.length === 0) return null;
  if (present.length < keys.length) {
    const missing = keys.filter((k) => !raw[k]);
    warnings.push(`Apple Wallet disabled: missing ${missing.join(", ")}`);
    return null;
  }
  return {
    passTypeId: raw.APPLE_PASS_TYPE_ID!,
    teamId: raw.APPLE_TEAM_ID!,
    signerCert: decodePem(raw.APPLE_SIGNER_CERT!),
    signerKey: decodePem(raw.APPLE_SIGNER_KEY!),
    signerKeyPassphrase: raw.APPLE_SIGNER_KEY_PASSPHRASE,
    wwdr: decodePem(raw.APPLE_WWDR_CERT!),
  };
}

function parseGoogle(raw: RawEnv, warnings: string[]): GoogleConfig | null {
  const { GOOGLE_ISSUER_ID: issuerId, GOOGLE_SERVICE_ACCOUNT_JSON: json } = raw;
  if (!issuerId && !json) return null;
  if (!issuerId || !json) {
    warnings.push(
      "Google Wallet disabled: set both GOOGLE_ISSUER_ID and GOOGLE_SERVICE_ACCOUNT_JSON",
    );
    return null;
  }
  try {
    const parsed = ServiceAccountSchema.safeParse(decodeJson(json));
    if (!parsed.success) {
      warnings.push("Google Wallet disabled: GOOGLE_SERVICE_ACCOUNT_JSON is not a valid service account key");
      return null;
    }
    return { issuerId, serviceAccount: parsed.data };
  } catch {
    warnings.push("Google Wallet disabled: GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON");
    return null;
  }
}

export function parseConfig(source: Record<string, string | undefined>): AppConfig {
  const raw = EnvSchema.parse(source);
  const warnings: string[] = [];

  if (raw.SESSION_SECRET && raw.SESSION_SECRET.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters");
  }
  if (raw.NODE_ENV === "production") {
    if (!raw.ADMIN_PASSWORD) warnings.push("ADMIN_PASSWORD is not set: the dashboard is locked");
    if (!raw.SESSION_SECRET) warnings.push("SESSION_SECRET is not set: the dashboard is locked");
  }

  return {
    env: raw.NODE_ENV,
    baseUrl: raw.BASE_URL.replace(/\/+$/, ""),
    adminPassword: raw.ADMIN_PASSWORD,
    sessionSecret: raw.SESSION_SECRET,
    databaseUrl: raw.DATABASE_URL,
    pgliteDir: raw.PGLITE_DIR,
    apple: parseApple(raw, warnings),
    google: parseGoogle(raw, warnings),
    warnings,
  };
}

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!cached) cached = parseConfig(process.env);
  return cached;
}

/** Test helper. */
export function resetConfigCache(): void {
  cached = null;
}
