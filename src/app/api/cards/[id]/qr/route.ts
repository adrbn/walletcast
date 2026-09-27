import type { NextRequest } from "next/server";
import { getServices } from "@/lib/services";
import { normaliseSource, publicCardUrl, qrPng, qrSvg } from "@/lib/cards/links";

/**
 * QR code pointing at the public card page.
 * `?src=window` tags where the QR is placed; `?format=svg` for print.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/cards/[id]/qr">) {
  const { id } = await ctx.params;
  const { config, cards } = await getServices();
  const card = await cards.findById(id);
  if (!card) return new Response("Not found", { status: 404 });

  const params = request.nextUrl.searchParams;
  const url = publicCardUrl(config.baseUrl, card.slug, normaliseSource(params.get("src")));
  const svg = params.get("format") === "svg";
  const headers: Record<string, string> = { "content-type": svg ? "image/svg+xml" : "image/png" };
  if (params.has("download")) {
    headers["content-disposition"] = `attachment; filename="${card.slug}-qr.${svg ? "svg" : "png"}"`;
  }
  const body = svg ? await qrSvg(url) : new Uint8Array(await qrPng(url));
  return new Response(body, { headers });
}
