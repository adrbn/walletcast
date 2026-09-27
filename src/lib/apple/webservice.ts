import { timingSafeEqual } from "node:crypto";
import type { AppleConfig } from "@/lib/config/env";
import type { Card, Subscriber } from "@/lib/db/schema";
import type { SubscriberRepository } from "@/lib/subscribers/repository";
import type { CardRepository } from "@/lib/cards/repository";

/**
 * Apple PassKit web service (https://developer.apple.com/documentation/walletpasses/adding-a-web-service-to-update-passes).
 * Framework-free: route handlers translate Request -> these calls -> Response.
 */

export interface WsResponse {
  status: number;
  body?: string | Buffer;
  headers?: Record<string, string>;
}

export interface AppleWebServiceDeps {
  apple: AppleConfig;
  subscribers: SubscriberRepository;
  cards: CardRepository;
  buildPass: (card: Card, subscriber: Subscriber) => Promise<Buffer>;
  log?: (message: string) => void;
}

const json = (status: number, data: unknown): WsResponse => ({
  status,
  body: JSON.stringify(data),
  headers: { "content-type": "application/json" },
});

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function tokenFrom(authorization: string | null): string | null {
  const match = authorization?.match(/^ApplePass\s+(.+)$/);
  return match ? match[1].trim() : null;
}

/** HTTP dates have 1s precision. */
function toHttpSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

export function createAppleWebService(deps: AppleWebServiceDeps) {
  const { apple, subscribers, cards } = deps;
  const log = deps.log ?? ((m: string) => console.info(`[apple] ${m}`));

  async function authorize(passTypeId: string, serial: string, authorization: string | null) {
    if (passTypeId !== apple.passTypeId) return null;
    const token = tokenFrom(authorization);
    if (!token) return null;
    const subscriber = await subscribers.findBySerial(serial);
    if (!subscriber || subscriber.platform !== "apple") return null;
    return safeEqual(subscriber.authToken, token) ? subscriber : null;
  }

  return {
    async register(args: {
      deviceLibraryId: string;
      passTypeId: string;
      serialNumber: string;
      authorization: string | null;
      body: unknown;
    }): Promise<WsResponse> {
      const subscriber = await authorize(args.passTypeId, args.serialNumber, args.authorization);
      if (!subscriber) return { status: 401 };
      const pushToken = (args.body as { pushToken?: unknown } | null)?.pushToken;
      if (typeof pushToken !== "string" || !/^[0-9a-fA-F]{16,200}$/.test(pushToken)) {
        return { status: 400 };
      }
      const created = await subscribers.registerAppleDevice({
        deviceLibraryId: args.deviceLibraryId,
        pushToken,
        serialNumber: args.serialNumber,
        passTypeId: args.passTypeId,
      });
      return { status: created ? 201 : 200 };
    },

    async unregister(args: {
      deviceLibraryId: string;
      passTypeId: string;
      serialNumber: string;
      authorization: string | null;
    }): Promise<WsResponse> {
      const subscriber = await authorize(args.passTypeId, args.serialNumber, args.authorization);
      if (!subscriber) return { status: 401 };
      await subscribers.unregisterAppleDevice(args.deviceLibraryId, args.serialNumber);
      return { status: 200 };
    },

    async listUpdated(args: {
      deviceLibraryId: string;
      passTypeId: string;
      passesUpdatedSince: string | null;
    }): Promise<WsResponse> {
      if (args.passTypeId !== apple.passTypeId) return { status: 404 };
      let since: Date | undefined;
      if (args.passesUpdatedSince) {
        const ms = Number(args.passesUpdatedSince);
        if (Number.isFinite(ms)) since = new Date(ms);
      }
      const rows = await subscribers.serialsForDevice(args.deviceLibraryId, args.passTypeId, since);
      if (rows.length === 0) return { status: 204 };
      const lastUpdated = Math.max(...rows.map((r) => r.updatedAt.getTime()));
      return json(200, { serialNumbers: rows.map((r) => r.serialNumber), lastUpdated: String(lastUpdated) });
    },

    async getPass(args: {
      passTypeId: string;
      serialNumber: string;
      authorization: string | null;
      ifModifiedSince: string | null;
    }): Promise<WsResponse> {
      const subscriber = await authorize(args.passTypeId, args.serialNumber, args.authorization);
      if (!subscriber) return { status: 401 };
      const card = await cards.findById(subscriber.cardId);
      if (!card) return { status: 404 };

      const lastModified = new Date(Math.max(subscriber.updatedAt.getTime(), card.updatedAt.getTime()));
      if (args.ifModifiedSince) {
        const since = new Date(args.ifModifiedSince);
        if (!Number.isNaN(since.getTime()) && toHttpSeconds(lastModified) <= toHttpSeconds(since)) {
          return { status: 304 };
        }
      }
      const pass = await deps.buildPass(card, subscriber);
      return {
        status: 200,
        body: pass,
        headers: {
          "content-type": "application/vnd.apple.pkpass",
          "last-modified": lastModified.toUTCString(),
          "cache-control": "no-cache",
        },
      };
    },

    async log(body: unknown): Promise<WsResponse> {
      const logs = (body as { logs?: unknown } | null)?.logs;
      if (Array.isArray(logs)) {
        for (const entry of logs.slice(0, 20)) log(String(entry).slice(0, 500));
      }
      return { status: 200 };
    },
  };
}

export type AppleWebService = ReturnType<typeof createAppleWebService>;
