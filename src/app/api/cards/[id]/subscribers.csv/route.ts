import type { NextRequest } from "next/server";
import { getServices } from "@/lib/services";
import { isAdmin } from "@/server/auth";
import { subscribersToCsv } from "@/lib/subscribers/csv";

/** Admin only: export subscribers (emails are only present if people gave one). */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/cards/[id]/subscribers.csv">) {
  if (!(await isAdmin())) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const { cards, subscribers } = await getServices();
  const card = await cards.findById(id);
  if (!card) return new Response("Not found", { status: 404 });
  const rows = await subscribers.listForCard(id, 100_000);
  return new Response(subscribersToCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${card.slug}-subscribers.csv"`,
    },
  });
}
