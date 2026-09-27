import { describe, expect, it } from "vitest";
import type { Subscriber } from "@/lib/db/schema";
import { csvCell, subscribersToCsv } from "./csv";

describe("subscribers csv", () => {
  it("escapes cells and neutralises formulas", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("=HYPERLINK()")).toBe("'=HYPERLINK()");
    expect(csvCell(null)).toBe("");
  });

  it("renders rows", () => {
    const csv = subscribersToCsv([
      { createdAt: new Date("2026-01-01T00:00:00Z"), platform: "apple", status: "active", email: "a@b.co", source: null } as Subscriber,
    ]);
    expect(csv).toBe("added_at,platform,status,email,placement\r\n2026-01-01T00:00:00.000Z,apple,active,a@b.co,\r\n");
  });
});
