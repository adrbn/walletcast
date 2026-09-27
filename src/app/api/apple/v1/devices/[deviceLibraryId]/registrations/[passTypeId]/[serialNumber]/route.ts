import type { NextRequest } from "next/server";
import { getServices } from "@/lib/services";
import { notConfigured, readJson, toResponse } from "@/lib/http/responses";

type Ctx = RouteContext<"/api/apple/v1/devices/[deviceLibraryId]/registrations/[passTypeId]/[serialNumber]">;

/** Apple: a device registers for updates of a pass. */
export async function POST(request: NextRequest, ctx: Ctx) {
  const { appleWebService } = await getServices();
  if (!appleWebService) return notConfigured();
  const params = await ctx.params;
  return toResponse(
    await appleWebService.register({
      ...params,
      authorization: request.headers.get("authorization"),
      body: await readJson(request),
    }),
  );
}

/** Apple: the pass was removed from the device. */
export async function DELETE(request: NextRequest, ctx: Ctx) {
  const { appleWebService } = await getServices();
  if (!appleWebService) return notConfigured();
  const params = await ctx.params;
  return toResponse(
    await appleWebService.unregister({ ...params, authorization: request.headers.get("authorization") }),
  );
}
