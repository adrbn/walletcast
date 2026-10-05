# Business-card options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four optional card features (share QR, latest-field label, save-contact link, day glow strip) so a WalletCast card can serve as a living business card, then deploy one instance at card.adrbn.dev.

**Architecture:** New nullable/defaulted columns on `cards`; a pure `src/lib/glow/` module (hue by hour, slot, SVG strip rendered by sharp); `buildApplePass` switches to `storeCard` + strip when `dayGlow`; a `refreshGlow()` job behind `POST /api/cron/glow` pushes silent APNs updates when the slot changes; a scheduled GitHub workflow calls it.

**Tech Stack:** Next 16, Drizzle + PGlite/Postgres, zod 4, passkit-generator, sharp, qrcode, vitest.

**Spec:** `docs/superpowers/specs/2026-10-05-business-card-design.md`

## Global Constraints

- All new options default off: a card created without them builds exactly the same pass as today (`generic`, no barcode, label "LATEST").
- No em dash, middle dot, emoji, green or monospace in any text this plan adds to passes or the public page.
- Strip sizes for `storeCard`: 375×123, 750×246, 1125×369 (`strip.png`, `strip@2x.png`, `strip@3x.png`).
- Glow slots: 6 per day (`Math.floor(hour / 4)`), hour taken in `GLOW_TIMEZONE`, default `Europe/Rome`.
- `pnpm lint`, `pnpm typecheck`, `pnpm test:coverage` (80/80/80/70 on `src/lib`) stay green after every task.
- Commit messages: conventional (`feat:`, `fix:`, `docs:`, `ci:`), no attribution lines.

---

### Task 1: Card options in schema, validation and repository

**Files:**
- Modify: `src/lib/db/schema.ts` (cards table)
- Create: `src/lib/db/migrations/0001_*.sql` (generated)
- Modify: `src/lib/cards/validation.ts`
- Modify: `src/lib/cards/repository.ts`
- Test: `src/lib/cards/cards.test.ts`

**Interfaces:**
- Produces: `Card` gains `barcode: boolean`, `latestLabel: string`, `contactUrl: string | null`, `dayGlow: boolean`, `glowSlot: number | null`. `CardInput` gains the first four. Repository gains `listDayGlow(): Promise<Card[]>` and `markGlowSlot(id: string, slot: number, at: Date): Promise<void>`.

- [ ] **Step 1: Write the failing tests** (append to `cards.test.ts`)

```ts
describe("business-card options", () => {
  it("defaults every option off", () => {
    const parsed = input();
    expect(parsed).toMatchObject({ barcode: false, dayGlow: false, latestLabel: "LATEST", contactUrl: null });
  });

  it("parses checkbox values and trims the label", () => {
    const parsed = input({ barcode: "on", dayGlow: "on", latestLabel: " NOW ", contactUrl: "https://adrbn.dev/me.vcf" });
    expect(parsed).toMatchObject({ barcode: true, dayGlow: true, latestLabel: "NOW", contactUrl: "https://adrbn.dev/me.vcf" });
  });

  it("rejects long labels and non-http contact links", () => {
    expect(CardInputSchema.safeParse({ ...input(), latestLabel: "x".repeat(13) }).success).toBe(false);
    expect(CardInputSchema.safeParse({ ...input(), contactUrl: "javascript:alert(1)" }).success).toBe(false);
  });

  it("lists day-glow cards and records the pushed slot on cards and passes", async () => {
    const db = await createTestDb();
    const repo = createCardRepository(db);
    const subs = createSubscriberRepository(db);
    const glow = await repo.create(input({ slug: "glow", dayGlow: "on" }));
    await repo.create(input({ slug: "plain" }));
    const sub = await subs.create({ cardId: glow.id, platform: "apple" });

    expect((await repo.listDayGlow()).map((c) => c.slug)).toEqual(["glow"]);

    const at = new Date("2026-10-10T08:00:00Z");
    await repo.markGlowSlot(glow.id, 2, at);
    expect((await repo.findById(glow.id))?.glowSlot).toBe(2);
    expect((await subs.findBySerial(sub.serialNumber))?.updatedAt.getTime()).toBe(at.getTime());
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm vitest run src/lib/cards/cards.test.ts`
Expected: FAIL (unknown keys stripped / `listDayGlow is not a function`).

- [ ] **Step 3: Implement**

`schema.ts`, in `cards` after `latestMessageAt` (add `boolean` to the `drizzle-orm/pg-core` import):

```ts
  barcode: boolean("barcode").notNull().default(false),
  latestLabel: text("latest_label").notNull().default("LATEST"),
  contactUrl: text("contact_url"),
  dayGlow: boolean("day_glow").notNull().default(false),
  glowSlot: integer("glow_slot"),
```

`validation.ts`, in `CardInputSchema`:

```ts
  barcode: z.stringbool().default(false),
  latestLabel: z.string().trim().min(1).max(12).default("LATEST"),
  contactUrl: optionalUrl.default(null),
  dayGlow: z.stringbool().default(false),
```

Unchecked checkboxes are absent from `FormData`, so `default(false)` covers them. An empty label field must also fall back: use `z.string().trim().transform((v) => v || "LATEST").pipe(z.string().max(12)).default("LATEST")`.

`repository.ts`, two methods in the returned object:

```ts
    async listDayGlow(): Promise<Card[]> {
      return db.select().from(cards).where(eq(cards.dayGlow, true));
    },

    /** Record the glow slot now on the passes and mark them changed so devices refetch. */
    async markGlowSlot(id: string, slot: number, at: Date): Promise<void> {
      await db.transaction(async (tx) => {
        await tx.update(cards).set({ glowSlot: slot, updatedAt: at }).where(eq(cards.id, id));
        await tx
          .update(subscribers)
          .set({ updatedAt: at })
          .where(and(eq(subscribers.cardId, id), eq(subscribers.status, "active")));
      });
    },
```

Then generate the migration: `pnpm db:generate` (creates `src/lib/db/migrations/0001_<name>.sql` and updates `meta/`).

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/lib/cards/cards.test.ts && pnpm typecheck`
Expected: PASS. If typecheck fails in `dashboard/cards/[id]/page.tsx` or `CardForm.tsx`, leave it for Task 5 only if the error is about missing optional props; otherwise fix here.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db src/lib/cards
git commit -m "feat: card options for share QR, latest label, contact link and day glow"
```

---

### Task 2: Glow module (hue by hour, slot, strip image)

**Files:**
- Create: `src/lib/glow/hue.ts`
- Create: `src/lib/glow/strip.ts`
- Test: `src/lib/glow/glow.test.ts`

**Interfaces:**
- Produces:
  - `hourIn(date: Date, timeZone: string): number` (fractional hour, 0 to <24)
  - `dayHue(hour: number): number` (0 to <1, Aura's anchors)
  - `glowSlot(date: Date, timeZone: string): number` (0..5)
  - `slotHue(slot: number): number` (hue at the middle of the slot: `dayHue(slot * 4 + 2)`)
  - `STRIP_SIZES: { file: string; width: number; height: number }[]`
  - `renderStrips(hue: number, bgColor: string): Promise<Record<string, Buffer>>` keyed by file name

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm vitest run src/lib/glow`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement**

`hue.ts`:

```ts
/** Port of Aura's DayHue: base hue of the glow for an hour of the day, eased the short way round. */
const ANCHORS: [hour: number, hue: number][] = [
  [0, 0.74], [5, 0.8], [7, 0.96], [10, 1.06], [14, 1.04], [18, 1.01], [20.5, 0.93], [23, 0.78], [24, 0.74],
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

export function hourIn(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "numeric", minute: "numeric", hourCycle: "h23" })
    .formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get("hour") + get("minute") / 60;
}

export const GLOW_SLOTS = 6;

export function glowSlot(date: Date, timeZone: string): number {
  return Math.floor(hourIn(date, timeZone) / (24 / GLOW_SLOTS));
}

export function slotHue(slot: number): number {
  return dayHue(slot * (24 / GLOW_SLOTS) + 24 / GLOW_SLOTS / 2);
}
```

`strip.ts`:

```ts
import sharp from "sharp";

export const STRIP_SIZES = [
  { file: "strip.png", width: 375, height: 123 },
  { file: "strip@2x.png", width: 750, height: 246 },
  { file: "strip@3x.png", width: 1125, height: 369 },
];

// ponytail: tuned by eye against adrbn.dev; adjust these two if the Wallet render looks off.
const SATURATION = 0.62;
const BRIGHTNESS = 0.62;
/** Aura swings each hue about forty degrees either side of the base. */
const SPREAD = 0.11;

function hsvHex(h: number, s: number, v: number): string {
  const f = (n: number) => {
    const k = (n + h * 6) % 6;
    return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return `#${[f(5), f(3), f(1)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

const wrap = (h: number) => h - Math.floor(h);

/** The glow at 375×123 pt: three hues fading into the card background, plus Aura's 16 pt grid. */
function stripSvg(hue: number, bgColor: string): string {
  const [left, mid, right] = [wrap(hue - SPREAD), hue, wrap(hue + SPREAD)].map((h) => hsvHex(h, SATURATION, BRIGHTNESS));
  const lines: string[] = [];
  for (let i = 1; i * 16 < 375; i++) lines.push(`<line x1="${i * 16}" y1="0" x2="${i * 16}" y2="123" stroke-opacity="${i % 5 === 0 ? 0.045 : 0.022}"/>`);
  for (let i = 1; i * 16 < 123; i++) lines.push(`<line x1="0" y1="${i * 16}" x2="375" y2="${i * 16}" stroke-opacity="${i % 5 === 0 ? 0.045 : 0.022}"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 375 123">
    <defs>
      <radialGradient id="a" cx="0.12" cy="0" r="0.75"><stop offset="0" stop-color="${left}"/><stop offset="1" stop-color="${left}" stop-opacity="0"/></radialGradient>
      <radialGradient id="b" cx="0.5" cy="-0.1" r="0.7"><stop offset="0" stop-color="${mid}"/><stop offset="1" stop-color="${mid}" stop-opacity="0"/></radialGradient>
      <radialGradient id="c" cx="0.9" cy="0.05" r="0.75"><stop offset="0" stop-color="${right}"/><stop offset="1" stop-color="${right}" stop-opacity="0"/></radialGradient>
      <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0.45" stop-color="${bgColor}" stop-opacity="0"/><stop offset="1" stop-color="${bgColor}"/></linearGradient>
    </defs>
    <rect width="375" height="123" fill="${bgColor}"/>
    <rect width="375" height="123" fill="url(#a)"/><rect width="375" height="123" fill="url(#b)"/><rect width="375" height="123" fill="url(#c)"/>
    <rect width="375" height="123" fill="url(#fade)"/>
    <g stroke="#ffffff" stroke-width="0.5">${lines.join("")}</g>
  </svg>`;
}

export async function renderStrips(hue: number, bgColor: string): Promise<Record<string, Buffer>> {
  const svg = Buffer.from(stripSvg(hue, bgColor));
  const entries = await Promise.all(
    STRIP_SIZES.map(async ({ file, width, height }) => [file, await sharp(svg, { density: 72 * (width / 375) }).resize(width, height).png().toBuffer()] as const),
  );
  return Object.fromEntries(entries);
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/lib/glow`
Expected: PASS. Also write `renderStrips(slotHue(s), "#0c0c0d")` for s = 0..5 to the scratchpad and look at them once.

- [ ] **Step 5: Commit**

```bash
git add src/lib/glow
git commit -m "feat: day glow hue, slots and strip rendering"
```

---

### Task 3: Apple and Google passes use the options

**Files:**
- Modify: `src/lib/apple/pass.ts`
- Modify: `src/lib/google/objects.ts`
- Modify: `src/lib/services.ts` (pass the time zone through)
- Modify: `src/lib/config/env.ts` (`GLOW_TIMEZONE`, `CRON_SECRET`)
- Test: `src/lib/apple/apple.test.ts`, `src/lib/google/google.test.ts`, `src/lib/config/env.test.ts`

**Interfaces:**
- Consumes: `glowSlot`, `slotHue` (Task 2), `renderStrips`, card fields (Task 1), `publicCardUrl(baseUrl, slug, source)` from `src/lib/cards/links.ts`.
- Produces: `BuildApplePassArgs` gains `timeZone?: string` (default `"Europe/Rome"`) and `now?: Date`. `AppConfig` gains `glowTimeZone: string` and `cronSecret?: string`. Exported `passJsonFor(args): Record<string, unknown>` is not needed; tests read `pass.json` out of the zip.

- [ ] **Step 1: Write the failing tests**

In `apple.test.ts`, add a helper next to `zipEntries` and three tests in `describe("buildApplePass")`:

```ts
import { inflateRawSync } from "node:zlib";

/** Read one entry of a .pkpass (stored or deflated). */
function zipRead(buf: Buffer, name: string): Buffer {
  let offset = 0;
  while (buf.readUInt32LE(offset) === 0x04034b50) {
    const method = buf.readUInt16LE(offset + 8);
    const size = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const start = offset + 30 + nameLen + extraLen;
    if (buf.subarray(offset + 30, offset + 30 + nameLen).toString() === name) {
      const data = buf.subarray(start, start + size);
      return method === 8 ? inflateRawSync(data) : data;
    }
    offset = start + size;
  }
  throw new Error(`${name} not in pass`);
}
```

```ts
  it("keeps plain cards generic, labelled LATEST and without barcode", async () => {
    const db = await createTestDb();
    const card = await createCardRepository(db).create(cardInput);
    const sub = await createSubscriberRepository(db).create({ cardId: card.id, platform: "apple" });
    const json = JSON.parse(zipRead(await buildApplePass({ card, subscriber: sub, apple, baseUrl: "https://wc.test" }), "pass.json").toString());
    expect(json.generic.secondaryFields[0].label).toBe("LATEST");
    expect(json.storeCard).toBeUndefined();
    expect(json.barcodes).toBeUndefined();
    expect(JSON.stringify(json)).not.toMatch(/—/);
  });

  it("adds the share QR and the custom label", async () => {
    const db = await createTestDb();
    const card = await createCardRepository(db).create(
      CardInputSchema.parse({ name: "Adrien", organizationName: "AI engineer", slug: "adrien", barcode: "on", latestLabel: "NOW" }),
    );
    const sub = await createSubscriberRepository(db).create({ cardId: card.id, platform: "apple" });
    const json = JSON.parse(zipRead(await buildApplePass({ card, subscriber: sub, apple, baseUrl: "https://wc.test" }), "pass.json").toString());
    expect(json.barcodes[0]).toMatchObject({ format: "PKBarcodeFormatQR", message: "https://wc.test/c/adrien?src=pass" });
    expect(json.generic.secondaryFields[0].label).toBe("NOW");
  });

  it("turns day-glow cards into store cards with a strip", async () => {
    const db = await createTestDb();
    const card = await createCardRepository(db).create(CardInputSchema.parse({ ...cardInput, dayGlow: "on" }));
    const sub = await createSubscriberRepository(db).create({ cardId: card.id, platform: "apple" });
    const pkpass = await buildApplePass({
      card, subscriber: sub, apple, baseUrl: "https://wc.test", timeZone: "Europe/Rome", now: new Date("2026-10-10T07:30:00Z"),
    });
    const json = JSON.parse(zipRead(pkpass, "pass.json").toString());
    expect(json.storeCard.primaryFields[0].value).toBe(card.name);
    expect(json.generic).toBeUndefined();
    expect(zipEntries(pkpass)).toEqual(expect.arrayContaining(["strip.png", "strip@2x.png", "strip@3x.png"]));
  });
```

In `google.test.ts` (follow its existing card fixture):

```ts
  it("adds the share QR to Google objects when enabled", () => {
    const patch = buildObjectPatch({ ...card, barcode: true }, "https://wc.test");
    expect(patch.barcode).toEqual({ type: "QR_CODE", value: "https://wc.test/c/" + card.slug + "?src=pass" });
    expect(buildObjectPatch({ ...card, barcode: false }, "https://wc.test").barcode).toBeUndefined();
  });
```

In `env.test.ts`:

```ts
  it("reads the glow time zone and cron secret", () => {
    expect(parseConfig({}).glowTimeZone).toBe("Europe/Rome");
    const c = parseConfig({ GLOW_TIMEZONE: "Europe/Lisbon", CRON_SECRET: "s".repeat(24) });
    expect([c.glowTimeZone, c.cronSecret]).toEqual(["Europe/Lisbon", "s".repeat(24)]);
    expect(() => parseConfig({ GLOW_TIMEZONE: "Mars/Olympus" })).toThrow();
  });
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm vitest run src/lib/apple src/lib/google src/lib/config`
Expected: FAIL on the new tests only.

- [ ] **Step 3: Implement**

`env.ts`: add to `EnvSchema`:

```ts
  GLOW_TIMEZONE: z
    .string()
    .default("Europe/Rome")
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "GLOW_TIMEZONE must be an IANA time zone like Europe/Rome"),
  CRON_SECRET: optionalString,
```

add `glowTimeZone: string; cronSecret?: string;` to `AppConfig` and `glowTimeZone: raw.GLOW_TIMEZONE, cronSecret: raw.CRON_SECRET,` to the returned object.

`pass.ts`:

```ts
import { glowSlot, slotHue } from "@/lib/glow/hue";
import { renderStrips } from "@/lib/glow/strip";
import { publicCardUrl } from "@/lib/cards/links";

export interface BuildApplePassArgs {
  card: Card;
  subscriber: Pick<Subscriber, "serialNumber" | "authToken">;
  apple: AppleConfig;
  baseUrl: string;
  timeZone?: string;
  now?: Date;
}
```

In `buildApplePass`: replace `generic: {},` by `[style]: {},` with `const style = card.dayGlow ? "storeCard" : "generic";`, add

```ts
    ...(card.barcode
      ? { barcodes: [{ format: "PKBarcodeFormatQR", message: publicCardUrl(baseUrl, card.slug, "pass"), messageEncoding: "iso-8859-1" }] }
      : {}),
```

to `passJson`, merge strips into the bundle files:

```ts
  const strips = card.dayGlow
    ? await renderStrips(slotHue(glowSlot(now ?? new Date(), timeZone ?? "Europe/Rome")), card.bgColor)
    : {};
  const pass = new PKPass(
    { "pass.json": Buffer.from(JSON.stringify(passJson)), ...(await imageBuffers(card)), ...strips },
    ...
```

use `label: card.latestLabel` in the secondary field, and change the powered-by value to `"WalletCast, open-source wallet notifications"`.

`objects.ts`, in `buildObjectPatch` return:

```ts
    ...(card.barcode ? { barcode: { type: "QR_CODE", value: publicCardUrl(baseUrl, card.slug, "pass") } } : {}),
```

(import `publicCardUrl` from `@/lib/cards/links`).

`services.ts`: `buildPass: (card, subscriber) => buildApplePass({ card, subscriber, apple, baseUrl: config.baseUrl, timeZone: config.glowTimeZone })`. Do the same in `src/app/api/passes/apple/[slug]/route.ts` if it calls `buildApplePass` directly (grep for `buildApplePass(`).

- [ ] **Step 4: Run tests**

Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib src/app/api
git commit -m "feat: share QR, latest label and day-glow strip on passes"
```

---

### Task 4: Silent glow refresh job and cron route

**Files:**
- Create: `src/lib/glow/refresh.ts`
- Create: `src/app/api/cron/glow/route.ts`
- Test: `src/lib/glow/glow.test.ts` (append)

**Interfaces:**
- Consumes: `cards.listDayGlow`, `cards.markGlowSlot` (Task 1), `glowSlot` (Task 2), `subscribers.applePushTokensForCard`, `subscribers.removeApplePushTokens`, `ApnsSender.sendPassUpdates(tokens)` returning `{ sent, failed, invalidTokens, errors }`.
- Produces: `refreshGlow(deps: RefreshGlowDeps): Promise<{ cards: number; pushed: number }>` with `RefreshGlowDeps = { cards: CardRepository; subscribers: SubscriberRepository; apns: ApnsSender | null; timeZone: string; now?: () => Date }`; `isCronAuthorized(header: string | null, secret: string | undefined): boolean`.

- [ ] **Step 1: Write the failing tests**

```ts
import { createTestDb } from "@/lib/testing/db";
import { createCardRepository } from "@/lib/cards/repository";
import { createSubscriberRepository } from "@/lib/subscribers/repository";
import { CardInputSchema } from "@/lib/cards/validation";
import type { ApnsSender } from "@/lib/apple/apns";
import { isCronAuthorized, refreshGlow } from "./refresh";

describe("refreshGlow", () => {
  async function setup() {
    const db = await createTestDb();
    const cards = createCardRepository(db);
    const subscribers = createSubscriberRepository(db);
    const card = await cards.create(CardInputSchema.parse({ name: "A", organizationName: "B", slug: "a", dayGlow: "on" }));
    await cards.create(CardInputSchema.parse({ name: "P", organizationName: "B", slug: "p" }));
    const sub = await subscribers.create({ cardId: card.id, platform: "apple" });
    await subscribers.registerAppleDevice({ deviceLibraryId: "d1", pushToken: "a".repeat(64), serialNumber: sub.serialNumber, passTypeId: "pass.test" });
    const pushed: string[][] = [];
    const apns = { sendPassUpdates: async (t: string[]) => (pushed.push(t), { sent: t.length, failed: 0, invalidTokens: [], errors: [] }) } as unknown as ApnsSender;
    return { cards, subscribers, apns, pushed, card };
  }

  it("pushes once per slot change and only for day-glow cards", async () => {
    const s = await setup();
    const at = (iso: string) => () => new Date(iso);
    const deps = { cards: s.cards, subscribers: s.subscribers, apns: s.apns, timeZone: "Europe/Rome" };

    expect(await refreshGlow({ ...deps, now: at("2026-10-10T07:30:00Z") })).toEqual({ cards: 1, pushed: 1 });
    expect(await refreshGlow({ ...deps, now: at("2026-10-10T08:30:00Z") })).toEqual({ cards: 0, pushed: 0 });
    expect(await refreshGlow({ ...deps, now: at("2026-10-10T10:30:00Z") })).toEqual({ cards: 1, pushed: 1 });
    expect(s.pushed).toEqual([["a".repeat(64)], ["a".repeat(64)]]);
    expect((await s.cards.findById(s.card.id))?.glowSlot).toBe(3);
  });

  it("does nothing without APNs", async () => {
    const s = await setup();
    expect(await refreshGlow({ cards: s.cards, subscribers: s.subscribers, apns: null, timeZone: "Europe/Rome" })).toEqual({ cards: 0, pushed: 0 });
  });

  it("checks the bearer secret", () => {
    expect(isCronAuthorized("Bearer s3cret-s3cret-s3cret", "s3cret-s3cret-s3cret")).toBe(true);
    expect(isCronAuthorized("Bearer nope", "s3cret-s3cret-s3cret")).toBe(false);
    expect(isCronAuthorized(null, "s3cret-s3cret-s3cret")).toBe(false);
    expect(isCronAuthorized("Bearer x", undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm vitest run src/lib/glow`
Expected: FAIL (`./refresh` missing).

- [ ] **Step 3: Implement**

`refresh.ts`:

```ts
import type { CardRepository } from "@/lib/cards/repository";
import type { SubscriberRepository } from "@/lib/subscribers/repository";
import type { ApnsSender } from "@/lib/apple/apns";
import { safeEqual } from "@/lib/apple/webservice";
import { glowSlot } from "./hue";

export interface RefreshGlowDeps {
  cards: CardRepository;
  subscribers: SubscriberRepository;
  apns: ApnsSender | null;
  timeZone: string;
  now?: () => Date;
}

/**
 * Move day-glow passes to the current slot. Only the strip changes, and no field with a
 * changeMessage does, so Wallet refetches the pass without showing a notification.
 */
export async function refreshGlow(deps: RefreshGlowDeps): Promise<{ cards: number; pushed: number }> {
  if (!deps.apns) return { cards: 0, pushed: 0 };
  const now = deps.now?.() ?? new Date();
  const slot = glowSlot(now, deps.timeZone);
  let cards = 0;
  let pushed = 0;
  for (const card of await deps.cards.listDayGlow()) {
    if (card.glowSlot === slot) continue;
    await deps.cards.markGlowSlot(card.id, slot, now);
    const tokens = await deps.subscribers.applePushTokensForCard(card.id);
    const result = await deps.apns.sendPassUpdates(tokens);
    await deps.subscribers.removeApplePushTokens(result.invalidTokens);
    cards += 1;
    pushed += result.sent;
  }
  return { cards, pushed };
}

export function isCronAuthorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header?.startsWith("Bearer ")) return false;
  return safeEqual(header.slice("Bearer ".length), secret);
}
```

`src/app/api/cron/glow/route.ts`:

```ts
import { getServices } from "@/lib/services";
import { isCronAuthorized, refreshGlow } from "@/lib/glow/refresh";

/** Called hourly by .github/workflows/glow.yml: `Authorization: Bearer $CRON_SECRET`. */
export async function POST(request: Request) {
  const { config, cards, subscribers, apns } = await getServices();
  if (!config.cronSecret) return new Response("Not found", { status: 404 });
  if (!isCronAuthorized(request.headers.get("authorization"), config.cronSecret)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await refreshGlow({ cards, subscribers, apns, timeZone: config.glowTimeZone });
  return Response.json(result);
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test:coverage && pnpm typecheck && pnpm lint`
Expected: PASS, thresholds met.

- [ ] **Step 5: Commit**

```bash
git add src/lib/glow src/app/api/cron
git commit -m "feat: silent hourly glow refresh behind a cron route"
```

---

### Task 5: Dashboard form, preview and public page

**Files:**
- Modify: `src/components/CardForm.tsx`
- Modify: `src/components/PassPreview.tsx`
- Modify: `src/app/dashboard/cards/[id]/page.tsx` (initial values)
- Modify: `src/app/c/[slug]/page.tsx`

**Interfaces:**
- Consumes: card fields (Task 1), `slotHue`, `glowSlot` (Task 2), `config.glowTimeZone` (Task 3).
- Produces: `PassPreviewProps` gains `latestLabel?: string`, `glowHue?: number | null`, `barcode?: boolean`.

No unit tests (components are outside the coverage scope); verified in the browser in Step 4.

- [ ] **Step 1: Form fields**

In `CardFormValues` add `latestLabel: string; contactUrl: string; barcode: boolean; dayGlow: boolean;`, defaults `latestLabel: "LATEST", contactUrl: "", barcode: false, dayGlow: false`. Add after the Website field:

```tsx
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">Label of the latest message</span>
            <input name="latestLabel" className="input" maxLength={12} value={values.latestLabel} onChange={set("latestLabel")} />
            {err("latestLabel")}
          </label>
          <label className="block">
            <span className="field-label">Contact file (vCard link)</span>
            <input name="contactUrl" type="url" className="input" placeholder="https://" value={values.contactUrl} onChange={set("contactUrl")} />
            <p className="field-hint">Shows a Save contact button on the public page.</p>
            {err("contactUrl")}
          </label>
        </div>

        <div className="space-y-2">
          {([
            ["barcode", "Share QR on the card", "Anyone holding the card can show it to pass it on."],
            ["dayGlow", "Glow that follows the hour", "A colour strip that shifts from violet at night to amber by day, updated silently."],
          ] as const).map(([key, label, hint]) => (
            <label key={key} className="flex items-start gap-3 text-sm">
              <input type="checkbox" name={key} checked={values[key]} onChange={(e) => setValues((p) => ({ ...p, [key]: e.target.checked }))} className="mt-1" />
              <span><span className="font-medium">{label}</span><br /><span className="text-muted">{hint}</span></span>
            </label>
          ))}
        </div>
```

`set` is typed for string fields: narrow its key type to `Exclude<keyof CardFormValues, "barcode" | "dayGlow">`. Pass to the preview: `latestLabel={values.latestLabel} barcode={values.barcode} glowHue={values.dayGlow ? previewHue : null}` with `previewHue` a new prop of `CardForm` (`glowHue: number`) computed on the server page as `slotHue(glowSlot(new Date(), config.glowTimeZone))`. In `dashboard/cards/[id]/page.tsx` add the four fields to `initial` (`contactUrl: card.contactUrl ?? ""`) and `glowHue`; in `new/page.tsx` pass `glowHue` too.

- [ ] **Step 2: Preview**

In `PassPreview`: replace the hardcoded `Latest` with `{props.latestLabel || "Latest"}`. When `glowHue != null`, wrap the name block in a 123/375-ratio strip:

```tsx
      {props.glowHue != null ? (
        <div className="-mx-5 mt-4 flex aspect-[375/123] flex-col justify-end px-5 pb-2" style={{ background: glowCss(props.glowHue, props.bgColor) }}>
          <div className="text-2xl font-semibold">{props.name || "Card name"}</div>
        </div>
      ) : (
        <div className="mt-8 text-2xl font-semibold">{props.name || "Card name"}</div>
      )}
```

with, in the same file:

```ts
const hsl = (h: number) => `hsl(${Math.round(((h % 1) + 1) % 1 * 360)} 62% 48%)`;
function glowCss(hue: number, bg: string): string {
  return `linear-gradient(to bottom, transparent 45%, ${bg}), radial-gradient(75% 120% at 12% 0%, ${hsl(hue - 0.11)}, transparent), radial-gradient(70% 120% at 50% -10%, ${hsl(hue)}, transparent), radial-gradient(75% 120% at 90% 5%, ${hsl(hue + 0.11)}, transparent), ${bg}`;
}
```

When `barcode`, add under the message: `<div className="mx-auto mt-6 h-24 w-24 rounded-md bg-white/90" aria-label="QR code" />`.

- [ ] **Step 3: Public page**

In `src/app/c/[slug]/page.tsx`:
- `generateMetadata`: title `card.name`, description `` `Add ${card.name} to your wallet.` ``.
- Heading: `Add {card.name} to your wallet` (replaces "Get …'s news on your lock screen").
- Pass `latestLabel`, `barcode`, `glowHue={card.dayGlow ? slotHue(glowSlot(new Date(), config.glowTimeZone)) : null}` to `PassPreview`.
- Only show wallet buttons that match the visitor: compute `const isApple = /ios|mac os/i.test(os);` and drop the Apple button on Android, the Google button on iOS. When no button is left, render the fallback instead of "This card is not available yet":

```tsx
          <div className="space-y-3">
            {card.contactUrl && <a href={card.contactUrl} className="btn-primary block w-full py-3 text-center text-base">Save contact</a>}
            {card.websiteUrl && <a href={card.websiteUrl} className="btn-secondary block w-full py-3 text-center text-base">{new URL(card.websiteUrl).host}</a>}
            {!card.contactUrl && !card.websiteUrl && <p className="panel text-center text-sm text-muted">This card is not available yet.</p>}
          </div>
```

  When buttons exist and `card.contactUrl` is set, also show a small `Save contact` text link under the form.

- [ ] **Step 4: Verify in the browser**

Run the dev server (`.claude/launch.json` entry `walletcast`, `pnpm dev`, port 3000), log in, create a card with the four options on, check: preview strip and label, public page `/c/<slug>` with an iPhone user agent (Apple button) and an Android user agent via `resize_window` mobile preset (Save contact + website). Download the `.pkpass` from the public page and confirm `strip@3x.png` and `barcodes` in `pass.json`.

- [ ] **Step 5: Commit**

```bash
git add src/components src/app
git commit -m "feat: dashboard and public page support for business-card options"
```

---

### Task 6: Scheduled workflow and docs

**Files:**
- Create: `.github/workflows/glow.yml`
- Modify: `.env.example`, `docs/deploy.md`, `README.md` (one short section)

- [ ] **Step 1: Workflow**

```yaml
name: Glow refresh
on:
  schedule:
    - cron: "7 * * * *"
  workflow_dispatch:

jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - name: Call the glow route
        env:
          URL: ${{ secrets.GLOW_CRON_URL }}
          SECRET: ${{ secrets.CRON_SECRET }}
        run: |
          if [ -z "$URL" ] || [ -z "$SECRET" ]; then echo "GLOW_CRON_URL or CRON_SECRET not set, skipping"; exit 0; fi
          curl -fsS -X POST -H "Authorization: Bearer $SECRET" "$URL"
```

- [ ] **Step 2: Docs**

`.env.example`, new block:

```
# ── Day glow (optional) ──────────────────────────────────────
# Time zone whose hour drives the glow colour on day-glow cards.
GLOW_TIMEZONE=Europe/Rome
# Protects POST /api/cron/glow. Generate: openssl rand -base64 32
CRON_SECRET=
```

`docs/deploy.md`: a "Day glow" paragraph: set `CRON_SECRET`, then in the GitHub repo secrets set `GLOW_CRON_URL=https://<host>/api/cron/glow` and the same `CRON_SECRET`; the workflow runs hourly and only pushes when the 4-hour slot changes. README: one row in the features table, "Card that changes colour", one sentence.

- [ ] **Step 3: Full check and commit**

Run: `pnpm lint && pnpm typecheck && pnpm test:coverage && pnpm build`
Expected: all PASS.

```bash
git add .github/workflows/glow.yml .env.example docs/deploy.md README.md
git commit -m "ci: hourly glow refresh workflow and docs"
```

---

### Task 7: Deploy card.adrbn.dev and make Adrien's card

Ops task, no TDD. Verify each step before the next.

- [ ] **Step 1:** Push `main` (CI must pass: `gh run watch`).
- [ ] **Step 2:** `vercel link` a new project `walletcast-card` in scope `adrien-robinos-projects`; add Neon Postgres (`vercel integration add neon`; if it asks for terms in the browser, ask Adrien to click once). Confirm `DATABASE_URL` exists in production env.
- [ ] **Step 3:** Set production env from `.env.local` values: Apple vars (base64 of the PEM files), `ADMIN_PASSWORD` (new random, stored in the macOS keychain item "walletcast card admin", told to Adrien), `SESSION_SECRET` (`openssl rand -base64 48`), `CRON_SECRET` (`openssl rand -base64 32`), `BASE_URL=https://card.adrbn.dev`, `GLOW_TIMEZONE=Europe/Rome`. Deploy with `vercel deploy --prod`.
- [ ] **Step 4:** Domain: `vercel domains add card.adrbn.dev walletcast-card`, then CNAME `card` → `cname.vercel-dns.com` at Porkbun (Claude in Chrome, Brave; run `window.confirm = () => true` before any trash click). Wait until `curl -sI https://card.adrbn.dev/login` returns 200.
- [ ] **Step 5:** GitHub secrets on adrbn/walletcast: `GLOW_CRON_URL=https://card.adrbn.dev/api/cron/glow`, `CRON_SECRET`. Run the workflow once with `gh workflow run glow.yml` and check the run log prints a JSON result.
- [ ] **Step 6:** vCard in the private portfolio repo `public/adrien-robino.vcf` (FN Adrien Robino, TITLE AI engineer, EMAIL adrien.robino@outlook.com, URL https://adrbn.dev, URL github.com/adrbn; no phone). Push, check `https://adrbn.dev/adrien-robino.vcf` serves it (add `text/vcard` header in `vercel.json` if served as octet-stream).
- [ ] **Step 7:** Create the card in the dashboard: name "Adrien Robino", organization "AI engineer", slug `adrien`, colours bg `#0c0c0d` / text `#f4f2ee` / labels `#8d8a84`, latest label "NOW", welcome text "Minute tourne en live sur mon ordi, viens voir", description with the three links on separate lines, website https://adrbn.dev, contact URL the vcf, barcode on, day glow on, icon and logo from the `</>` mark rendered on the glow (generate with sharp from the strip renderer, square icon 87×87 and wide logo 480×150).
- [ ] **Step 8:** Real device: Adrien opens `https://card.adrbn.dev/c/adrien` on his iPhone, adds the card; broadcast a test message (notification shows); force a slot change by calling the route after editing `glow_slot` to a wrong value (strip changes, no notification). Send him a screenshot request, not a guess.
