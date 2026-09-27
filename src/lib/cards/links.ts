import QRCode from "qrcode";

/** Public landing page where people add the card to their wallet. */
export function publicCardUrl(baseUrl: string, slug: string, source?: string | null): string {
  const url = new URL(`/c/${encodeURIComponent(slug)}`, baseUrl);
  if (source) url.searchParams.set("src", source);
  return url.toString();
}

export const SOURCE_PATTERN = /^[\w-]{1,40}$/;

export function normaliseSource(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return SOURCE_PATTERN.test(trimmed) ? trimmed : null;
}

export async function qrPng(text: string, size = 600): Promise<Buffer> {
  return QRCode.toBuffer(text, { type: "png", width: size, margin: 2, errorCorrectionLevel: "M" });
}

export async function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", margin: 2, errorCorrectionLevel: "M" });
}
