// "Share my pass": draws a profile card (story size 1080x1920) on a canvas so it can be posted to
// Instagram / LINE / etc. A card = one LAYOUT (how things are arranged) x one THEME (colours / background).
// Look follows the site: grey surface, white rounded card, grey pills, the leaf logo, brand gradient.
import { badgesOf } from "./badges.ts";

export type ShareCardData = {
  name: string;
  handle: string;
  bio: string;
  avatar: string;
  round: boolean;
  badges?: string[];
  /** short chips such as "ID 12345" */
  chips: string[];
  accent?: string;
  /** a cover photo, used by the poster layout and the "photo" theme */
  cover?: string;
  brand: string;
  classLine: string;
  year: string;
  url: string;
};

export type ShareLayout = "pass" | "poster" | "minimal" | "id";
export type ShareTheme =
  | "clean"
  | "accent"
  | "dark"
  | "photo"
  | "brand"
  | "sunset"
  | "ocean"
  | "mint";

export const LAYOUTS: { key: ShareLayout; name: string }[] = [
  { key: "pass", name: "พาส" },
  { key: "poster", name: "โปสเตอร์" },
  { key: "minimal", name: "มินิมอล" },
  { key: "id", name: "บัตรประจำตัว" },
];

type Palette = { card: string; ink: string; muted: string; line: string; pill: string };
type Theme = {
  name: string;
  /** swatch shown in the picker */
  swatch: string;
  card: Palette;
  /** text colours used straight on the background (minimal layout, header, footer) */
  onBg: { ink: string; muted: string; pill: string };
  paint: (ctx: CanvasRenderingContext2D, d: ShareCardData, accent: string, cover: Img) => void;
};
type Img = HTMLImageElement | null;

const W = 1080;
const H = 1920;
const GRAD = ["#82bcff", "#2483ff", "#ff66f4", "#ff3029", "#fe7b02"];
const LIGHT: Palette = {
  card: "#fff",
  ink: "#131922",
  muted: "#6b7078",
  line: "#e4e8ef",
  pill: "#ededed",
};
const DARK: Palette = {
  card: "#131922",
  ink: "#f5f6f7",
  muted: "#9aa3af",
  line: "#263040",
  pill: "#222c3a",
};
const ON_LIGHT = { ink: "#131922", muted: "#4b5563", pill: "rgba(19,25,34,.07)" };
const ON_DARK = { ink: "#ffffff", muted: "rgba(255,255,255,.78)", pill: "rgba(255,255,255,.16)" };

const fill = (
  ctx: CanvasRenderingContext2D,
  stops: string[],
  angle: [number, number, number, number],
) => {
  const g = ctx.createLinearGradient(...angle);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
};
const cover = (
  ctx: CanvasRenderingContext2D,
  im: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  zoom = 1,
) => {
  const iw = im.naturalWidth || im.width || 1;
  const ih = im.naturalHeight || im.height || 1;
  const k = Math.max(w / iw, h / ih) * zoom;
  ctx.drawImage(im, x + (w - iw * k) / 2, y + (h - ih * k) / 2, iw * k, ih * k);
};

export const THEMES: Record<ShareTheme, Theme> = {
  clean: {
    name: "เรียบ",
    swatch: "#f5f6f7",
    card: LIGHT,
    onBg: ON_LIGHT,
    paint: (ctx) => {
      ctx.fillStyle = "#f5f6f7";
      ctx.fillRect(0, 0, W, H);
    },
  },
  accent: {
    name: "สีโปรไฟล์",
    swatch: "#0569ff",
    card: LIGHT,
    onBg: ON_DARK,
    paint: (ctx, _d, accent) => {
      ctx.fillStyle = accent;
      ctx.fillRect(0, 0, W, H);
      fill(ctx, ["rgba(255,255,255,.28)", "rgba(0,0,0,.3)"], [0, 0, 0, H]);
    },
  },
  dark: {
    name: "มืด",
    swatch: "#0b0f16",
    card: DARK,
    onBg: ON_DARK,
    paint: (ctx) => {
      ctx.fillStyle = "#0b0f16";
      ctx.fillRect(0, 0, W, H);
      const g = ctx.createRadialGradient(W / 2, 500, 0, W / 2, 500, 900);
      g.addColorStop(0, "rgba(36,131,255,.22)");
      g.addColorStop(1, "rgba(36,131,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    },
  },
  photo: {
    name: "รูปปก",
    swatch: "#64748b",
    card: LIGHT,
    onBg: ON_DARK,
    paint: (ctx, _d, _a, im) => {
      ctx.fillStyle = "#1f2937";
      ctx.fillRect(0, 0, W, H);
      if (im) {
        ctx.save();
        ctx.filter = "blur(18px)";
        cover(ctx, im, 0, 0, W, H, 1.12);
        ctx.restore();
      }
      ctx.fillStyle = "rgba(10,14,20,.5)";
      ctx.fillRect(0, 0, W, H);
    },
  },
  brand: {
    name: "สีสัน",
    swatch: "linear-gradient(135deg,#82bcff,#ff66f4,#fe7b02)",
    card: LIGHT,
    onBg: ON_LIGHT,
    paint: (ctx) => {
      fill(ctx, GRAD, [0, 0, W, H]);
      ctx.fillStyle = "rgba(255,255,255,.55)";
      ctx.fillRect(0, 0, W, H);
    },
  },
  sunset: {
    name: "พระอาทิตย์ตก",
    swatch: "linear-gradient(135deg,#fe7b02,#ff3029,#c026d3)",
    card: LIGHT,
    onBg: ON_DARK,
    paint: (ctx) => fill(ctx, ["#fe7b02", "#ff3029", "#c026d3"], [0, 0, W * 0.6, H]),
  },
  ocean: {
    name: "ทะเล",
    swatch: "linear-gradient(135deg,#82bcff,#0569ff,#1e1b4b)",
    card: LIGHT,
    onBg: ON_DARK,
    paint: (ctx) => fill(ctx, ["#82bcff", "#0569ff", "#1e1b4b"], [0, 0, W * 0.5, H]),
  },
  mint: {
    name: "มิ้นท์",
    swatch: "linear-gradient(135deg,#d1fae5,#5eead4)",
    card: LIGHT,
    onBg: ON_LIGHT,
    paint: (ctx) => fill(ctx, ["#ecfdf5", "#a7f3d0", "#5eead4"], [0, 0, W * 0.5, H]),
  },
};

const hex = (c: string | undefined, d: string) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : d);

const loadImg = (src: string | undefined) =>
  new Promise<Img>((res) => {
    if (!src) return res(null);
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = src;
  });

/** Wrap text into at most `max` lines. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, max: number) {
  const lines: string[] = [];
  let cur = "";
  for (const ch of [...text]) {
    if (ctx.measureText(cur + ch).width > width && cur) {
      lines.push(cur);
      cur = ch.trim() ? ch : "";
    } else cur += ch;
  }
  if (cur) lines.push(cur);
  if (lines.length > max) {
    lines.length = max;
    lines[max - 1] = lines[max - 1].replace(/.$/, "…");
  }
  return lines;
}

/** The site's leaf logo (see logoMark in icons.ts) drawn at (x, y), `size` px square. */
function logo(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 32, size / 32);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.4;
  ctx.lineJoin = "round";
  for (const d of [
    "M16 15.5c-2.6-3.2-3.2-6.9-1.6-10.2a2 2 0 0 1 3.2 0c1.6 3.3 1 7-1.6 10.2z",
    "M16.4 16.3c4.1-.6 7.6.8 9.6 3.8a2 2 0 0 1-1.6 2.8c-3.6.3-6.6-1.9-8-6.6z",
    "M15.6 16.3c-1.4 4.7-4.4 6.9-8 6.6A2 2 0 0 1 6 20.1c2-3 5.5-4.4 9.6-3.8z",
  ])
    ctx.stroke(new Path2D(d));
  ctx.restore();
}

const pill = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  stroke?: string,
) => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fillStyle = color;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
};

type Ctx = {
  ctx: CanvasRenderingContext2D;
  d: ShareCardData;
  font: string;
  accent: string;
  T: Theme;
  avatar: Img;
  cover: Img;
};
type Align = "center" | "left";

/** Rounded (or round) picture with an optional ring. */
function picture(
  { ctx, d }: Ctx,
  im: Img,
  x: number,
  y: number,
  size: number,
  opts: { ring?: string; gap?: string; round?: boolean; radius?: number; zoom?: number },
) {
  const round = opts.round ?? d.round;
  const r = size / 2;
  const cxm = x + r;
  const cym = y + r;
  const shape = (grow: number) => {
    ctx.beginPath();
    if (round) ctx.arc(cxm, cym, r + grow, 0, Math.PI * 2);
    else
      ctx.roundRect(
        x - grow,
        y - grow,
        size + grow * 2,
        size + grow * 2,
        (opts.radius ?? size * 0.2) + grow,
      );
  };
  if (opts.ring) {
    ctx.fillStyle = opts.ring;
    shape(12);
    ctx.fill();
    ctx.fillStyle = opts.gap ?? "#fff";
    shape(4);
    ctx.fill();
  }
  ctx.save();
  shape(0);
  ctx.clip();
  if (im) cover(ctx, im, x, y, size, size, opts.zoom);
  else {
    ctx.fillStyle = "#ededed";
    ctx.fillRect(x, y, size, size);
  }
  ctx.restore();
}

/** Badge chips (same look as .bdg on the site). Returns the next y. */
function badgeChips(c: Ctx, x0: number, width: number, y: number, align: Align) {
  const { ctx, d } = c;
  const list = badgesOf(d.badges).slice(0, 4);
  if (!list.length) return y;
  ctx.font = `600 30px ${c.font}`;
  const items = list.map((b) => {
    const t = `${b.emoji} ${b.name}`.trim();
    return { b, t, w: ctx.measureText(t).width + 44 };
  });
  const rows: (typeof items)[] = [[]];
  let rw = 0;
  for (const it of items) {
    if (rw + it.w > width && rows[rows.length - 1].length) {
      rows.push([]);
      rw = 0;
    }
    rows[rows.length - 1].push(it);
    rw += it.w + 14;
  }
  ctx.textAlign = "center";
  for (const row of rows) {
    const total = row.reduce((t, i) => t + i.w + 14, -14);
    let x = align === "center" ? x0 + width / 2 - total / 2 : x0;
    for (const it of row) {
      const col = hex(it.b.color, "#475569");
      pill(ctx, x, y, it.w, 60, col + "1c", col + "52");
      ctx.fillStyle = col;
      ctx.fillText(it.t, x + it.w / 2, y + 40);
      x += it.w + 14;
    }
    y += 76;
  }
  return y;
}

/** Wrapped quote. Returns the next y. */
function quote(
  c: Ctx,
  x: number,
  width: number,
  y: number,
  align: Align,
  color: string,
  size = 40,
  max = 3,
) {
  const { ctx } = c;
  ctx.textAlign = align;
  ctx.fillStyle = color;
  ctx.font = `400 ${size}px ${c.font}`;
  for (const line of wrap(ctx, c.d.bio, width, max)) {
    ctx.fillText(line, x, y);
    y += size * 1.45;
  }
  return y;
}

/** Row of small pills. Returns the next y. */
function chipRow(
  c: Ctx,
  x0: number,
  width: number,
  y: number,
  align: Align,
  bg: string,
  fg: string,
) {
  const { ctx, d } = c;
  const chips = d.chips.slice(0, 3);
  if (!chips.length) return y;
  ctx.font = `500 30px ${c.font}`;
  ctx.textAlign = "center";
  const ws = chips.map((t) => ctx.measureText(t).width + 48);
  let x = align === "center" ? x0 + width / 2 - ws.reduce((t, v) => t + v + 14, -14) / 2 : x0;
  chips.forEach((t, i) => {
    pill(ctx, x, y, ws[i], 60, bg);
    ctx.fillStyle = fg;
    ctx.fillText(t, x + ws[i] / 2, y + 40);
    x += ws[i] + 14;
  });
  return y + 60;
}

/** Name that shrinks to fit. */
function nameLine(
  c: Ctx,
  text: string,
  x: number,
  y: number,
  width: number,
  align: Align,
  color: string,
  start = 84,
) {
  const { ctx } = c;
  let size = start;
  ctx.textAlign = align;
  ctx.fillStyle = color;
  ctx.font = `700 ${size}px ${c.font}`;
  while (ctx.measureText(text).width > width && size > 44)
    ctx.font = `700 ${(size -= 4)}px ${c.font}`;
  ctx.fillText(text, x, y);
}

/** Logo + brand on the left, link on the right, separated from the content by a thin line. */
function cardFooter(c: Ctx, P: Palette, cx: number, cw: number, fy: number) {
  const { ctx, d } = c;
  ctx.strokeStyle = P.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx + 56, fy);
  ctx.lineTo(cx + cw - 56, fy);
  ctx.stroke();
  logo(ctx, cx + 56, fy + 36, 44, c.accent);
  ctx.textAlign = "left";
  ctx.fillStyle = P.ink;
  ctx.font = `600 30px ${c.font}`;
  ctx.fillText(d.brand, cx + 116, fy + 70);
  ctx.textAlign = "right";
  ctx.fillStyle = P.muted;
  ctx.font = `400 28px ${c.font}`;
  ctx.fillText(d.url.replace(/^https?:\/\//, ""), cx + cw - 56, fy + 69);
}

function cardBox(c: Ctx, cx: number, cy: number, cw: number, ch: number) {
  const { ctx, T } = c;
  ctx.save();
  ctx.shadowColor = "rgba(19,25,34,.12)";
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 20;
  ctx.fillStyle = T.card.card;
  ctx.beginPath();
  ctx.roundRect(cx, cy, cw, ch, 48);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = T.card.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(cx, cy, cw, ch, 48);
  ctx.stroke();
}

/** Brand header above a card (logo, name, class). */
function topBrand(c: Ctx, y = 120) {
  const { ctx, d, T } = c;
  logo(ctx, W / 2 - 26, y, 52, T.onBg.ink);
  ctx.textAlign = "center";
  ctx.fillStyle = T.onBg.ink;
  ctx.font = `600 38px ${c.font}`;
  ctx.fillText(d.brand, W / 2, y + 112);
  ctx.fillStyle = T.onBg.muted;
  ctx.font = `400 30px ${c.font}`;
  ctx.fillText(`${d.classLine} · Class of ${d.year}`, W / 2, y + 160);
}

/** Thin brand-gradient bar + a call to action under the card. */
function bottomCta(c: Ctx, y: number) {
  const { ctx, T } = c;
  const g = ctx.createLinearGradient(W / 2 - 160, 0, W / 2 + 160, 0);
  GRAD.forEach((col, i) => g.addColorStop(i / (GRAD.length - 1), col));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(W / 2 - 160, y, 320, 8, 4);
  ctx.fill();
  ctx.textAlign = "center";
  ctx.fillStyle = T.onBg.ink;
  ctx.font = `600 36px ${c.font}`;
  ctx.fillText("ดูโปรไฟล์เต็ม ๆ ได้ที่เว็บห้องเรา", W / 2, y + 80);
}

/* ------------------------------ layouts ------------------------------ */

function layoutPass(c: Ctx) {
  const { ctx, d, T, accent } = c;
  const P = T.card;
  topBrand(c);
  const cx = 80;
  const cw = W - 160;
  const cy = 350;
  const ch = 1170;
  cardBox(c, cx, cy, cw, ch);
  picture(c, c.avatar, W / 2 - 150, cy + 100, 300, { ring: accent, gap: P.card });
  let y = cy + 250 + 150 + 110;
  nameLine(c, d.name, W / 2, y, cw - 100, "center", P.ink);
  y += 60;
  ctx.fillStyle = P.muted;
  ctx.textAlign = "center";
  ctx.font = `400 36px ${c.font}`;
  ctx.fillText(d.handle, W / 2, y);
  y = badgeChips(c, cx + 60, cw - 120, y + 44, "center") + 34;
  y = quote(c, W / 2, cw - 160, y, "center", P.ink);
  chipRow(c, cx, cw, y + 24, "center", P.pill, P.ink);
  cardFooter(c, P, cx, cw, cy + ch - 120);
  bottomCta(c, cy + ch + 90);
}

function layoutPoster(c: Ctx) {
  const { ctx, d, T, accent } = c;
  const P = T.card;
  const cx = 70;
  const cw = W - 140;
  const cy = 120;
  const ch = 1560;
  const ph = 760;
  cardBox(c, cx, cy, cw, ch);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(cx, cy, cw, ch, 48);
  ctx.clip();
  const im = c.cover ?? c.avatar;
  if (im) cover(ctx, im, cx, cy, cw, ph, 1);
  else {
    ctx.fillStyle = accent;
    ctx.fillRect(cx, cy, cw, ph);
  }
  const g = ctx.createLinearGradient(0, cy + ph - 360, 0, cy + ph);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,.72)");
  ctx.fillStyle = g;
  ctx.fillRect(cx, cy + ph - 360, cw, 360);
  ctx.restore();
  // little avatar on the photo when a cover is used
  if (c.cover && c.avatar)
    picture(c, c.avatar, cx + 48, cy + 48, 130, { ring: "#ffffff", gap: "#00000000" });
  nameLine(c, d.name, cx + 56, cy + ph - 96, cw - 112, "left", "#fff", 92);
  c.ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,.85)";
  ctx.font = `400 36px ${c.font}`;
  ctx.fillText(d.handle, cx + 56, cy + ph - 40);
  let y = badgeChips(c, cx + 56, cw - 112, cy + ph + 44, "left") + 26;
  y = quote(c, cx + 56, cw - 112, y, "left", P.ink, 42);
  chipRow(c, cx + 56, cw - 112, y + 12, "left", P.pill, P.ink);
  cardFooter(c, P, cx, cw, cy + ch - 120);
  // brand line under the card
  ctx.textAlign = "center";
  ctx.fillStyle = T.onBg.ink;
  ctx.font = `600 32px ${c.font}`;
  ctx.fillText(`${d.brand} · ${d.classLine}`, W / 2, cy + ch + 90);
}

function layoutMinimal(c: Ctx) {
  const { ctx, d, T, accent } = c;
  const O = T.onBg;
  logo(ctx, 90, 110, 52, O.ink);
  ctx.textAlign = "left";
  ctx.fillStyle = O.ink;
  ctx.font = `600 36px ${c.font}`;
  ctx.fillText(d.brand, 160, 150);
  ctx.textAlign = "right";
  ctx.fillStyle = O.muted;
  ctx.font = `400 30px ${c.font}`;
  ctx.fillText(`Class of ${d.year}`, W - 90, 150);

  picture(c, c.avatar, W / 2 - 230, 330, 460, { ring: accent, gap: "#ffffff" });
  let y = 330 + 460 + 170;
  nameLine(c, d.name, W / 2, y, W - 180, "center", O.ink, 120);
  y += 70;
  ctx.textAlign = "center";
  ctx.fillStyle = O.muted;
  ctx.font = `400 42px ${c.font}`;
  ctx.fillText(d.handle, W / 2, y);
  y = badgeChips(c, 90, W - 180, y + 50, "center") + 40;
  y = quote(c, W / 2, W - 240, y, "center", O.ink, 46);
  chipRow(c, 90, W - 180, y + 24, "center", O.pill, O.ink);

  ctx.textAlign = "center";
  ctx.fillStyle = O.muted;
  ctx.font = `400 30px ${c.font}`;
  ctx.fillText(d.classLine, W / 2, H - 230);
  bottomCta(c, H - 190);
  ctx.fillStyle = O.muted;
  ctx.font = `400 28px ${c.font}`;
  ctx.fillText(d.url.replace(/^https?:\/\//, ""), W / 2, H - 70);
}

function layoutId(c: Ctx) {
  const { ctx, d, T, accent } = c;
  const P = T.card;
  const cw = 800;
  const cx = (W - cw) / 2;
  const cy = 190;
  const ch = 1500;
  // lanyard slot above the badge
  ctx.fillStyle = T.onBg.pill;
  ctx.beginPath();
  ctx.roundRect(W / 2 - 90, 90, 180, 40, 20);
  ctx.fill();
  cardBox(c, cx, cy, cw, ch);
  // header band
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(cx, cy, cw, ch, 48);
  ctx.clip();
  ctx.fillStyle = accent;
  ctx.fillRect(cx, cy, cw, 170);
  const g = ctx.createLinearGradient(cx, cy, cx + cw, cy);
  g.addColorStop(0, "rgba(255,255,255,.18)");
  g.addColorStop(1, "rgba(0,0,0,.2)");
  ctx.fillStyle = g;
  ctx.fillRect(cx, cy, cw, 170);
  ctx.restore();
  ctx.fillStyle = P.card;
  ctx.beginPath();
  ctx.roundRect(W / 2 - 70, cy + 34, 140, 22, 11);
  ctx.fill();
  logo(ctx, cx + 48, cy + 90, 52, "#fff");
  ctx.textAlign = "left";
  ctx.fillStyle = "#fff";
  ctx.font = `700 34px ${c.font}`;
  ctx.fillText(d.brand, cx + 112, cy + 128);
  ctx.textAlign = "right";
  ctx.font = `500 28px ${c.font}`;
  ctx.fillText(`Class of ${d.year}`, cx + cw - 48, cy + 126);

  picture(c, c.avatar, W / 2 - 190, cy + 230, 380, {
    round: false,
    radius: 56,
    ring: accent,
    gap: P.card,
  });
  let y = cy + 230 + 380 + 120;
  nameLine(c, d.name, W / 2, y, cw - 100, "center", P.ink, 80);
  y = badgeChips(c, cx + 50, cw - 100, y + 30, "center") + 16;

  const rows: [string, string][] = [
    ["รหัส", d.handle],
    ["ห้อง", d.classLine],
    ...d.chips.slice(0, 2).map((t): [string, string] => ["ข้อมูล", t]),
  ];
  ctx.font = `400 32px ${c.font}`;
  for (const [k, v] of rows) {
    ctx.strokeStyle = P.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + 56, y);
    ctx.lineTo(cx + cw - 56, y);
    ctx.stroke();
    ctx.textAlign = "left";
    ctx.fillStyle = P.muted;
    ctx.fillText(k, cx + 56, y + 52);
    ctx.textAlign = "right";
    ctx.fillStyle = P.ink;
    ctx.font = `600 32px ${c.font}`;
    ctx.fillText(v, cx + cw - 56, y + 52);
    ctx.font = `400 32px ${c.font}`;
    y += 74;
  }
  quote(c, W / 2, cw - 120, y + 62, "center", P.muted, 34, 2);
  cardFooter(c, P, cx, cw, cy + ch - 120);
  ctx.textAlign = "center";
  ctx.fillStyle = T.onBg.ink;
  ctx.font = `600 32px ${c.font}`;
  ctx.fillText(d.url.replace(/^https?:\/\//, ""), W / 2, cy + ch + 90);
}

const LAYOUT_FN: Record<ShareLayout, (c: Ctx) => void> = {
  pass: layoutPass,
  poster: layoutPoster,
  minimal: layoutMinimal,
  id: layoutId,
};

export async function drawShareCard(
  d: ShareCardData,
  layout: ShareLayout = "pass",
  theme: ShareTheme = "clean",
): Promise<HTMLCanvasElement> {
  await document.fonts?.ready;
  const font = getComputedStyle(document.body).fontFamily || "sans-serif";
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const [avatar, coverIm] = await Promise.all([loadImg(d.avatar), loadImg(d.cover)]);
  const T = THEMES[theme];
  const accent = hex(d.accent, "#0569ff");
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "center";
  T.paint(ctx, d, accent, coverIm ?? avatar);
  LAYOUT_FN[layout]({ ctx, d, font, accent, T, avatar, cover: coverIm });
  return c;
}
