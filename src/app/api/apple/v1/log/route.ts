import { getServices } from "@/lib/services";
import { notConfigured, readJson, toResponse } from "@/lib/http/responses";

/** Apple: devices report pass errors here. */
export async function POST(request: Request) {
  const { appleWebService } = await getServices();
  if (!appleWebService) return notConfigured();
  return toResponse(await appleWebService.log(await readJson(request)));
}
