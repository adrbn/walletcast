// WalletCast promo v4: spring-driven, camera-framed app trailer.
// Motion follows Apple's spring model (damping ratio + response) and strong ease-out for fades.
import { createRequire } from "node:module";
import { mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";

const require = createRequire(new URL("../../package.json", import.meta.url));
const sharp = require("sharp");

const W = 1080, H = 1350, FPS = 60, DURATION = 18;
const HERE = new URL("./", import.meta.url).pathname;
const OUT_DIR = `${tmpdir()}/walletcast-frames-4x5/`;
const ONLY = process.argv[2] ? Number(process.argv[2]) : null;
const FONT = "'SF Pro Display', 'SF Pro', 'SF Pro Text', -apple-system, Helvetica, Arial, sans-serif";
const MARGIN = 64;

// ---------- motion primitives ----------
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const prog = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, p) => a + (b - a) * p;

/** Apple-style spring step response (0 → 1, may overshoot). */
function spring(elapsed, { damping = 1, response = 0.5 } = {}) {
  if (elapsed <= 0) return 0;
  const w = (2 * Math.PI) / response;
  if (damping >= 1) return 1 - Math.exp(-w * elapsed) * (1 + w * elapsed);
  const wd = w * Math.sqrt(1 - damping * damping);
  return 1 - Math.exp(-damping * w * elapsed) * (Math.cos(wd * elapsed) + ((damping * w) / wd) * Math.sin(wd * elapsed));
}

/** cubic-bezier(x1,y1,x2,y2) evaluated at p. */
function bezier(x1, y1, x2, y2) {
  const f = (a, b, t) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  return (p) => {
    let lo = 0, hi = 1, t = p;
    for (let i = 0; i < 30; i++) {
      t = (lo + hi) / 2;
      if (f(x1, x2, t) < p) lo = t; else hi = t;
    }
    return f(y1, y2, t);
  };
}
const easeOut = bezier(0.23, 1, 0.32, 1);          // strong ease-out (enter/exit)
const easeInOut = bezier(0.77, 0, 0.175, 1);       // strong ease-in-out (on-screen moves)

const SPRING_MOVE = { damping: 0.86, response: 0.95 };  // camera / device moves
const SPRING_BOUNCE = { damping: 0.72, response: 0.55 }; // notifications, sheet
const SPRING_TEXT = { damping: 1, response: 0.5 };       // text slides, no overshoot

/** Keyframed value driven by springs: [[time, value], ...]. */
function springTrack(keys, t, cfg = SPRING_MOVE) {
  let v = keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [ti, vi] = keys[i];
    if (t < ti) break;
    const from = v;
    v = from + (vi - from) * spring(t - ti, cfg);
    // assume settled before the next key starts (keys are spaced > 0.8s)
    if (i < keys.length - 1 && t >= keys[i + 1][0]) v = vi;
  }
  return v;
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const text = (x, y, str, { size = 16, weight = 400, fill = "#000", anchor = "start", opacity = 1, spacing = null } = {}) => {
  // size-specific tracking: tighter as type grows (≈ -0.02em at display sizes)
  const ls = spacing ?? (size >= 40 ? -0.022 * size : size >= 20 ? -0.01 * size : 0);
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" fill-opacity="${opacity}" text-anchor="${anchor}" letter-spacing="${ls.toFixed(2)}">${esc(str)}</text>`;
};

async function measure(label, size, weight) {
  const ls = size >= 40 ? -0.022 * size : size >= 20 ? -0.01 * size : 0;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="${size * 2}" font-family="${FONT}"><text x="10" y="${size * 1.4}" font-size="${size}" font-weight="${weight}" letter-spacing="${ls}" fill="#000">${esc(label)}</text></svg>`;
  const { info } = await sharp(Buffer.from(svg)).flatten({ background: "#fff" }).trim().toBuffer({ resolveWithObject: true });
  return info.width;
}

// ---------- phone (drawn at a fixed base; the camera moves it) ----------
const PHONE = { x: 300, y: 236, w: 480, h: 1040, r: 78, bezel: 12 };
const S = { x: PHONE.x + PHONE.bezel, y: PHONE.y + PHONE.bezel, w: PHONE.w - 2 * PHONE.bezel, h: PHONE.h - 2 * PHONE.bezel, r: 66 };
const BUTTON = { x: S.x + 24, y: S.y + 470, w: S.w - 48, h: 58 };

// Story beats (seconds)
const T = {
  introOut: 2.1, phoneIn: 2.3,
  cap1In: 2.6, zoomButton: 4.4, tap1: 5.0,
  sheetUp: 5.45, cap2In: 5.9, tap2: 7.15, sleep: 7.55, wake: 8.2,
  cap3In: 8.35, zoomNotif: 10.0, n1: 10.45, n2: 11.95,
  phoneOut: 13.4, outroIn: 13.8, end: 18,
};

function wifi(cx, by, c) {
  const arc = (r) => {
    const dx = r * Math.SQRT1_2;
    return `<path d="M${cx - dx} ${by - dx} A${r} ${r} 0 0 1 ${cx + dx} ${by - dx}" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round"/>`;
  };
  return `<circle cx="${cx}" cy="${by - 1.5}" r="1.8" fill="${c}"/>${arc(6.5)}${arc(11.5)}`;
}

function statusBar(dark) {
  const c = dark ? "#FFFFFF" : "#000000";
  return `<rect x="${S.x + S.w / 2 - 62}" y="${S.y + 14}" width="124" height="36" rx="18" fill="#000"/>
    ${text(S.x + 52, S.y + 42, "9:41", { size: 17, weight: 600, fill: c, anchor: "middle", spacing: 0 })}
    <g fill="${c}">
      <rect x="${S.x + S.w - 116}" y="${S.y + 34}" width="4" height="7" rx="1"/>
      <rect x="${S.x + S.w - 110}" y="${S.y + 31}" width="4" height="10" rx="1"/>
      <rect x="${S.x + S.w - 104}" y="${S.y + 28}" width="4" height="13" rx="1"/>
      ${wifi(S.x + S.w - 82, S.y + 41, c)}
      <rect x="${S.x + S.w - 64}" y="${S.y + 29}" width="26" height="13" rx="4" fill="none" stroke="${c}" stroke-opacity="0.45" stroke-width="1.5"/>
      <rect x="${S.x + S.w - 61.5}" y="${S.y + 31.5}" width="19" height="8" rx="2"/>
    </g>`;
}

function passCard(x, y, w, h, latest) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="#111827"/>
    ${text(x + 24, y + 40, "Lu's Café", { size: 15, weight: 600, fill: "#FFFFFF", spacing: 0 })}
    ${text(x + 24, y + 88, "Coffee Club", { size: 28, weight: 700, fill: "#FFFFFF" })}
    ${text(x + 24, y + h - 60, "LATEST", { size: 11, weight: 600, fill: "#9CA3AF", spacing: 1 })}
    ${text(x + 24, y + h - 34, latest, { size: 15, fill: "#FFFFFF", spacing: 0 })}`;
}

function pressAmount(t, at) {
  // highlight instantly on press, release with ease-out
  if (t < at) return 0;
  return t < at + 0.12 ? 1 : 1 - easeOut(prog(t, at + 0.12, at + 0.4));
}

function safariScreen(t) {
  const b = BUTTON;
  const press = pressAmount(t, T.tap1);
  const s = 1 - 0.03 * press; // button scale on press
  const bcx = b.x + b.w / 2, bcy = b.y + b.h / 2;
  return `<rect x="${S.x}" y="${S.y}" width="${S.w}" height="${S.h}" fill="#F2F2F7"/>
    ${statusBar(false)}
    ${passCard(S.x + 24, S.y + 78, S.w - 48, 196, "Thanks for adding our card!")}
    ${text(S.x + 24, S.y + 340, "Get Lu's Café news", { size: 29, weight: 700 })}
    ${text(S.x + 24, S.y + 376, "on your lock screen", { size: 29, weight: 700 })}
    ${text(S.x + 24, S.y + 414, "No app, no account. Remove the", { size: 16, fill: "#6E6E73", spacing: 0 })}
    ${text(S.x + 24, S.y + 437, "card anytime to stop.", { size: 16, fill: "#6E6E73", spacing: 0 })}
    <g transform="translate(${bcx} ${bcy}) scale(${s}) translate(${-bcx} ${-bcy})">
      <rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="14" fill="#000"/>
      <rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="14" fill="#FFF" fill-opacity="${0.22 * press}"/>
      <g transform="translate(${bcx - 104} ${b.y + 17})">
        <rect width="30" height="24" rx="5" fill="#FFFFFF"/>
        <rect y="5" width="30" height="4" fill="#34C759"/><rect y="10" width="30" height="4" fill="#FFCC00"/><rect y="15" width="30" height="4" fill="#FF3B30"/>
      </g>
      ${text(bcx + 18, b.y + 36, "Add to Apple Wallet", { size: 18, weight: 600, fill: "#FFFFFF", anchor: "middle", spacing: 0 })}
    </g>
    ${text(S.x + S.w / 2, S.y + 574, "Powered by WalletCast", { size: 13, fill: "#8E8E93", anchor: "middle", spacing: 0 })}
    <rect x="${S.x}" y="${S.y + S.h - 104}" width="${S.w}" height="104" fill="#F9F9F9"/>
    <rect x="${S.x + 20}" y="${S.y + S.h - 92}" width="${S.w - 40}" height="44" rx="12" fill="#E3E3E8"/>
    ${text(S.x + S.w / 2, S.y + S.h - 64, "lucafe.com/c/coffee", { size: 15, fill: "#1C1C1E", anchor: "middle", spacing: 0 })}
    <rect x="${S.x + S.w / 2 - 70}" y="${S.y + S.h - 14}" width="140" height="5" rx="2.5" fill="#000"/>`;
}

function walletSheet(t) {
  const up = spring(t - T.sheetUp, { damping: 0.85, response: 0.5 });
  if (up <= 0) return "";
  const y = S.y + lerp(S.h, 60, up);
  const press = pressAmount(t, T.tap2);
  return `<rect x="${S.x}" y="${S.y}" width="${S.w}" height="${S.h}" fill="#000" fill-opacity="${0.22 * easeOut(prog(t, T.sheetUp, T.sheetUp + 0.6))}"/>
    <rect x="${S.x}" y="${y}" width="${S.w}" height="${S.h + 80}" rx="28" fill="#F2F2F7"/>
    <rect x="${S.x + S.w / 2 - 20}" y="${y + 8}" width="40" height="5" rx="2.5" fill="#C7C7CC"/>
    ${text(S.x + 24, y + 48, "Cancel", { size: 17, fill: "#007AFF", spacing: 0 })}
    ${text(S.x + S.w - 24, y + 48, "Add", { size: 17, weight: 600, fill: "#007AFF", anchor: "end", opacity: 1 - press * 0.6, spacing: 0 })}
    ${passCard(S.x + 40, y + 96, S.w - 80, 260, "Thanks for adding our card!")}
    ${text(S.x + S.w / 2, y + 400, "Lu's Café would like to add", { size: 15, fill: "#6E6E73", anchor: "middle", spacing: 0 })}
    ${text(S.x + S.w / 2, y + 421, "this card to Apple Wallet.", { size: 15, fill: "#6E6E73", anchor: "middle", spacing: 0 })}`;
}

function notification(y, l1, l2, opacity, scale) {
  const x = S.x + 14, w = S.w - 28, cx = x + w / 2, cy = y + 48;
  return `<g opacity="${opacity}" transform="translate(${cx} ${cy}) scale(${scale}) translate(${-cx} ${-cy})">
    <rect x="${x}" y="${y}" width="${w}" height="96" rx="24" fill="#FFFFFF" fill-opacity="0.86"/>
    <rect x="${x + 14}" y="${y + 16}" width="40" height="40" rx="10" fill="#111827"/>
    ${text(x + 34, y + 43, "L", { size: 19, weight: 700, fill: "#FFFFFF", anchor: "middle", spacing: 0 })}
    ${text(x + 66, y + 32, "Lu's Café", { size: 16, weight: 600, spacing: 0 })}
    ${text(x + w - 16, y + 32, "now", { size: 13, fill: "#3C3C43", opacity: 0.6, anchor: "end", spacing: 0 })}
    ${text(x + 66, y + 55, l1, { size: 15.5, spacing: 0 })}
    ${text(x + 66, y + 76, l2, { size: 15.5, spacing: 0 })}
  </g>`;
}

function lockScreen(t) {
  const n1 = spring(t - T.n1, SPRING_BOUNCE);
  const n2 = spring(t - T.n2, SPRING_BOUNCE);
  const base = S.y + 300;
  const push = n2 * 108;
  const notif = (s, y, l1, l2) =>
    s > 0 ? notification(y + lerp(-60, 0, s), l1, l2, clamp(easeOut(clamp(s * 1.4))), lerp(0.94, 1, s)) : "";
  return `<rect x="${S.x}" y="${S.y}" width="${S.w}" height="${S.h}" fill="url(#wall)"/>
    ${statusBar(true)}
    ${text(S.x + S.w / 2, S.y + 138, "Monday 28 September", { size: 20, weight: 600, fill: "#FFFFFF", opacity: 0.85, anchor: "middle" })}
    ${text(S.x + S.w / 2, S.y + 240, "9:41", { size: 108, weight: 700, fill: "#FFFFFF", opacity: 0.94, anchor: "middle" })}
    ${notif(n1, base + push, "Flash sale: 2 croissants for 1", "until noon.")}
    ${notif(n2, base, "Happy hour starts now.", "Half-price lattes until 6pm.")}
    <circle cx="${S.x + 70}" cy="${S.y + S.h - 90}" r="26" fill="#FFFFFF" fill-opacity="0.16"/>
    <circle cx="${S.x + S.w - 70}" cy="${S.y + S.h - 90}" r="26" fill="#FFFFFF" fill-opacity="0.16"/>
    <rect x="${S.x + S.w / 2 - 70}" y="${S.y + S.h - 14}" width="140" height="5" rx="2.5" fill="#FFFFFF"/>`;
}

function tapRipple(t, at, cx, cy) {
  const p = prog(t, at, at + 0.45);
  if (p <= 0 || p >= 1) return "";
  const r = lerp(16, 34, easeOut(p));
  const o = 0.3 * (1 - easeOut(p));
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#8E8E93" fill-opacity="${o}"/>`;
}

// ---------- camera: maps a focus point of the phone to a target point on the canvas ----------
const CAM = {
  // [time, zoom, focusX, focusY, targetX, targetY]
  keys: [
    [0, 1.18, 540, 756, 749, 1900],                         // below frame (entrance)
    [T.phoneIn, 1.18, 540, 756, 749, 675],                  // scene 1: phone right
    [T.zoomButton, 2.05, BUTTON.x + BUTTON.w / 2, BUTTON.y + BUTTON.h / 2, 540, 690], // centre the button
    [T.sheetUp - 0.25, 1.18, 540, 756, 331, 675],                  // scene 2: phone left
    [T.wake, 1.38, 540, 236, 540, 330],                    // scene 3: centred under the caption
    [T.zoomNotif, 1.85, 540, S.y + 348, 540, 690],         // centre the first notification
    [T.n2, 1.85, 540, S.y + 400, 540, 690],                // re-centre on the stack
  ],
};

function camera(t) {
  const track = (i, cfg) => springTrack(CAM.keys.map((k) => [k[0], k[i]]), t, cfg);
  return { k: track(1, SPRING_MOVE), fx: track(2, SPRING_MOVE), fy: track(3, SPRING_MOVE), x: track(4, SPRING_MOVE), y: track(5, SPRING_MOVE) };
}

function phone(t) {
  const exit = easeOut(prog(t, T.phoneOut, T.phoneOut + 0.8));
  if (exit >= 1 || t < T.phoneIn - 0.05) return "";
  const cam = camera(t);
  const sleep = easeInOut(prog(t, T.sleep, T.sleep + 0.6));
  const wake = easeOut(prog(t, T.wake, T.wake + 0.45));
  const k = cam.k * lerp(1, 0.94, exit);
  return `<g opacity="${1 - exit}" transform="translate(${cam.x} ${cam.y}) scale(${k}) translate(${-cam.fx} ${-cam.fy})">
    <rect x="${PHONE.x - 6}" y="${PHONE.y + 10}" width="${PHONE.w + 12}" height="${PHONE.h + 12}" rx="${PHONE.r + 6}" fill="#000" fill-opacity="0.6" filter="url(#shadow)"/>
    <rect x="${PHONE.x}" y="${PHONE.y}" width="${PHONE.w}" height="${PHONE.h}" rx="${PHONE.r}" fill="#1C1C1E" stroke="#48484A" stroke-width="2"/>
    <g clip-path="url(#screen)">
      <rect x="${S.x}" y="${S.y}" width="${S.w}" height="${S.h}" fill="#000"/>
      ${sleep < 1 ? `<g opacity="${1 - sleep}">${safariScreen(t)}${walletSheet(t)}${tapRipple(t, T.tap1, BUTTON.x + BUTTON.w / 2, BUTTON.y + BUTTON.h / 2)}${tapRipple(t, T.tap2, S.x + S.w - 44, S.y + 102)}</g>` : ""}
      ${wake > 0 ? `<g opacity="${wake}">${lockScreen(t)}</g>` : ""}
    </g>
  </g>`;
}

// ---------- captions (auto-fitted to their column) ----------
const CAPTIONS = [
  { in: T.cap1In, out: T.zoomButton - 0.05, column: [0, 466], anchor: "start", maxW: 350, centerY: 675, dir: -1,
    step: "01", lines: ["Scan the", "QR code"], sub: "Nothing to download" },
  { in: T.cap2In, out: T.sleep, column: [614, W], anchor: "start", maxW: 350, centerY: 675, dir: 1,
    step: "02", lines: ["One tap", "to add it"], sub: "No account needed" },
  { in: T.cap3In, out: T.zoomNotif - 0.05, x: W / 2, anchor: "middle", maxW: W - 2 * MARGIN, gap: 64, dir: 0,
    step: "03", lines: ["Your message lands", "on their lock screen"] },
];

async function fitCaptions() {
  for (const c of CAPTIONS) {
    let size = 100;
    const widest = async (s) => Math.max(...(await Promise.all(c.lines.map((l) => measure(l, s, 700)))));
    while (size > 40 && (await widest(size)) > c.maxW) size -= 2;
    c.size = size;
    c.lh = Math.round(size * 1.04);
    if (c.column) {
      // optically centre the left-aligned block in the free column beside the phone
      const widths = await Promise.all([...c.lines.map((l) => measure(l, size, 700)), ...(c.sub ? [measure(c.sub, 34, 500)] : [])]);
      c.x = (c.column[0] + c.column[1]) / 2 - Math.max(...widths) / 2;
    }
    if (c.gap) {
      // equal space: frame top → cap height, and last baseline → phone top
      c.top = c.gap - 0.08 * size;
      const phoneTop = c.top + 0.8 * size + c.lh * (c.lines.length - 1) + c.gap;
      CAM.keys[4] = [T.wake, 1.38, 540, PHONE.y, 540, phoneTop];
    }
  }
}

function captionBlock(c, t) {
  const inE = t - c.in, outP = easeOut(prog(t, c.out, c.out + 0.3));
  if (inE <= 0 || outP >= 1) return "";
  const stepH = 0, gap1 = 0, subGap = 26, subSize = 34;
  const blockH = stepH + gap1 + c.lines.length * c.lh + (c.sub ? subGap + subSize : 0);
  const top = c.top ?? c.centerY - blockH / 2;
  const items = [];
  const stepY = top + stepH - 4;
  let y;
  y = top + stepH + gap1 + c.size * 0.8;
  for (const line of c.lines) {
    const ly = y;
    items.push([ly, (x) => text(x, ly, line, { size: c.size, weight: 700, fill: "#FFFFFF", anchor: c.anchor })]);
    y += c.lh;
  }
  if (c.sub) {
    const sy = y - c.lh + subGap + subSize + c.size * 0.2;
    items.push([sy, (x) => text(x, sy, c.sub, { size: subSize, weight: 500, fill: "#D1D1D6", anchor: c.anchor })]);
  }
  return items.map(([, draw], i) => {
    const e = inE - i * 0.06; // 60ms stagger
    const s = spring(e, SPRING_TEXT);
    const o = easeOut(prog(e, 0, 0.35)) * (1 - outP);
    const off = (1 - s) * 36 + outP * 20; // exit the way it entered
    const dx = c.dir * off, dy = c.dir === 0 ? off : 0;
    return `<g opacity="${o}" transform="translate(${dx} ${dy})">${draw(c.x)}</g>`;
  }).join("");
}

// ---------- intro / outro ----------
let INTRO_SIZE = 120;

function intro(t) {
  const out = easeOut(prog(t, T.introOut, T.introOut + 0.4));
  if (out >= 1) return "";
  const line = (at, y, str, opacity, fill) => {
    const s = spring(t - at, SPRING_TEXT);
    const o = easeOut(prog(t - at, 0, 0.45)) * (1 - out);
    return `<g opacity="${o}" transform="translate(0 ${(1 - s) * 40 - out * 30})">
      ${text(W / 2, y, str, { size: INTRO_SIZE, weight: 700, fill, opacity, anchor: "middle" })}</g>`;
  };
  return line(0.25, 650, "Notifications", 1, "url(#titleGrad)") + line(0.7, 650 + INTRO_SIZE * 1.05, "Without the app", 0.55, "#FFFFFF");
}

function appIcon(size) {
  const k = size / 512;
  return `<g transform="scale(${k})">
    <rect width="512" height="512" rx="114" fill="url(#iconGrad)"/>
    <rect x="88" y="206" width="304" height="196" rx="30" fill="#FFFFFF"/>
    <rect x="120" y="242" width="96" height="14" rx="7" fill="#4338CA" opacity="0.9"/>
    <rect x="120" y="276" width="168" height="12" rx="6" fill="#4338CA" opacity="0.25"/>
    <rect x="120" y="302" width="128" height="12" rx="6" fill="#4338CA" opacity="0.25"/>
    <g fill="none" stroke="#FFFFFF" stroke-linecap="round" stroke-width="22">
      <path d="M372 136 a54 54 0 0 1 54 54"/><path d="M372 88 a102 102 0 0 1 102 102" opacity="0.55"/>
    </g>
  </g>`;
}

const PILL_LABELS = ["iPhone & Android", "Self-hosted", "Free"];
const PILL_SIZE = 28, PILL_PAD = 30, PILL_GAP = 16, PILL_H = 60;
let PILLS = [];
async function layoutPills() {
  const widths = await Promise.all(PILL_LABELS.map((l) => measure(l, PILL_SIZE, 500)));
  const boxes = widths.map((w) => w + 2 * PILL_PAD);
  let x = W / 2 - (boxes.reduce((a, b) => a + b, 0) + PILL_GAP * (boxes.length - 1)) / 2;
  PILLS = PILL_LABELS.map((label, i) => { const p = { label, x, w: boxes[i] }; x += boxes[i] + PILL_GAP; return p; });
}

const GITHUB_MARK = "M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z";
let GH_W = 0;

function outro(t) {
  const fade = 1 - easeOut(prog(t, T.end - 0.6, T.end));
  const el = (i, draw) => {
    const e = t - T.outroIn - i * 0.08;
    if (e <= 0) return "";
    const s = spring(e, i === 0 ? SPRING_BOUNCE : SPRING_TEXT);
    const o = easeOut(prog(e, 0, 0.4)) * fade;
    return `<g opacity="${o}" transform="translate(0 ${(1 - s) * 34})">${draw(s)}</g>`;
  };
  const iconSize = 220, iconY = 300;
  return [
    el(0, (s) => {
      const sc = lerp(0.9, 1, s);
      return `<g transform="translate(${W / 2} ${iconY + iconSize / 2}) scale(${sc}) translate(${-iconSize / 2} ${-iconSize / 2})">${appIcon(iconSize)}</g>`;
    }),
    el(1, () => text(W / 2, 680, "WalletCast", { size: 124, weight: 700, fill: "#FFFFFF", anchor: "middle" })),
    el(2, () => text(W / 2, 760, "Lock-screen notifications, no app", { size: 42, weight: 500, fill: "#D1D1D6", anchor: "middle" })),
    el(3, () => PILLS.map(({ label, x, w }) => `<rect x="${x}" y="826" width="${w}" height="${PILL_H}" rx="${PILL_H / 2}" fill="#FFFFFF" fill-opacity="0.1" stroke="#FFFFFF" stroke-opacity="0.24"/>
      ${text(x + w / 2, 826 + 40, label, { size: PILL_SIZE, weight: 500, fill: "#F2F2F7", anchor: "middle" })}`).join("")),
    el(4, () => {
      const icon = 42, gap = 16, total = icon + gap + GH_W, x = W / 2 - total / 2, y = 1000;
      return `<g transform="translate(${x} ${y - 35}) scale(${icon / 16})"><path d="${GITHUB_MARK}" fill="#FFFFFF" fill-rule="evenodd"/></g>
        ${text(x + icon + gap, y, "Open source on GitHub", { size: 38, weight: 600, fill: "#FFFFFF" })}`;
    }),
  ].join("");
}

function frame(t) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${FONT}">
  <defs>
    <radialGradient id="glow" cx="0.5" cy="0.45" r="0.75">
      <stop offset="0" stop-color="#312E81" stop-opacity="0.6"/><stop offset="1" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="titleGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#C7D2FE"/></linearGradient>
    <linearGradient id="wall" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1E1B4B"/><stop offset="0.5" stop-color="#4338CA"/><stop offset="1" stop-color="#A855F7"/></linearGradient>
    <linearGradient id="iconGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6366F1"/><stop offset="1" stop-color="#4338CA"/></linearGradient>
    <clipPath id="screen"><rect x="${S.x}" y="${S.y}" width="${S.w}" height="${S.h}" rx="${S.r}"/></clipPath>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="30"/></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="#000"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  ${intro(t)}${phone(t)}${CAPTIONS.map((c) => captionBlock(c, t)).join("")}${outro(t)}
</svg>`;
}

async function main() {
  await fitCaptions();
  await layoutPills();
  GH_W = await measure("Open source on GitHub", 38, 600);
  let s = 130;
  while ((await measure("Without the app", s, 700)) > W - 2 * MARGIN) s -= 2;
  INTRO_SIZE = s;

  if (ONLY !== null) {
    await sharp(Buffer.from(frame(ONLY))).png().toFile(`${tmpdir()}/walletcast-preview-${ONLY}.png`);
    return;
  }
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  const total = Math.round(FPS * DURATION);
  const jobs = [];
  for (let i = 0; i < total; i++) {
    jobs.push(sharp(Buffer.from(frame(i / FPS))).png({ compressionLevel: 1 }).toFile(`${OUT_DIR}f${String(i).padStart(4, "0")}.png`));
    if (jobs.length >= 8) await Promise.all(jobs.splice(0));
  }
  await Promise.all(jobs);
  const out = `${HERE}../videos/walletcast-promo-4x5.mp4`;
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", `${OUT_DIR}f%04d.png`,
    "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out]);
  console.log(out);
}

main();
