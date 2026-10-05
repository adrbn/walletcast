import { getConfig, type AppConfig } from "@/lib/config/env";
import { getDb, type Db } from "@/lib/db/client";
import { createCardRepository, type CardRepository } from "@/lib/cards/repository";
import { createSubscriberRepository, type SubscriberRepository } from "@/lib/subscribers/repository";
import { buildApplePass } from "@/lib/apple/pass";
import { createApnsSender, type ApnsSender } from "@/lib/apple/apns";
import { createAppleWebService, type AppleWebService } from "@/lib/apple/webservice";
import { createGoogleWalletApi, type GoogleWalletApi } from "@/lib/google/client";

/** Wires config + database into the framework-free modules. One per process. */
export interface Services {
  config: AppConfig;
  db: Db;
  cards: CardRepository;
  subscribers: SubscriberRepository;
  apns: ApnsSender | null;
  googleApi: GoogleWalletApi | null;
  appleWebService: AppleWebService | null;
}

const globalForServices = globalThis as unknown as { __walletcastServices?: Promise<Services> };

async function build(): Promise<Services> {
  const config = getConfig();
  for (const warning of config.warnings) console.warn(`[walletcast] ${warning}`);
  const db = await getDb();
  const cards = createCardRepository(db);
  const subscribers = createSubscriberRepository(db);
  const apple = config.apple;
  return {
    config,
    db,
    cards,
    subscribers,
    apns: apple ? createApnsSender(apple) : null,
    googleApi: config.google ? createGoogleWalletApi(config.google) : null,
    appleWebService: apple
      ? createAppleWebService({
          apple,
          cards,
          subscribers,
          buildPass: (card, subscriber) => buildApplePass({ card, subscriber, apple, baseUrl: config.baseUrl, timeZone: config.glowTimeZone }),
          log: (line) => console.info(`[apple-wallet] ${line}`),
        })
      : null,
  };
}

export function getServices(): Promise<Services> {
  globalForServices.__walletcastServices ??= build().catch((error) => {
    globalForServices.__walletcastServices = undefined;
    throw error;
  });
  return globalForServices.__walletcastServices;
}
