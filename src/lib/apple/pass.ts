import { PKPass } from "passkit-generator";
import type { AppleConfig } from "@/lib/config/env";
import type { Card, Subscriber } from "@/lib/db/schema";
import { generateDefaultIcon, LOGO_MASTER, resizePng } from "@/lib/cards/images";

export const APPLE_WEB_SERVICE_PATH = "/api/apple";
export const LATEST_FIELD_KEY = "latest";

/** Text shown on the pass (and in the notification) for the latest broadcast. */
export function latestMessageText(card: Pick<Card, "latestMessage" | "welcomeText">): string {
  return card.latestMessage || card.welcomeText || "You will receive updates here.";
}

function hexToRgb(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

async function imageBuffers(card: Card): Promise<Record<string, Buffer>> {
  const icon = card.icon ?? (await generateDefaultIcon(card.name, card.bgColor, card.fgColor));
  const files: Record<string, Buffer> = {
    "icon.png": await resizePng(icon, 29, 29, "cover"),
    "icon@2x.png": await resizePng(icon, 58, 58, "cover"),
    "icon@3x.png": icon,
  };
  if (card.logo) {
    const { width, height } = LOGO_MASTER;
    files["logo.png"] = await resizePng(card.logo, width / 3, height / 3, "inside");
    files["logo@2x.png"] = await resizePng(card.logo, (width * 2) / 3, (height * 2) / 3, "inside");
    files["logo@3x.png"] = card.logo;
  }
  return files;
}

export interface BuildApplePassArgs {
  card: Card;
  subscriber: Pick<Subscriber, "serialNumber" | "authToken">;
  apple: AppleConfig;
  baseUrl: string;
}

/** Build and sign a .pkpass for one subscriber. */
export async function buildApplePass({ card, subscriber, apple, baseUrl }: BuildApplePassArgs): Promise<Buffer> {
  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: apple.passTypeId,
    teamIdentifier: apple.teamId,
    serialNumber: subscriber.serialNumber,
    authenticationToken: subscriber.authToken,
    webServiceURL: `${baseUrl}${APPLE_WEB_SERVICE_PATH}`,
    organizationName: card.organizationName,
    description: card.name,
    logoText: card.logo ? undefined : card.name,
    backgroundColor: hexToRgb(card.bgColor),
    foregroundColor: hexToRgb(card.fgColor),
    labelColor: hexToRgb(card.labelColor),
    sharingProhibited: false,
    generic: {},
  };

  const pass = new PKPass(
    { "pass.json": Buffer.from(JSON.stringify(passJson)), ...(await imageBuffers(card)) },
    {
      wwdr: apple.wwdr,
      signerCert: apple.signerCert,
      signerKey: apple.signerKey,
      signerKeyPassphrase: apple.signerKeyPassphrase,
    },
  );

  pass.primaryFields.push({ key: "name", label: card.organizationName.toUpperCase(), value: card.name });
  pass.secondaryFields.push({
    key: LATEST_FIELD_KEY,
    label: "LATEST",
    value: latestMessageText(card),
    // Wallet shows a lock-screen notification when this value changes.
    changeMessage: "%@",
  });

  const back = [
    { key: "latest_back", label: "Latest message", value: latestMessageText(card) },
    card.description && { key: "about", label: "About", value: card.description },
    card.websiteUrl && { key: "website", label: "Website", value: card.websiteUrl },
    { key: "powered", label: "Powered by", value: "WalletCast — open-source wallet notifications" },
  ].filter(Boolean) as { key: string; label: string; value: string }[];
  pass.backFields.push(...back);

  return pass.getAsBuffer();
}
