import type { Card, Subscriber } from "@/lib/db/schema";
import { latestMessageText } from "@/lib/apple/pass";
import { publicCardUrl } from "@/lib/cards/links";

/**
 * Mapping WalletCast cards/subscribers to Google Wallet Generic passes.
 * https://developers.google.com/wallet/generic/rest/v1/genericobject
 */

const localized = (value: string) => ({ defaultValue: { language: "en", value } });

/** Google ids: `${issuerId}.${suffix}` where suffix is [\w.-]+. */
export function classId(issuerId: string, card: Pick<Card, "id">): string {
  return `${issuerId}.wc_${card.id.replace(/-/g, "")}`;
}

export function objectId(issuerId: string, subscriber: Pick<Subscriber, "serialNumber">): string {
  return `${issuerId}.${subscriber.serialNumber.replace(/[^\w.-]/g, "_")}`;
}

export function imageUrl(baseUrl: string, card: Pick<Card, "id" | "updatedAt">, kind: "logo" | "icon"): string {
  return `${baseUrl}/api/cards/${card.id}/image/${kind}?v=${card.updatedAt.getTime()}`;
}

export function buildGenericClass(issuerId: string, card: Card) {
  return {
    id: classId(issuerId, card),
    // Row showing the latest broadcast on the card front.
    classTemplateInfo: {
      cardTemplateOverride: {
        cardRowTemplateInfos: [
          {
            oneItem: {
              item: {
                firstValue: {
                  fields: [{ fieldPath: "object.textModulesData['latest']" }],
                },
              },
            },
          },
        ],
      },
    },
  };
}

export function buildGenericObject(issuerId: string, card: Card, subscriber: Subscriber, baseUrl: string) {
  return {
    id: objectId(issuerId, subscriber),
    classId: classId(issuerId, card),
    state: "ACTIVE",
    ...buildObjectPatch(card, baseUrl),
  };
}

/**
 * Everything that can change after the pass was saved. PATCHed on every
 * broadcast so design edits also reach Google passes.
 */
export function buildObjectPatch(card: Card, baseUrl: string) {
  return {
    cardTitle: localized(card.organizationName),
    header: localized(card.name),
    hexBackgroundColor: card.bgColor,
    logo: {
      sourceUri: { uri: imageUrl(baseUrl, card, "icon") },
      contentDescription: localized(`${card.name} logo`),
    },
    ...(card.logo
      ? {
          wideLogo: {
            sourceUri: { uri: imageUrl(baseUrl, card, "logo") },
            contentDescription: localized(`${card.name} logo`),
          },
        }
      : {}),
    ...(card.barcode ? { barcode: { type: "QR_CODE", value: publicCardUrl(baseUrl, card.slug, "pass") } } : {}),
    textModulesData: [
      { id: "latest", header: "Latest", body: latestMessageText(card) },
      ...(card.description ? [{ id: "about", header: "About", body: card.description }] : []),
    ],
    linksModuleData: {
      uris: card.websiteUrl ? [{ uri: card.websiteUrl, description: "Website", id: "website" }] : [],
    },
  };
}

export function buildNotifyMessage(title: string, body: string, id: string) {
  return {
    message: {
      id,
      header: title,
      body,
      messageType: "TEXT_AND_NOTIFY",
    },
  };
}
