import type { NextRequest } from "next/server";
import { getServices } from "@/lib/services";
import { createRateLimiter, clientIp } from "@/lib/http/rateLimit";
import { jsonError, publicError, readFields } from "@/lib/http/responses";
import { issueApplePass, IssueRequestSchema, PlatformDisabledError } from "@/lib/passes/issue";

const limiter = createRateLimiter({ limit: 20, windowMs: 60_000 });

/** Public: issue a new Apple Wallet pass (.pkpass) for a card. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/passes/apple/[slug]">) {
  const { slug } = await ctx.params;
  if (!limiter.hit(clientIp(request.headers))) return publicError(request, slug, 429, "Too many requests, try again in a minute.");
  const { config, cards, subscribers } = await getServices();
  const card = await cards.findBySlug(slug);
  if (!card) return jsonError(404, "Card not found");

  const parsed = IssueRequestSchema.safeParse(await readFields(request));
  if (!parsed.success) return publicError(request, slug, 400, "Invalid email address");

  try {
    const pkpass = await issueApplePass(config, subscribers, card, parsed.data);
    return new Response(new Uint8Array(pkpass), {
      headers: {
        "content-type": "application/vnd.apple.pkpass",
        "content-disposition": `attachment; filename="${card.slug}.pkpass"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof PlatformDisabledError) return publicError(request, slug, 404, error.message);
    console.error("[walletcast] apple pass issue failed", error);
    return publicError(request, slug, 500, "Could not create the pass");
  }
}
