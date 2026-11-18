// Signature themes: one-of-a-kind profile looks that only their owner can switch on.
//   homura  (#1)  violet clockwork, soul-gem ring, falling feathers, "time stop", own character art
//   ender   (#26) a 3D printer that prints the cover layer by layer, G-code ticker, LCD status
//   cp      (#15) C++ editor over the cover, Accepted verdicts, a rating graph
//   pudding (#7)  caramel drips, a jiggly pudding, sweetness meter
// The server only keeps `theme.sig` for the owner (server/db.ts SIGNATURE_OWNERS).
// All artwork here is original SVG / CSS (no copyrighted character images are bundled; the
// owner can upload their own picture as `theme.art`).
import { esc } from "./router.ts";
import type { ProfileTheme } from "./theme.ts";

export type SigKey = "homura" | "ender" | "cp" | "pudding";
export type Signature = {
  key: SigKey;
  owner: number;
  name: string;
  tagline: string;
  /** look applied together with the signature (the owner can still tweak it afterwards) */
  preset: ProfileTheme;
  /** owner can upload a picture shown in the cover (e.g. their favourite character) */
  art?: boolean;
};

export const SIGNATURES: Signature[] = [
  {
    key: "homura",
    owner: 1,
    name: "ทวนเวลา · Homura",
    tagline: "นาฬิกาเวทมนตร์ เฟืองหมุน ขนนกดำ อัญมณีวิญญาณ และปุ่มหยุดเวลา",
    preset: {
      mode: "dark",
      accent: "#a78bfa",
      accent2: "#f0abfc",
      bg: "plain",
      font: "serif",
      ring: "none",
      corner: "round",
    },
    art: true,
  },
  {
    key: "ender",
    owner: 26,
    name: "Ender 3D Printer",
    tagline: "เครื่องพิมพ์ 3D พิมพ์รูปปกทีละเลเยอร์ พร้อม G-code และจอ LCD",
    // keeps the site's normal light look; only the decorations are themed
    preset: { accent: "#f97316", accent2: "#22c55e", bg: "plain", ring: "none" },
  },
  {
    key: "cp",
    owner: 15,
    name: "Competitive Programmer",
    tagline: "C++ บนหน้าปก ผลตรวจ Accepted และกราฟเรตติ้งแบบ Codeforces",
    // keeps the site's normal light look; only the decorations are themed
    preset: { accent: "#2563eb", accent2: "#facc15", bg: "plain", ring: "none" },
  },
  {
    key: "pudding",
    owner: 7,
    name: "Pudding Time",
    tagline: "คาราเมลไหลเยิ้ม พุดดิ้งดุ๊กดิ๊กกดได้ และมาตรวัดความหวาน",
    preset: {
      mode: "light",
      accent: "#b45309",
      accent2: "#f59e0b",
      bg: "plain",
      font: "itim",
      ring: "none",
      corner: "round",
    },
  },
];

export const signatureOf = (no: number) => SIGNATURES.find((s) => s.owner === no);

/**
 * The theme a profile actually shows: owners get their signature theme by default (it was made
 * for them), unless they switched it off in /me (`sigOff`).
 */
export function effectiveTheme(
  no: number,
  theme: ProfileTheme | undefined,
  /** the student's chosen profile picture: their own upload doubles as the signature picture */
  avatar?: string,
): ProfileTheme {
  const t = theme ?? {};
  const sig = signatureOf(no);
  if (!sig || t.sigOff) return t;
  const on: ProfileTheme = t.sig ? { ...t } : { ...t, ...sig.preset, sig: sig.key };
  if (sig.art && !on.art && avatar && /^up-[\w-]{6,40}$/.test(avatar)) on.art = avatar;
  return on;
}
export const getSignature = (key: string | undefined) => SIGNATURES.find((s) => s.key === key);
export const artSrc = (id: string | undefined) =>
  id && /^up-[\w-]{6,40}$/.test(id) ? `/uploads/${id}.jpg` : "";

/* ---------------- shared drawing helpers ---------------- */

/** A gear outline centred on 0,0. */
function gear(r: number, teeth: number, depth = r * 0.16) {
  const pts: string[] = [];
  for (let i = 0; i < teeth * 4; i++) {
    const a = (i / (teeth * 4)) * Math.PI * 2;
    const rr = i % 4 < 2 ? r : r - depth;
    pts.push(`${(Math.cos(a) * rr).toFixed(1)},${(Math.sin(a) * rr).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(" ")}"/><circle r="${(r * 0.32).toFixed(1)}"/>`;
}

const ROMAN = ["XII", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI"];

function clockFace() {
  let ticks = "";
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const r1 = i % 5 ? 86 : 80;
    ticks += `<line x1="${(Math.sin(a) * r1).toFixed(1)}" y1="${(-Math.cos(a) * r1).toFixed(1)}" x2="${(Math.sin(a) * 92).toFixed(1)}" y2="${(-Math.cos(a) * 92).toFixed(1)}"/>`;
  }
  const nums = ROMAN.map((n, i) => {
    const a = (i / 12) * Math.PI * 2;
    return `<text x="${(Math.sin(a) * 68).toFixed(1)}" y="${(-Math.cos(a) * 68 + 4).toFixed(1)}">${n}</text>`;
  }).join("");
  return `<svg class="sig-clock" viewBox="-100 -100 200 200" aria-hidden="true">
    <g transform="translate(-74 70)"><g class="sig-gear g1">${gear(30, 12)}</g></g>
    <g transform="translate(78 -66)"><g class="sig-gear g2">${gear(22, 10)}</g></g>
    <circle r="96" class="ring"/><circle r="92" class="ring thin"/><circle r="56" class="ring thin"/>
    <g class="ticks">${ticks}</g><g class="nums">${nums}</g>
    <g class="hand hour"><path d="M0 6 L-3 0 L0 -40 L3 0 Z"/></g>
    <g class="hand min"><path d="M0 8 L-2 0 L0 -62 L2 0 Z"/></g>
    <path class="sig-gem" d="M0 -9 L7 0 L0 9 L-7 0 Z"/>
  </svg>`;
}

/** hourglass with sand running from the top bulb to the bottom one */
const hourglass = () => `<svg class="sig-hourglass" viewBox="0 0 40 64" aria-hidden="true">
  <defs><clipPath id="sig-hg-top"><path d="M9 8h22c0 12-8 16-11 22-3-6-11-10-11-22z"/></clipPath><clipPath id="sig-hg-bot"><path d="M9 56h22c0-12-8-16-11-22-3 6-11 10-11 22z"/></clipPath></defs>
  <rect class="sand top" x="6" y="8" width="28" height="22" clip-path="url(#sig-hg-top)"/>
  <rect class="sand bot" x="6" y="34" width="28" height="22" clip-path="url(#sig-hg-bot)"/>
  <rect class="stream" x="19.4" y="29" width="1.2" height="16"/>
  <path class="glass" d="M9 8h22c0 12-8 16-11 24 3 8 11 12 11 24H9c0-12 8-16 11-24-3-8-11-12-11-24z"/>
  <rect class="cap" x="5" y="4" width="30" height="4" rx="2"/><rect class="cap" x="5" y="56" width="30" height="4" rx="2"/>
</svg>`;

const feather = `<svg viewBox="0 0 24 60"><path d="M12 2c8 10 10 26 2 44l-2 12-2-12C2 28 4 12 12 2z" fill="currentColor"/><path d="M12 6v52" stroke="rgba(255,255,255,.25)" stroke-width="1"/></svg>`;

function pudding() {
  return `<svg viewBox="0 0 160 140" aria-hidden="true">
    <ellipse cx="80" cy="124" rx="70" ry="12" fill="#fff" stroke="#e7c9a0" stroke-width="2"/>
    <ellipse cx="80" cy="121" rx="54" ry="8" fill="#f5e6d0"/>
    <path d="M38 118 L50 58 Q80 48 110 58 L122 118 Q80 130 38 118Z" fill="#fcd34d" stroke="#e0a526" stroke-width="2"/>
    <path d="M52 56 Q80 44 108 56 L110 66 Q104 78 100 66 Q96 86 90 68 Q84 82 78 68 Q72 88 66 68 Q60 80 56 68 Q52 76 50 66Z" fill="#92400e"/>
    <path d="M60 52 q20-26 40 0" fill="#fff" stroke="#f1e4d4" stroke-width="2"/>
    <circle cx="80" cy="30" r="9" fill="#e11d48"/><path d="M80 22 q6-12 16-14" stroke="#166534" stroke-width="2.4" fill="none"/>
    <ellipse cx="66" cy="92" rx="5" ry="8" fill="#fff" opacity=".45"/>
  </svg>`;
}

const CPP = [
  `<b>#include</b> <s>&lt;bits/stdc++.h&gt;</s>`,
  `<b>using namespace</b> std;`,
  ``,
  `<i>int</i> <u>main</u>() {`,
  `  ios::sync_with_stdio(<b>false</b>);`,
  `  <i>int</i> t; cin &gt;&gt; t;`,
  `  <b>while</b> (t--) <u>solve</u>();`,
  `}`,
];

const GCODE = [
  "G28 ; home all axes",
  "M104 S210 ; hotend",
  "M140 S60 ; bed",
  "G1 Z0.2 F1200",
  "G1 X120.4 Y86.2 E3.21",
  "G1 X96.0 Y120.8 E4.02",
  "M117 ม.6/2 printing…",
];

/** rating graph in rank bands (newbie → grandmaster colours) */
function ratingGraph() {
  const bands = [
    ["#cccccc", 0],
    ["#77ff77", 1200],
    ["#77ddbb", 1400],
    ["#aaaaff", 1600],
    ["#ff88ff", 1900],
    ["#ffcc88", 2100],
    ["#ff7777", 2400],
  ] as const;
  const y = (r: number) => 60 - ((r - 900) / (2600 - 900)) * 60;
  const rects = bands
    .map(([c, from], i) => {
      const to = i + 1 < bands.length ? bands[i + 1][1] : 2600;
      const top = y(Math.min(to, 2600));
      const bot = y(Math.max(from, 900));
      return bot > 0 && top < 60
        ? `<rect x="0" y="${top.toFixed(1)}" width="200" height="${(bot - top).toFixed(1)}" fill="${c}" opacity=".28"/>`
        : "";
    })
    .join("");
  const pts = [1000, 1180, 1120, 1310, 1420, 1390, 1520, 1610, 1580, 1700, 1760, 1840];
  const line = pts
    .map((r, i) => `${((i / (pts.length - 1)) * 196 + 2).toFixed(1)},${y(r).toFixed(1)}`)
    .join(" ");
  return `<svg class="sig-rating" viewBox="0 0 200 60" preserveAspectRatio="none" aria-hidden="true">${rects}<polyline points="${line}" fill="none" stroke="#facc15" stroke-width="1.6"/>${pts
    .map(
      (r, i) =>
        `<circle cx="${((i / (pts.length - 1)) * 196 + 2).toFixed(1)}" cy="${y(r).toFixed(1)}" r="1.6" fill="#fff"/>`,
    )
    .join("")}</svg>`;
}

/* ---------------- per-signature parts ---------------- */

function coverHtml(sig: SigKey, theme: ProfileTheme) {
  switch (sig) {
    case "homura": {
      const art = artSrc(theme.art);
      // no picture yet: the clock over the normal cover photos
      if (!art)
        return `<div class="sig-cover sig-cover-homura"><div class="sig-vignette"></div>${clockFace()}<span class="sig-cover-tag">⌛ Time Stop</span></div>`;
      // with a picture: a whole night scene (the cover photos sit underneath)
      return `<div class="sig-cover sig-cover-homura has-art">
        <div class="sig-night"></div>
        ${clockFace()}
        <figure class="sig-portrait"><img src="${art}" alt=""></figure>
        <div class="sig-title">${hourglass()}<b>Homura</b><span>Akemi · Time Stop</span></div>
      </div>`;
    }
    case "ender":
      return `<div class="sig-cover sig-cover-ender" aria-hidden="true">
        <div class="sig-layers"></div>
        <div class="sig-frame l"></div><div class="sig-frame r"></div><div class="sig-frame t"></div>
        <div class="sig-gantry"><div class="sig-carriage"><i></i></div></div>
        <div class="sig-lcd"><b>PRINTING</b><span>ม.6/2 · 87%</span><em><i></i></em><small>210°C · 60°C</small></div>
      </div>`;
    case "cp":
      return `<div class="sig-cover sig-cover-cp" aria-hidden="true">
        <div class="sig-editor">
          <div class="sig-tabs"><span class="on">main.cpp</span><span>input.txt</span></div>
          <ol>${CPP.map((l, i) => `<li style="--i:${i}"><code>${l || "&nbsp;"}</code></li>`).join("")}</ol>
        </div>
        <div class="sig-verdict"><b>✓ Accepted</b><span>46 ms · 3.2 MB</span></div>
      </div>`;
    case "pudding":
      return `<div class="sig-cover sig-cover-pudding">
        <svg class="sig-drip" viewBox="0 0 400 60" preserveAspectRatio="none" aria-hidden="true"><path d="M0 0H400V18Q390 22 384 18T368 34Q360 50 352 34T340 20Q330 16 320 22T300 44Q292 58 284 42T270 20Q258 14 248 22T230 30Q220 34 212 24T190 18Q178 20 172 36Q166 52 158 36T140 18Q128 14 118 26T100 48Q92 60 84 44T70 20Q60 14 50 22T30 36Q22 46 14 30T0 18Z" fill="url(#sig-caramel)"/><defs><linearGradient id="sig-caramel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#78350f"/><stop offset="1" stop-color="#b45309"/></linearGradient></defs></svg>
        <button type="button" class="sig-pudding" data-sig-jiggle aria-label="พุดดิ้ง กดเพื่อเขย่า">${pudding()}</button>
      </div>`;
  }
}

function bannerHtml(sig: SigKey) {
  switch (sig) {
    case "homura":
      return `<div class="sig-banner sig-banner-homura"><svg class="sig-gem-icon" viewBox="-10 -14 20 28" aria-hidden="true"><path d="M0-13 9 0 0 13-9 0z"/><path d="M0-13 3 0 0 13" opacity=".4" fill="#fff"/></svg><span>ย้อนเวลาได้กี่ครั้ง ก็จะกลับมาที่ ม.6/2</span><button type="button" data-sig-timestop>⏳ หยุดเวลา</button></div>`;
    case "ender":
      return `<div class="sig-banner sig-banner-ender"><span class="sig-spool" aria-hidden="true"></span><span class="sig-gcode" aria-label="G-code"><span>${GCODE.map((g) => `<code>${esc(g)}</code>`).join("")}<code>${esc(GCODE[0])}</code></span></span></div>`;
    case "cp":
      return `<div class="sig-banner sig-banner-cp">${ratingGraph()}<span><b>C++</b> · Competitive Programmer<small>solve() → Accepted ✓</small></span></div>`;
    case "pudding":
      return `<div class="sig-banner sig-banner-pudding"><span>🍮 ความหวานวันนี้</span><span class="sig-meter" aria-hidden="true"><i></i></span><b>100%</b></div>`;
  }
}

function layerHtml(sig: SigKey) {
  if (sig === "homura")
    return `<div class="sig-layer sig-layer-homura" aria-hidden="true">${Array.from({ length: 9 }, (_, i) => `<span class="sig-feather" style="--x:${(i * 11 + 5) % 96}%;--d:${(i * 1.7) % 9}s;--t:${9 + (i % 4) * 2}s;--s:${0.7 + (i % 3) * 0.25}">${feather}</span>`).join("")}</div>`;
  if (sig === "pudding")
    return `<div class="sig-layer sig-layer-pudding" aria-hidden="true">${Array.from({ length: 7 }, (_, i) => `<span class="sig-float" style="--x:${(i * 14 + 6) % 94}%;--d:${(i * 1.3) % 8}s;--t:${11 + (i % 3) * 3}s">${["🍮", "🍒", "🥄", "✨"][i % 4]}</span>`).join("")}</div>`;
  return "";
}

/**
 * Add the signature decorations to a mounted profile page (inside #pf-main). Returns a cleanup.
 * Called by renderProfilePage after the header is rendered.
 */
export function mountSignature(main: HTMLElement, theme: ProfileTheme | undefined): () => void {
  const sig = getSignature(theme?.sig);
  if (!sig || !theme) return () => {};
  const timers: number[] = [];
  main.querySelector(".pf-cover")?.insertAdjacentHTML("beforeend", coverHtml(sig.key, theme));
  main.querySelector(".pf-info-text")?.insertAdjacentHTML("beforeend", bannerHtml(sig.key));
  main.insertAdjacentHTML("afterbegin", layerHtml(sig.key));
  const onClick = (e: Event) => {
    const t = e.target as Element;
    if (t.closest("[data-sig-timestop]") && !main.classList.contains("sig-stopped")) {
      main.classList.add("sig-stopped");
      timers.push(window.setTimeout(() => main.classList.remove("sig-stopped"), 3600));
    }
    const p = t.closest<HTMLElement>("[data-sig-jiggle]");
    if (p) {
      p.classList.remove("is-jiggle");
      void p.offsetWidth;
      p.classList.add("is-jiggle");
    }
  };
  main.addEventListener("click", onClick);
  return () => {
    main.removeEventListener("click", onClick);
    timers.forEach(clearTimeout);
    main.classList.remove("sig-stopped");
  };
}

/** Small preview tile for the /me editor. */
export const signatureCard = (s: Signature) =>
  `<span class="sig-card sig-card-${s.key}" aria-hidden="true"><i></i><i></i><i></i></span>`;
