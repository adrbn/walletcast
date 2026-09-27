import type { NextRequest } from "next/server";
import { getServices } from "@/lib/services";
import { notConfigured, toResponse } from "@/lib/http/responses";

/** Apple: which passes changed on this device since the last check. */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/apple/v1/devices/[deviceLibraryId]/registrations/[passTypeId]">,
) {
  const { appleWebService } = await getServices();
  if (!appleWebService) return notConfigured();
  const params = await ctx.params;
  return toResponse(
    await appleWebService.listUpdated({
      ...params,
      passesUpdatedSince: request.nextUrl.searchParams.get("passesUpdatedSince"),
    }),
  );
}
