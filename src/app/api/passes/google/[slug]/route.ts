import type { NextRequest } from "next/server";
import { getServices } from "@/lib/services";
import { createRateLimiter, clientIp } from "@/lib/http/rateLimit";
import { jsonError, publicError, readFields } from "@/lib/http/responses";
import { issueGooglePass, IssueRequestSchema, PlatformDisabledError } from "@/lib/passes/issue";

const limiter = createRateLimiter({ limit: 20, windowMs: 60_000 });

/**
 * Public: issue a Google Wallet pass. JSON clients get `{ url }`; plain form
 * posts are redirected straight to the "Save to Google Wallet" page.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/passes/google/[slug]">) {
  const { slug } = await ctx.params;
  if (!limiter.hit(clientIp(request.headers))) return publicError(request, slug, 429, "Too many requests, try again in a minute.");
  const { config, cards, subscribers, googleApi } = await getServices();
  const card = await cards.findBySlug(slug);
  if (!card) return jsonError(404, "Card not found");
  if (!googleApi) return publicError(request, slug, 404, "Google Wallet is not configured");

  const parsed = IssueRequestSchema.safeParse(await readFields(request));
  if (!parsed.success) return publicError(request, slug, 400, "Invalid email address");

  try {
    const url = await issueGooglePass(config, subscribers, googleApi, card, parsed.data);
    const wantsJson = (request.headers.get("accept") ?? "").includes("application/json");
    return wantsJson ? Response.json({ url }) : Response.redirect(url, 303);
  } catch (error) {
    if (error instanceof PlatformDisabledError) return publicError(request, slug, 404, error.message);
    console.error("[walletcast] google pass issue failed", error);
    return publicError(request, slug, 502, "Could not create the Google Wallet pass");
  }
}
