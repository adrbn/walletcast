/** Port of Aura's DayHue: base hue of the glow for an hour of the day, eased between anchors. */
const ANCHORS: [hour: number, hue: number][] = [
  [0, 0.74],
  [5, 0.8],
  [7, 0.96],
  [10, 1.06],
  [14, 1.04],
  [18, 1.01],
  [20.5, 0.93],
  [23, 0.78],
  [24, 0.74],
];

export function dayHue(hour: number): number {
  const after = ANCHORS.findIndex(([h]) => h > hour);
  if (after <= 0) return ANCHORS[0][1];
  const [h0, v0] = ANCHORS[after - 1];
  const [h1, v1] = ANCHORS[after];
  const t = (hour - h0) / (h1 - h0);
  const v = v0 + (v1 - v0) * t * t * (3 - 2 * t);
  return v - Math.floor(v);
}

/** Fractional hour (0 to <24) of `date` in an IANA time zone. */
export function hourIn(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get("hour") + get("minute") / 60;
}

export const GLOW_SLOTS = 6;
const SLOT_HOURS = 24 / GLOW_SLOTS;

/** The glow only changes a few times a day, so a pass is refreshed at most GLOW_SLOTS times. */
export function glowSlot(date: Date, timeZone: string): number {
  return Math.floor(hourIn(date, timeZone) / SLOT_HOURS);
}

export function slotHue(slot: number): number {
  return dayHue(slot * SLOT_HOURS + SLOT_HOURS / 2);
}
