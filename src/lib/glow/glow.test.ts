import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { dayHue, glowSlot, hourIn, slotHue } from "./hue";
import { renderStrips, STRIP_SIZES } from "./strip";

describe("day hue", () => {
  it("hits Aura's anchors", () => {
    expect(dayHue(0)).toBeCloseTo(0.74, 5);
    expect(dayHue(7)).toBeCloseTo(0.96, 5);
    expect(dayHue(10)).toBeCloseTo(0.06, 5);
    expect(dayHue(18)).toBeCloseTo(0.01, 5);
  });

  it("eases between anchors and stays in [0, 1)", () => {
    for (let h = 0; h < 24; h += 0.25) {
      const v = dayHue(h);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(dayHue(6)).toBeCloseTo(0.88, 2);
  });

  it("reads the hour in a time zone and buckets it in 4-hour slots", () => {
    const d = new Date("2026-10-10T07:30:00Z"); // 09:30 in Rome (CEST)
    expect(hourIn(d, "Europe/Rome")).toBeCloseTo(9.5, 5);
    expect(glowSlot(d, "Europe/Rome")).toBe(2);
    expect(glowSlot(new Date("2026-10-10T21:59:00Z"), "Europe/Rome")).toBe(5);
    expect(glowSlot(new Date("2026-10-10T22:00:00Z"), "Europe/Rome")).toBe(0);
    expect(slotHue(2)).toBeCloseTo(dayHue(10), 10);
  });
});

describe("strip", () => {
  it("renders the three storeCard strip sizes", async () => {
    const files = await renderStrips(0.96, "#0c0c0d");
    for (const { file, width, height } of STRIP_SIZES) {
      const meta = await sharp(files[file]).metadata();
      expect([meta.width, meta.height]).toEqual([width, height]);
    }
  });
});
