import sharp from "sharp";

/** Apple strip sizes for store cards (375×123 pt). */
export const STRIP_SIZES = [
  { file: "strip.png", width: 375, height: 123 },
  { file: "strip@2x.png", width: 750, height: 246 },
  { file: "strip@3x.png", width: 1125, height: 369 },
];

// ponytail: tuned by eye against adrbn.dev; adjust these if the Wallet render looks off.
const SATURATION = 0.58;
const BRIGHTNESS = 0.92;
/** Aura swings the side hues about forty degrees either side of the base. */
const SPREAD = 0.11;
/** Less on the warm side, so daytime gold never drifts into green. */
const WARM_SPREAD = 0.06;
/** Film grain over the glow; it fades out with the glow so the strip meets the flat card colour without a seam. */
const GRAIN_OPACITY = 0.3;
/** Grain is gone by this fraction of the strip height. */
const GRAIN_END = 0.85;

const wrap = (h: number) => h - Math.floor(h);

function hsvHex(h: number, s: number, v: number): string {
  const channel = (n: number) => {
    const k = (n + h * 6) % 6;
    return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return `#${[channel(5), channel(3), channel(1)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function gridLines(): string {
  const line = (i: number, x1: number, y1: number, x2: number, y2: number) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-opacity="${i % 5 === 0 ? 0.045 : 0.022}"/>`;
  const lines: string[] = [];
  for (let i = 1; i * 16 < 375; i++) lines.push(line(i, i * 16, 0, i * 16, 123));
  for (let i = 1; i * 16 < 123; i++) lines.push(line(i, 0, i * 16, 375, i * 16));
  return lines.join("");
}

/** Three hues glowing from the top, fading into the card background, over Aura's 16 pt grid. */
function stripSvg(hue: number, bgColor: string, scale: number): string {
  const [left, mid, right] = [wrap(hue - SPREAD), hue, wrap(hue + WARM_SPREAD)].map((h) =>
    hsvHex(h, SATURATION, BRIGHTNESS),
  );
  const glow = (id: string, cx: number, cy: number, r: number, color: string) =>
    `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${r}"><stop offset="0" stop-color="${color}" stop-opacity="0.9"/><stop offset="0.55" stop-color="${color}" stop-opacity="0.35"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${375 * scale}" height="${123 * scale}" viewBox="0 0 375 123">
  <defs>
    ${glow("a", 50, -20, 190, left)}
    ${glow("b", 200, -50, 190, mid)}
    ${glow("c", 335, -10, 180, right)}
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0.45" stop-color="${bgColor}" stop-opacity="0"/><stop offset="1" stop-color="${bgColor}"/></linearGradient>
  </defs>
  <rect width="375" height="123" fill="${bgColor}"/>
  <rect width="375" height="123" fill="url(#a)"/>
  <rect width="375" height="123" fill="url(#b)"/>
  <rect width="375" height="123" fill="url(#c)"/>
  <rect width="375" height="123" fill="url(#fade)"/>
  <g stroke="#ffffff" stroke-width="0.5">${gridLines()}</g>
</svg>`;
}

/** Grey noise for an overlay blend, seeded so the same strip renders to the same bytes. */
function grain(width: number, height: number): Buffer {
  const px = Buffer.alloc(width * height * 4);
  let seed = 7;
  for (let y = 0; y < height; y++) {
    const alpha = Math.round(255 * GRAIN_OPACITY * Math.max(0, 1 - y / (height * GRAIN_END)));
    for (let x = 0; x < width; x++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const i = (y * width + x) * 4;
      px.fill(seed >>> 24, i, i + 3);
      px[i + 3] = alpha;
    }
  }
  return px;
}

export async function renderStrips(hue: number, bgColor: string): Promise<Record<string, Buffer>> {
  const entries = await Promise.all(
    STRIP_SIZES.map(async ({ file, width, height }) => {
      const svg = Buffer.from(stripSvg(hue, bgColor, width / 375));
      const png = await sharp(svg)
        .resize(width, height)
        .composite([{ input: grain(width, height), raw: { width, height, channels: 4 }, blend: "overlay" }])
        .png()
        .toBuffer();
      return [file, png] as const;
    }),
  );
  return Object.fromEntries(entries);
}
