import type { WsResponse } from "@/lib/apple/webservice";

export function toResponse(ws: WsResponse): Response {
  const body: BodyInit | null = typeof ws.body === "string" ? ws.body : ws.body ? new Uint8Array(ws.body) : null;
  return new Response(body, { status: ws.status, headers: ws.headers });
}

/** Parse a JSON body without throwing on garbage. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/** Accept JSON or form posts from the public page. */
export async function readFields(request: Request): Promise<Record<string, string>> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const data = await readJson(request);
    if (!data || typeof data !== "object") return {};
    return Object.fromEntries(
      Object.entries(data).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );
  }
  try {
    const form = await request.formData();
    return Object.fromEntries(
      [...form.entries()].filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );
  } catch {
    return {};
  }
}

export const jsonError = (status: number, error: string) => Response.json({ error }, { status });

export const notConfigured = () => new Response("Apple Wallet is not configured", { status: 404 });

/**
 * Error for the public "add to wallet" endpoints: JSON for API clients,
 * a redirect back to the card page for plain HTML form posts.
 */
export function publicError(request: Request, slug: string, status: number, error: string): Response {
  if ((request.headers.get("accept") ?? "").includes("application/json")) return jsonError(status, error);
  const back = new URL(`/c/${encodeURIComponent(slug)}`, request.url);
  back.searchParams.set("error", String(status));
  return Response.redirect(back, 303);
}
