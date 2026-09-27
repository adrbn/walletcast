import type { NextRequest } from "next/server";
import { getServices } from "@/lib/services";
import { notConfigured, toResponse } from "@/lib/http/responses";

/** Apple: download the latest version of a pass. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/apple/v1/passes/[passTypeId]/[serialNumber]">) {
  const { appleWebService } = await getServices();
  if (!appleWebService) return notConfigured();
  const params = await ctx.params;
  return toResponse(
    await appleWebService.getPass({
      ...params,
      authorization: request.headers.get("authorization"),
      ifModifiedSince: request.headers.get("if-modified-since"),
    }),
  );
}
