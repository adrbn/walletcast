import type { NextRequest } from "next/server";
import { getServices } from "@/lib/services";
import { generateDefaultIcon } from "@/lib/cards/images";

/**
 * Public card images (`logo` or `icon`). Google Wallet fetches them by URL.
 * The icon falls back to a generated letter icon.
 */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/cards/[id]/image/[kind]">) {
  const { id, kind } = await ctx.params;
  if (kind !== "logo" && kind !== "icon") return new Response("Not found", { status: 404 });
  const { cards } = await getServices();
  const card = await cards.findById(id);
  if (!card) return new Response("Not found", { status: 404 });

  const image = kind === "logo" ? card.logo : (card.icon ?? (await generateDefaultIcon(card.name, card.bgColor, card.fgColor)));
  if (!image) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(image), {
    headers: { "content-type": "image/png", "cache-control": "public, max-age=86400, immutable" },
  });
}
