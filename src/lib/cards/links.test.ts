import { describe, expect, it } from "vitest";
import { normaliseSource, publicCardUrl, qrPng, qrSvg } from "./links";

describe("card links", () => {
  it("builds the public url with an optional source tag", () => {
    expect(publicCardUrl("https://wc.test", "lu")).toBe("https://wc.test/c/lu");
    expect(publicCardUrl("https://wc.test", "lu", "window")).toBe("https://wc.test/c/lu?src=window");
  });

  it("normalises sources", () => {
    expect(normaliseSource(" flyer-1 ")).toBe("flyer-1");
    expect(normaliseSource("<script>")).toBeNull();
    expect(normaliseSource(undefined)).toBeNull();
  });

  it("renders QR codes", async () => {
    expect((await qrPng("https://wc.test/c/lu")).subarray(1, 4).toString()).toBe("PNG");
    expect(await qrSvg("https://wc.test/c/lu")).toContain("<svg");
  });
});
