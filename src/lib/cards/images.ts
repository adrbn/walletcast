import sharp from "sharp";

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export class ImageUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageUploadError";
  }
}

/** Apple sizes: logo 160x50pt, icon 29x29pt. We store the @3x master. */
/** Refuse decompression bombs: small files that decode to huge bitmaps. */
const SHARP_OPTIONS = { limitInputPixels: 25_000_000 };

export const LOGO_MASTER = { width: 480, height: 150 };
export const ICON_MASTER = { width: 87, height: 87 };

async function readUpload(file: File): Promise<Buffer> {
  if (!ACCEPTED_TYPES.has(file.type)) throw new ImageUploadError("Upload a PNG, JPEG or WebP image");
  if (file.size > MAX_UPLOAD_BYTES) throw new ImageUploadError("Images must be 2 MB or less");
  return Buffer.from(await file.arrayBuffer());
}

/** Returns undefined when no file was chosen (keeps the existing image). */
export async function processLogoUpload(file: File | null): Promise<Buffer | undefined> {
  if (!file || file.size === 0) return undefined;
  const input = await readUpload(file);
  try {
    return await sharp(input, SHARP_OPTIONS)
      .resize({ ...LOGO_MASTER, fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
  } catch {
    throw new ImageUploadError("This image could not be read");
  }
}

export async function processIconUpload(file: File | null): Promise<Buffer | undefined> {
  if (!file || file.size === 0) return undefined;
  const input = await readUpload(file);
  try {
    return await sharp(input, SHARP_OPTIONS).resize({ ...ICON_MASTER, fit: "cover" }).png().toBuffer();
  } catch {
    throw new ImageUploadError("This image could not be read");
  }
}

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Fallback icon: first letter of the card name on its background color. */
export async function generateDefaultIcon(name: string, bgColor: string, fgColor: string): Promise<Buffer> {
  const letter = escapeXml((name.trim()[0] ?? "W").toUpperCase());
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="174" height="174">
    <rect width="174" height="174" rx="36" fill="${bgColor}"/>
    <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle"
      font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="96" fill="${fgColor}">${letter}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).resize(ICON_MASTER.width, ICON_MASTER.height).png().toBuffer();
}

export async function resizePng(input: Buffer, width: number, height: number, fit: "inside" | "cover"): Promise<Buffer> {
  return sharp(input, SHARP_OPTIONS).resize({ width, height, fit }).png().toBuffer();
}
