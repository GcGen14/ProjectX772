import {
  BRAND,
  CLASS,
  albums,
  featured,
  getStudent,
  large,
  messages,
  notes,
  students,
  studentAvatar,
  thumb,
  totals,
  wall,
  type Album,
  type Photo,
  profileUrl,
  teacherAvatar,
  teacherName,
  teacherUrl,
  teachers,
} from "../data.ts";
import { icon, logoMark, onlineDot } from "../lib/icons.ts";
import { myNo } from "../lib/api.ts";
import { bindSongPlayers, songNavButton, songSectionHtml } from "../lib/song.ts";
import { chatBadge } from "../lib/chat-badge.ts";
import { clamp, esc, prefersReducedMotion, type Cleanup } from "../lib/router.ts";
import { albumCount, albumCover, albumCoverSrc } from "./album.ts";

/* ------------------------------------------------------------------ *
 * Hero card layout, in a 1440 x 675 reference frame.
 * x is measured from the card's own screen edge (left or right side).
 * ------------------------------------------------------------------ */
type HeroSlot = {
  side: "left" | "right";
  x: number;
  y: number;
  w: number;
  r: number;
  float?: boolean;
};

const SLOTS: HeroSlot[] = [
  { side: "left", x: -14, y: -46, w: 168, r: -7 },
  { side: "right", x: 212, y: -74, w: 160, r: 2 },
  { side: "right", x: 22, y: -22, w: 204, r: 3 },
  { side: "right", x: 14, y: 206, w: 250, r: -4, float: true },
  { side: "right", x: 4, y: 494, w: 186, r: 6 },
  { side: "right", x: 176, y: 548, w: 200, r: -3 },
  { side: "left", x: 82, y: 468, w: 258, r: 4, float: true },
  { side: "left", x: -22, y: 292, w: 232, r: -4 },
  { side: "left", x: 196, y: 160, w: 206, r: 4 },
  { side: "left", x: 128, y: -118, w: 184, r: 5 },
];
const CARD_RATIO = 1.245;

type HeroCard = HeroSlot & { album: Album; photo: Photo; avatar: string };

/** Spread the hero cards across albums (round-robin over each album's 1600px photos). */
function heroCards(): HeroCard[] {
  const pools = albums
    .filter((a) => a.photos.length >= 8)
    .map((a) => ({ a, list: featured(a).slice() }));
  const out: HeroCard[] = [];
  let k = 0;
  while (out.length < SLOTS.length && pools.some((p) => p.list.length)) {
    const pool = pools[k++ % pools.length];
    const photo = pool.list.shift();
    if (!photo) continue;
    const i = out.length;
    out.push({
      ...SLOTS[i],
      album: pool.a,
      photo,
      avatar: studentAvatar(students[(i * 5) % students.length]),
    });
  }
  return out;
}

const HAND_WORDS: { text: string; font: string; lang: string }[] = [
  { text: "เรา", font: "'Mali', cursive", lang: "th" },
  { text: "6/2", font: "'Caveat', cursive", lang: "en" },
  { text: "ทุกคน", font: "'Mali', cursive", lang: "th" },
  { text: "602", font: "'Caveat', cursive", lang: "en" },
  { text: "GC14", font: "'Caveat', cursive", lang: "en" },
];
const GRAD_AT = Date.parse(CLASS.graduation);

/* ----------------------------- markup ----------------------------- */

const orbitCard = (c: HeroCard, i: number) => `
  <a class="orbit-card${c.float ? " float" : ""}" data-i="${i}" href="/album/${c.album.slug}" data-link aria-label="${esc(c.album.title)}">
    <div class="orbit-card-inner">
      <div class="profile-cover"><img src="${large(c.photo)}" alt="" draggable="false"></div>
      <div class="profile-body">
        <div class="avatar-row"><span class="avatar"><img src="${c.avatar}" alt="" draggable="false">${onlineDot()}</span></div>
        <div class="profile-info">
          <span class="profile-name">${esc(c.album.title)}</span>
          <span class="profile-role">${esc(c.album.en)} · ${albumCount(c.album)}</span>
        </div>
      </div>
    </div>
  </a>`;

const mobileDeck = (cards: HeroCard[]) =>
  cards
    .slice(0, 4)
    .map(
      (c, i) => `<a class="deck-card is-${"abcd"[i]}" href="/album/${c.album.slug}" data-link>
        <div class="orbit-card-inner">
          <div class="profile-cover"><img src="${thumb(c.photo.id)}" alt=""></div>
          <div class="profile-body"><div class="avatar-row"><span class="avatar"><img src="${c.avatar}" alt="">${onlineDot()}</span></div>
          <div class="profile-info"><span class="profile-name">${esc(c.album.title)}</span><span class="profile-role">${albumCount(c.album)}</span></div></div>
        </div></a>`,
    )
    .join("");

const rollDigit = () =>
  `<span class="roll"><span class="roll-col">${Array.from({ length: 10 }, (_, d) => `<span>${d}</span>`).join("")}</span></span>`;

const countdownTile = (label: string, digits: number) =>
  `<div class="tile"><span class="digits">${rollDigit().repeat(digits)}</span><span class="label">${label}</span></div>`;

const ctaButton = (label: string, target: string, cls = "") => `
  <a class="cta ${cls}" href="${target}" data-scroll="${target}">
    <span class="cta-band"><span class="cta-comet"><span class="cta-glow"></span><span class="cta-core"></span></span></span>
    <span class="cta-face">${label}</span>
  </a>`;

const nav = () => `
  <header class="site-nav" id="site-nav">
    <a class="nav-logo" href="/" data-link aria-label="${BRAND} home">${logoMark(20)}<span>${BRAND}</span></a>
    <div class="nav-actions">
      ${songNavButton("pill")}
      <a class="lang-pill nav-me nav-chat" href="/chat" data-link aria-label="แชท">${icon("chat", 16)}<span>แชท</span>${chatBadge()}</a>
      <a class="lang-pill nav-me" href="/me" data-link>${icon("user", 16)}<span>${myNo() ? "โปรไฟล์ฉัน" : "เข้าสู่ระบบ"}</span></a>
      <button class="lang-pill" type="button" data-albums>${icon("grid", 16)}<span>อัลบั้ม</span>${icon("chevronDown", 14)}</button>
      <a class="nav-cta" href="#classmates" data-scroll="#classmates">เพื่อน ${students.length} คน</a>
    </div>
  </header>`;

const hero = (cards: HeroCard[]) => `
  <section class="hero-track" id="top">
    <div class="hero">
      <div class="orbit">${cards.map(orbitCard).join("")}</div>
      <div class="mobile-deck">${mobileDeck(cards)}</div>
      <div class="hero-copy">
        <div class="hero-copy-main">
          <h1>
            <span class="heading-line hero-title">
              <span>ความทรงจำของ</span>
              <span class="hand-slot" aria-label="เรา"><span class="hand-word"></span></span>
            </span>
          </h1>
          <p>${CLASS.name} · ${CLASS.gen} · Class of ${CLASS.yearEn}<br><span class="muted">${totals.photos.toLocaleString()} รูป · ${totals.videos} คลิป · ${students.length} คน · 1 ห้อง</span></p>
        </div>
        <div class="countdown-wrap">
          <div class="countdown" role="timer" aria-label="นับถอยหลังวันจบ ม.6">
            ${countdownTile("วัน", 3)}${countdownTile("ชั่วโมง", 2)}${countdownTile("นาที", 2)}${countdownTile("วินาที", 2)}
          </div>
          <span class="countdown-label">นับถอยหลังสู่วันจบ ม.6</span>
        </div>
        <div class="hero-cta-stack">
          ${ctaButton("เริ่มดูความทรงจำ", "#showcase")}
          <a class="btn-outline" href="#classmates" data-scroll="#classmates">เพื่อนทั้ง ${students.length} คน</a>
        </div>
      </div>
      <button class="scroll-cue" type="button" data-scroll="#future">
        <span class="scroll-float"><span class="scroll-label">เลื่อนลง</span>${icon("chevronsDown", 20)}</span>
      </button>
    </div>
  </section>`;

/* ---- showcase shells (album "mini profiles") ---- */

const miniTiles = (photos: Photo[]) => {
  const cols: string[][] = [[], [], []];
  const h = [0, 0, 0];
  photos.slice(0, 12).forEach((p) => {
    const c = h.indexOf(Math.min(...h));
    h[c] += p.h / p.w;
    cols[c].push(
      `<div class="mp-tile" style="aspect-ratio:${p.w}/${p.h}"><img src="${thumb(p.id)}" alt="" loading="lazy"></div>`,
    );
  });
  return cols.map((c) => `<div class="sp-col">${c.join("")}</div>`).join("");
};

const miniAlbum = (a: Album, idx: number) => {
  const others = albums.filter((x) => x !== a);
  const sample = a.photos.length
    ? a.photos.filter((_, i) => i % Math.max(1, Math.floor(a.photos.length / 12)) === 0)
    : [];
  const videoTiles = a.videos
    .filter((v) => v.thumb)
    .slice(0, 9)
    .map((v) => ({ id: v.id, name: v.name, w: v.w ?? 16, h: v.h ?? 9 }) as Photo);
  return `
  <article class="sp-shell${idx === 0 ? " is-active" : ""}" data-idx="${idx}" id="album-${a.slug}">
    <div class="sp-label">อัลบั้ม ${esc(a.title)}</div>
    <div class="sp-card">
      <div class="sp-head">
        <div class="sp-id">
          <span class="sp-avatar is-square"><img src="${albumCoverSrc(a)}" alt=""></span>
          <div class="sp-id-text">
            <h3>${esc(a.title)}</h3>
            <div class="sp-handle"><a href="/album/${a.slug}" data-link>@602 · ${esc(a.en)}</a><span class="muted"> · </span><span>${albumCount(a)}</span></div>
            <p class="sp-bio">${esc(a.tagline)}</p>
            <div class="sp-stats">
              <div><b>${a.photos.length.toLocaleString()}</b><span>รูป</span></div>
              <div><b>${a.videos.length}</b><span>คลิป</span></div>
              <div><b>${a.groups.length || 1}</b><span>${a.groups.length ? "กลุ่ม" : "อัลบั้ม"}</span></div>
              <div><b>${students.length}</b><span>เพื่อน</span></div>
            </div>
          </div>
        </div>
        <div class="sp-cover-col">
          <div class="sp-cover"><img src="${albumCoverSrc(a)}" alt=""></div>
          <div class="sp-tags">${a.tags.map((t) => `<span class="chip">${esc(t.label)}</span>`).join("")}<span class="sp-loc">${icon("home", 12)} ${CLASS.name}</span></div>
        </div>
      </div>
      <nav class="sp-tabs"><span class="is-active">${a.photos.length >= a.videos.length ? "รูปภาพ" : "วิดีโอ"}</span><span>${a.photos.length >= a.videos.length ? "วิดีโอ" : "รูปภาพ"}</span><span>เกี่ยวกับ</span></nav>
      <div class="sp-body">
        <div class="sp-grid">${miniTiles(sample.length >= videoTiles.length ? sample : videoTiles)}</div>
        <aside class="sp-services">
          <div class="sp-services-head"><b>อัลบั้มอื่น</b><a href="/album/${a.slug}" data-link>ดูทั้งหมด</a></div>
          ${others
            .slice(0, 3)
            .map(
              (o) => `<a class="sp-service" href="/album/${o.slug}" data-link>
                <img src="${albumCover(o) ? thumb(albumCover(o).id) : albumCoverSrc(o)}" alt="">
                <div><b>${esc(o.title)}</b><span>${esc(o.en)}</span><span>${albumCount(o)}</span></div>
              </a>`,
            )
            .join("")}
        </aside>
      </div>
      <a class="sp-open" href="/album/${a.slug}" data-link>เปิดอัลบั้ม ${icon("arrowUpRight", 14)}</a>
    </div>
  </article>`;
};

const miniClassmates = (idx: number) => `
  <article class="sp-shell" data-idx="${idx}" id="album-classmates">
    <div class="sp-label">เพื่อน ${CLASS.name} ทั้ง ${students.length} คน</div>
    <div class="sp-card">
      <div class="sp-mates">${students
        .map(
          (s) =>
            `<a href="${profileUrl(s)}" data-link class="sp-mate"><img src="${studentAvatar(s)}" alt=""><span>${esc(s.nickname)}</span></a>`,
        )
        .join("")}</div>
      <a class="sp-open" href="#classmates" data-scroll="#classmates">ดูโปรไฟล์เพื่อน ${icon("arrowUpRight", 14)}</a>
    </div>
  </article>`;

const showcaseTabs = () => [...albums.map((a) => a.title), `เพื่อน ${students.length} คน`];

const future = () => `
  <section class="future" id="future">
    <div class="future-inner">
      <header class="future-head">
        <h2 class="future-title">
          <span class="future-lead">Best </span><span class="future-words">pe<span class="people-o" aria-hidden="true"><span class="people-o-glyph">o</span><span class="people-o-stack">${albums
            .flatMap((a) => featured(a).slice(0, 2))
            .slice(0, 6)
            .map(
              (p, i) =>
                `<span class="face" style="--o-face:${i}"><img src="${thumb(p.id)}" alt=""></span>`,
            )
            .join("")}</span></span>ple</span><span class="future-lead"> ever.</span>
        </h2>
        <p>ไม่ใช่แค่เพื่อนร่วมห้อง แต่คือคนที่อยู่ด้วยกันตลอด ม.ปลาย<br>นี่คือทุกอัลบั้มของ ${CLASS.name} เลื่อนลงเพื่อดูทีละอัลบั้ม</p>
      </header>
      <div class="showcase-track" id="showcase" style="--n:${showcaseTabs().length}">
        <div class="showcase-sticky">
          <div class="showcase-chrome">
            <div class="showcase-tabs" role="tablist">
              ${showcaseTabs()
                .map(
                  (t, i) =>
                    `<button class="showcase-tab${i === 0 ? " is-active" : ""}" role="tab" data-idx="${i}" style="--tab-i:${i}">${esc(t)}</button>`,
                )
                .join("")}
            </div>
            <div class="showcase-deck">${albums.map(miniAlbum).join("")}${miniClassmates(albums.length)}</div>
          </div>
        </div>
      </div>
      ${teachersSection()}
      <section class="classmates" id="classmates">
        <header>
          <div class="faces">${students
            .slice(0, 5)
            .map((s) => `<img src="${studentAvatar(s)}" alt="">`)
            .join("")}</div>
          <h2>เพื่อน ${CLASS.name} ทั้ง ${students.length} คน</h2>
          <p class="muted">กดที่เพื่อนเพื่อดูโปรไฟล์และความทรงจำ</p>
        </header>
        <div class="mates-grid">${students
          .map(
            (s) => `<a class="mate-card" href="${profileUrl(s)}" data-link>
              <img src="${studentAvatar(s)}" alt="" loading="lazy">
              <b>${esc(s.nickname)}</b>
              <span>${s.isPlaceholder ? "รอใส่ชื่อ" : `เลขที่ ${s.no}`}</span>
            </a>`,
          )
          .join("")}</div>
      </section>
      ${songSectionHtml()}
    </div>
  </section>`;

/** คุณครูประจำชั้น etc. (added / edited in /backend → ครู). Hidden until a teacher has a name. */
function teachersSection() {
  const list = teachers.filter((t) => t.name && !t.hidden);
  if (!list.length) return "";
  return `<section class="classmates teachers" id="teachers">
        <header>
          <h2>คุณครูของเรา</h2>
          <p class="muted">ขอบคุณที่ดูแล ${CLASS.name} มาตลอด</p>
        </header>
        <div class="mates-grid">${list
          .map(
            (t) => `<a class="mate-card" href="${teacherUrl(t)}" data-link>
              <img src="${teacherAvatar(t)}" alt="" loading="lazy">
              <b>${esc(teacherName(t))}</b>
              <span>${esc(t.role || t.subject || "คุณครู")}</span>
            </a>`,
          )
          .join("")}</div>
      </section>`;
}

const pain = () => `
  <section class="pain" data-theme="dark">
    <div class="pain-hold">
      <div class="pain-sticky">
        <div class="pain-head">
          <h2>ม.ปลายมันเหนื่อย...</h2>
          <p>แต่เราผ่านมันมาด้วยกัน (ลองลากโน้ตเล่นได้นะ)</p>
        </div>
        <div class="pain-notes">
          ${notes
            .map(
              (n, i) =>
                `<div class="pain-note" style="--note-bg:${n.bg};--note-rotate:${n.r}deg;left:${n.x}%;top:${n.y}%;width:${n.w}%;height:${n.h}%;--i:${i}"><p>${esc(n.text)}</p></div>`,
            )
            .join("")}
        </div>
      </div>
    </div>
  </section>`;

const underlineSvg = `<svg class="draw-underline" viewBox="0 0 300 20" preserveAspectRatio="none" aria-hidden="true"><path d="M4 12c40-6 90-9 150-8 50 1 100 4 142 8M30 16c60-5 140-6 230-2" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`;

const commission = () => `
  <section class="commission" id="commission">
    <div class="commission-card">
      <header class="commission-header">
        <h2><span class="muted">ห้องอื่นแค่ถ่ายรูป.</span><span class="accent">แต่เราเก็บความทรงจำ.${underlineSvg}</span></h2>
      </header>
      <div class="commission-rows">
        <div class="commission-row">
          <div class="commission-visual byoc">
            <div class="byoc-client"><span class="faces">${students
              .slice(6, 9)
              .map((s) => `<img src="${studentAvatar(s)}" alt="">`)
              .join("")}</span><span>ทุกคนในห้อง</span></div>
            <svg class="byoc-arrow" viewBox="0 0 220 160" aria-hidden="true"><path d="M20 10c-10 60 10 110 70 125 40 10 80 0 110-10" fill="none" stroke="#2b313b" stroke-width="2.4" stroke-linecap="round"/><path d="m188 112 14 13-17 8" fill="none" stroke="#2b313b" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <div class="zero-mark">100<span>%</span></div>
          </div>
          <div class="commission-copy">
            <h3>ทุกรูปจาก Drive ของห้อง <b>ครบ <span class="grad-text">100%!</span></b></h3>
            <p>รวม ${totals.photos.toLocaleString()} รูปและ ${totals.videos} คลิปจากทุกโฟลเดอร์ไว้ที่เดียว ทั้งถ่ายรูปรุ่น G1–G6 ชีวิตประจำวัน วันลาบ TEP และคลิปโมเม้น ไม่ต้องไล่เปิดทีละลิงก์อีกแล้ว</p>
            <button class="text-link" type="button" data-albums>ดูอัลบั้มทั้งหมด ${icon("chevronRight", 14)}</button>
          </div>
        </div>
        <hr class="commission-rule">
        <div class="commission-row">
          <div class="commission-visual connect" data-total="${totals.photos}">
            <div class="chat"><img src="${studentAvatar(students[11])}" alt=""><span class="bubble"><span class="typed" data-text="เฮ้ย ใครมีรูปวันลาบบ้าง ส่งมาหน่อยยย 🙏"></span></span></div>
            <div class="fee-card">
              <div class="fee-top"><span>รวมรูปแล้ว</span><b class="fee-rate">0%</b></div>
              <div class="fee-meta">จากทุกคนในห้อง <span class="fee-amount">0</span><span class="muted">/${totals.photos.toLocaleString()}</span></div>
              <div class="fee-bar"><span></span></div>
            </div>
          </div>
          <div class="commission-copy">
            <h3>ลืมไปแล้วว่าใครถ่าย?<br><b class="sweep-text">ไม่เป็นไร เราเก็บไว้ให้หมดแล้ว</b></h3>
            <p>ทุกรูปเปิดดูแบบเต็มความละเอียดได้ทันที คลิปก็กดเล่นได้เลยในหน้าเว็บ และกดลูกศรซ้ายขวาเพื่อดูรูปถัดไปได้</p>
          </div>
        </div>
      </div>
    </div>
  </section>`;

const messageCards = () => {
  // approved public messages first; sample cards top the row up so the marquee stays full
  const real = wall
    .slice(0, 12)
    .map((p) => ({ text: p.text, from: p.from, to: p.to as number | undefined }));
  const list = real.length >= 4 ? real : [...real, ...messages.slice(0, 4 - real.length)];
  const set = list
    .map((m) => {
      const from = getStudent(m.from) ?? students[0];
      const to = "to" in m && typeof m.to === "number" ? getStudent(m.to) : undefined;
      return `<div class="cred-card"><div class="cred-rating">${icon("heart", 14)} ${to ? `ถึง ${esc(to.nickname)}` : "ถึงเพื่อน"}</div><p>“${esc(m.text)}”</p><div class="cred-author"><img src="${studentAvatar(from)}" alt=""><span>${esc(from.nickname)}</span></div></div>`;
    })
    .join("");
  return `<div class="cred-marquee"><div class="cred-set">${set}${set}</div></div>`;
};

const platform = () => {
  const s = students[0];
  const s12 = students[11];
  const s13 = students[12];
  const grid = albums.find((a) => a.slug === "life")!.photos;
  return `
  <section class="platform" data-theme="dark" id="platform">
    <h2 class="platform-title">ทุกอย่างของ ${CLASS.name} อยู่ที่นี่</h2>
    <div class="platform-rows">
      <div class="platform-row">
        <div class="stage stage-doc">
          <div class="doc-col">
            <div class="doc-profile">
              <div class="doc-head"><img src="${studentAvatar(s)}" alt=""><div><b>${esc(s.nickname)}</b><span>@602.01 · เลขที่ 1</span></div></div>
              <p>${esc(s.quote)}</p>
              <span class="doc-loc">${icon("home", 12)} ${CLASS.name} · ${CLASS.gen}</span>
            </div>
            <div class="doc-gap"></div>
            <div class="doc-stats"><div><b>1</b><span>เลขที่</span></div><div><b>${albums.length}</b><span>อัลบั้ม</span></div><div><b>24</b><span>ความทรงจำ</span></div><div><b>${students.length - 1}</b><span>เพื่อน</span></div></div>
            <div class="doc-grid"><img src="${thumb(grid[10].id)}" alt=""><img src="${thumb(grid[40].id)}" alt=""></div>
          </div>
          ${messageCards()}
        </div>
        <div class="platform-copy"><h3><b class="grad-sweep">Profile</b> <span>ของเพื่อนทุกคน</span></h3><a class="platform-link" href="/chat/public" data-link>${icon("heart", 16)} เขียนข้อความถึงเพื่อน ${icon("arrowUpRight", 14)}</a></div>
      </div>
      <div class="platform-row is-reverse">
        <div class="stage stage-ai">
          <div class="ai-box">
            <div class="ai-q">อยากหาใคร?</div>
            <div class="ai-input">${icon("search", 14)}<span class="typed-ai" data-text="เลขที่ 12"></span><span class="caret"></span></div>
          </div>
          <div class="ai-results">
            ${[s12, s13]
              .map(
                (x) =>
                  `<a class="ai-service" href="${profileUrl(x)}" data-link><img src="${studentAvatar(x)}" alt=""><div><b>${esc(x.nickname)}</b><p>${esc(x.quote)}</p><span>${CLASS.name} · <b>เลขที่ ${x.no}</b></span></div></a>`,
              )
              .join("")}
          </div>
        </div>
        <div class="platform-copy"><h3><span class="block">หาเพื่อนเจอ</span><b class="grad-sweep">ในพริบตา</b></h3></div>
      </div>
      <div class="platform-row">
        <div class="stage stage-secure">
          <div class="rings">${[1, 2, 3, 4].map((i) => `<span style="--r:${i}"></span>`).join("")}</div>
          <svg class="secure-dash" viewBox="0 0 400 20" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="10" x2="400" y2="10" stroke="#9fb3d9" stroke-width="2" stroke-dasharray="6 6"/><line class="dash-hi" x1="0" y1="10" x2="400" y2="10" stroke="#2483ff" stroke-width="2.5" stroke-dasharray="40 360"/></svg>
          <img class="secure-av left" src="${studentAvatar(students[20])}" alt="">
          <img class="secure-av right" src="${studentAvatar(students[33])}" alt="">
          <div class="shield">${logoMark(34)}</div>
          <div class="flags">${albums
            .map((a) => albumCover(a))
            .filter(Boolean)
            .map((p) => `<img class="flag" src="${thumb(p.id)}" alt="">`)
            .join("")}</div>
        </div>
        <div class="platform-copy">
          <h3><b class="grad-sweep">เก็บไว้</b> <span>ตลอดไป</span></h3>
          <ul class="checks"><li>${icon("check", 16)} ทุกรูปจาก Google Drive ของห้อง</li><li>${icon("check", 16)} เปิดดูได้ทุกที่ ทุกเวลา</li></ul>
        </div>
      </div>
      <div class="platform-row is-reverse">
        <div class="stage stage-orders">
          <div class="order-list">
            ${albums
              .slice(0, 4)
              .map(
                (a) =>
                  `<a class="order" href="/album/${a.slug}" data-link><div class="order-main"><b>${esc(a.title)}</b><span>${esc(a.en)} · ${CLASS.name}</span></div><div class="order-side"><b>${a.photos.length.toLocaleString()}</b><span class="chips"><span class="dot is-paid"></span>${a.photos.length ? `<span class="chip-s is-paid">รูป</span>` : ""}${a.videos.length ? `<span class="chip-s is-new">${a.videos.length} คลิป</span>` : ""}</span></div></a>`,
              )
              .join("")}
          </div>
          <div class="quote-card"><b>Class of ${CLASS.yearEn}</b><span>${CLASS.name} · ${CLASS.gen}</span><strong>${totals.photos.toLocaleString()}</strong><em>รูปความทรงจำ ใน ${albums.length} อัลบั้ม</em><div class="quote-doc"><i></i><i></i><i></i></div></div>
        </div>
        <div class="platform-copy"><h3><span class="block">ทุกโมเมนต์</span><b class="grad-sweep">เรียงไว้แล้ว</b></h3></div>
      </div>
    </div>
  </section>`;
};

const footer = () => `
  <footer class="site-footer" data-theme="dark">
    <div class="footer-inner">
      <a class="nav-logo" href="/" data-link>${logoMark(20)}<span>${BRAND}</span></a>
      <nav><a href="#showcase" data-scroll="#showcase">อัลบั้ม</a><a href="#classmates" data-scroll="#classmates">เพื่อน</a><a href="#platform" data-scroll="#platform">ทั้งหมด</a><a href="/backend" data-link>แก้ไขข้อมูล</a></nav>
      <span class="muted">${CLASS.name} · ${CLASS.gen} · Class of ${CLASS.yearEn}</span>
    </div>
  </footer>`;

const albumsModal = () => `
  <div class="why" hidden>
    <div class="why-backdrop" data-why-close></div>
    <div class="why-panel" role="dialog" aria-modal="true" aria-labelledby="why-title">
      <button class="why-close" type="button" data-why-close aria-label="ปิด">${icon("close", 20)}</button>
      <h3 id="why-title">อัลบั้มทั้งหมด</h3>
      <p class="why-intro">${totals.photos.toLocaleString()} รูป และ ${totals.videos} คลิป จาก Google Drive ของ ${CLASS.name}</p>
      <ul class="why-list why-albums">
        ${albums
          .map(
            (a) =>
              `<li><a href="/album/${a.slug}" data-link><img src="${albumCover(a) ? thumb(albumCover(a).id) : albumCoverSrc(a)}" alt=""><div><b>${esc(a.title)}</b><span>${esc(a.en)} · ${albumCount(a)}</span></div></a></li>`,
          )
          .join("")}
      </ul>
      ${ctaButton(`ดูเพื่อนทั้ง ${students.length} คน`, "#classmates", "is-block")}
    </div>
  </div>`;

/* ----------------------------- behaviour ----------------------------- */

export function renderLanding(root: HTMLElement, opts: { splash: boolean }): Cleanup {
  document.title = `${BRAND} · ${CLASS.name} ${CLASS.gen}`;
  document.body.className = "page-landing";
  const HERO = heroCards();
  root.innerHTML = `<div class="landing-root">${nav()}<main class="landing">${hero(HERO)}${future()}${pain()}${commission()}${platform()}</main>${footer()}${albumsModal()}</div>`;
  // listeners go on this page's own wrapper so they're dropped when another page renders
  const pageEl = root.querySelector<HTMLElement>(".landing-root")!;
  bindSongPlayers(pageEl);

  const disposers: (() => void)[] = [];
  const on = <K extends keyof WindowEventMap>(
    t: K,
    fn: (e: WindowEventMap[K]) => void,
    o?: AddEventListenerOptions,
  ) => {
    window.addEventListener(t, fn, o);
    disposers.push(() => window.removeEventListener(t, fn));
  };
  const timers = new Set<number>();
  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  };
  let alive = true;

  const $ = <T extends Element = HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const $$ = <T extends Element = HTMLElement>(s: string) => [...root.querySelectorAll<T>(s)];

  const heroEl = $(".hero");
  const navEl = $("#site-nav");
  const cards = $$<HTMLAnchorElement>(".orbit-card");
  const isMobile = () => matchMedia("(max-width: 819px)").matches;
  const reduced = prefersReducedMotion();

  /* ---------- hero card geometry ---------- */
  type Geo = { left: number; top: number; w: number; h: number; cx: number; cy: number };
  let geo: Geo[] = [];
  let vw = innerWidth;
  let vh = innerHeight;
  const scaleNow = () => clamp(Math.min(vh / 675, vw / 1250), 0.72, 1.3);

  function layout() {
    vw = document.documentElement.clientWidth;
    vh = innerHeight;
    const s = scaleNow();
    // Keep cards clear of the text: measure the widest line of copy (headline / countdown /
    // buttons) and push out only the cards that sit at the same height as the copy.
    const copy = heroEl.querySelector<HTMLElement>(".hero-copy")!;
    const widest = Math.max(
      ...[...copy.querySelectorAll<HTMLElement>("h1, .countdown, .hero-cta-stack")].map(
        (el) => el.scrollWidth,
      ),
    );
    const safeX = vw / 2 - widest / 2 - 28; // cards must stay left of this (mirrored on the right)
    const copyTop = vh / 2 - copy.offsetHeight / 2 - 10;
    const copyBottom = vh / 2 + copy.offsetHeight / 2 + 10;
    let push = 0;
    for (const c of HERO) {
      const top = vh / 2 + (c.y - 337.5) * s;
      const bottom = top + c.w * s * CARD_RATIO;
      if (bottom < copyTop || top > copyBottom) continue;
      push = Math.max(push, (c.x + c.w) * s - safeX);
    }
    geo = HERO.map((c, i) => {
      const w = c.w * s;
      const h = w * CARD_RATIO;
      const top = vh / 2 + (c.y - 337.5) * s;
      const left = c.side === "left" ? c.x * s - push : vw - (c.x * s - push) - w;
      const el = cards[i];
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      el.style.setProperty("--u", `${w / 302}px`);
      return { left, top, w, h, cx: left + w / 2, cy: top + h / 2 };
    });
  }

  function place(
    i: number,
    px: number,
    py: number,
    rot: number,
    sc: number,
    e: number,
    opacity = 1,
  ) {
    const g = geo[i];
    const el = cards[i];
    el.style.transform = `translate(${px - g.cx}px, ${py - g.cy}px) rotate(${rot}deg) scale(${sc})`;
    el.style.setProperty("--e", e.toFixed(4));
    el.style.opacity = opacity.toFixed(3);
  }

  /* ---------- splash (loader) ---------- */
  let splashDone = false;
  const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);
  const easeOutBack = (t: number) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);

  function finishSplash() {
    splashDone = true;
    heroEl.classList.add("is-splash-done", "is-copy-in");
    document.documentElement.classList.remove("is-loading");
    applyScroll();
    startHand();
  }

  function runSplash() {
    document.documentElement.classList.add("is-loading");
    heroEl.classList.add("is-splashing");
    const N = cards.length;
    const start = performance.now();
    const MIN_SPIN = 1250;
    let ready = false;
    let releaseAt = 0;
    let thetaAtRelease = 0;
    const flyStart: number[] = Array.from({ length: N }, () => 0);
    const ringPosAtFly: { x: number; y: number; r: number; s: number }[] = [];

    // Wait for the class photos on the cards (or a timeout) so they land fully painted.
    const imgs = cards.map((c) => c.querySelector("img")!);
    const loaded = Promise.all(
      imgs.map((im) =>
        im.complete
          ? Promise.resolve()
          : new Promise<void>((r) => {
              im.addEventListener("load", () => r(), { once: true });
              im.addEventListener("error", () => r(), { once: true });
            }),
      ),
    );
    void Promise.race([loaded, new Promise((r) => setTimeout(r, 3500))]).then(() => (ready = true));

    const theta = (t: number) => {
      const sec = t / 1000;
      return sec < 0.6 ? (80 * (sec * sec)) / 1.2 : 80 * (sec - 0.3);
    };

    const frame = (now: number) => {
      if (!alive) return;
      const t = now - start;
      const R = Math.min(vw, vh) * 0.4;
      const cx = vw / 2;
      const cy = vh / 2;
      if (ready && !releaseAt && t > MIN_SPIN) {
        releaseAt = t;
        thetaAtRelease = theta(t);
        for (let i = 0; i < N; i++) flyStart[i] = t + i * 55;
        later(() => heroEl.classList.add("is-copy-in"), 520);
      }
      let finished = 0;
      for (let i = 0; i < N; i++) {
        const base = -90 + (360 / N) * i;
        const th = releaseAt ? thetaAtRelease + (t - releaseAt) * 0.03 : theta(t);
        const a = ((base + th) * Math.PI) / 180;
        const ring = {
          x: cx + R * Math.cos(a),
          y: cy + R * Math.sin(a),
          r: HERO[i].r * 2.2 + Math.sin(a) * 6,
          s: 112 / HERO[i].w / scaleNow(),
        };
        const appear = clamp((t - i * 70) / 260);
        if (!releaseAt || t < flyStart[i]) {
          ringPosAtFly[i] = ring;
          place(i, ring.x, ring.y, ring.r, ring.s * easeOutBack(appear), 0, appear);
          continue;
        }
        const p = clamp((t - flyStart[i]) / 1250);
        const k = easeOut(p);
        const from = ringPosAtFly[i];
        const g = geo[i];
        const midLift = Math.sin(Math.PI * k) * 28;
        place(
          i,
          from.x + (g.cx - from.x) * k,
          from.y + (g.cy - from.y) * k - midLift,
          from.r + (HERO[i].r - from.r) * k,
          from.s + (1 - from.s) * k,
          clamp((p - 0.25) / 0.6),
        );
        if (p >= 1) finished++;
      }
      if (finished === N) {
        heroEl.classList.remove("is-splashing");
        finishSplash();
        return;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  /* ---------- scroll-driven effects ---------- */
  const futureEl = $(".future");
  const futureInner = $(".future-inner");
  const track = $(".showcase-track");
  const sticky = $(".showcase-sticky");
  const tabs = $$<HTMLButtonElement>(".showcase-tab");
  const shells = $$(".sp-shell");
  const chrome = $(".showcase-chrome");
  const commissionCard = $(".commission-card");
  let activeIdx = 0;

  function setActive(i: number) {
    if (i === activeIdx) return;
    activeIdx = i;
    tabs.forEach((t, j) => {
      t.classList.toggle("is-active", j === i);
      t.setAttribute("aria-selected", String(j === i));
    });
    shells.forEach((s, j) => {
      s.classList.toggle("is-active", j === i);
      s.classList.toggle("is-before", j < i);
    });
    if (isMobile())
      tabs[i].scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }

  function applyScroll() {
    const y = scrollY;
    navEl.classList.toggle("is-scrolled", y > vh * 0.55);
    const probe = 36;
    const dark = $$("[data-theme=dark]").some((s) => {
      const r = s.getBoundingClientRect();
      return r.top <= probe && r.bottom >= probe;
    });
    const commissionR = commissionCard.getBoundingClientRect();
    const overLight = [commissionR, futureInner.getBoundingClientRect()].some(
      (r) => r.top <= probe && r.bottom >= probe,
    );
    navEl.classList.toggle("is-dark", dark && !overLight);

    // hero exit: cards scatter and copy blurs away
    const exit = clamp(y / (vh * 0.85));
    heroEl.style.setProperty("--exit", exit.toFixed(4));
    if (splashDone && !isMobile()) {
      for (let i = 0; i < cards.length; i++) {
        const g = geo[i];
        const dx = g.cx - vw / 2;
        const dy = g.cy - vh / 2;
        const len = Math.hypot(dx, dy) || 1;
        const dist = exit * Math.max(vw, vh) * 0.32;
        place(
          i,
          g.cx + (dx / len) * dist,
          g.cy + (dy / len) * dist,
          HERO[i].r * (1 + exit * 1.5),
          1,
          1,
          1 - exit * 0.5,
        );
      }
    }

    // showcase: map scroll progress to the active album
    const tr = track.getBoundingClientRect();
    const span = tr.height - sticky.offsetHeight;
    const prog = clamp((-tr.top + parseFloat(getComputedStyle(sticky).top)) / Math.max(1, span));
    if (!isMobile()) {
      chrome.classList.toggle("is-rail-in", prog > 0.03);
      setActive(Math.min(shells.length - 1, Math.floor(prog * shells.length * 0.999)));
    }

    const fr = futureEl.getBoundingClientRect();
    const shrink = isMobile() ? 0 : clamp((vh - fr.bottom) / (vh * 0.7));
    futureInner.style.setProperty("--shrink", shrink.toFixed(4));

    const enter = clamp(1 - (commissionR.top - vh * 0.1) / (vh * 0.8));
    commissionCard.style.setProperty("--enter", enter.toFixed(4));
  }

  let ticking = false;
  on(
    "scroll",
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        if (alive) applyScroll();
      });
    },
    { passive: true },
  );
  on("resize", () => {
    layout();
    applyScroll();
  });

  // Tab click -> scroll to that album's slice of the track.
  tabs.forEach((t) =>
    t.addEventListener("click", () => {
      const i = Number(t.dataset.idx);
      if (isMobile()) return setActive(i);
      const top =
        track.getBoundingClientRect().top + scrollY - parseFloat(getComputedStyle(sticky).top);
      const span = track.offsetHeight - sticky.offsetHeight;
      window.scrollTo({ top: top + span * ((i + 0.5) / shells.length), behavior: "smooth" });
    }),
  );

  if (isMobile()) {
    const deck = $(".showcase-deck");
    let sx = 0;
    deck.addEventListener("touchstart", (e) => (sx = e.touches[0].clientX), { passive: true });
    deck.addEventListener("touchend", (e) => {
      const dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 40) setActive(clamp(activeIdx + (dx < 0 ? 1 : -1), 0, shells.length - 1));
    });
  }

  /* ---------- smooth anchor scroll + albums panel ---------- */
  const scrollToSel = (sel: string, smooth = true) => {
    const target = root.querySelector<HTMLElement>(sel);
    if (!target) return;
    // the showcase track starts with a sticky offset; land on its first album
    const top = target.getBoundingClientRect().top + scrollY - (sel === "#classmates" ? 72 : 0);
    window.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
  };
  pageEl.addEventListener("click", (e) => {
    const t = e.target as Element;
    const s = t.closest<HTMLElement>("[data-scroll]");
    if (s) {
      e.preventDefault();
      if (!why.hidden) closeWhy();
      scrollToSel(s.dataset.scroll!);
      return;
    }
    if (t.closest("[data-albums]")) openWhy();
    if (t.closest("[data-why-close]")) closeWhy();
    if (t.closest(".why a[data-link]")) closeWhy();
  });

  const why = $(".why");
  function openWhy() {
    why.hidden = false;
    requestAnimationFrame(() => why.classList.add("is-open"));
    document.documentElement.style.overflow = "hidden";
    why.querySelector<HTMLElement>(".why-close")!.focus();
  }
  function closeWhy() {
    why.classList.remove("is-open");
    document.documentElement.style.overflow = "";
    later(() => (why.hidden = true), 300);
  }
  on("keydown", (e) => {
    if (e.key === "Escape" && !why.hidden) closeWhy();
  });

  /* ---------- handwritten word cycle ---------- */
  const slot = $(".hand-slot");
  const word = $(".hand-word");
  let handStarted = false;
  function startHand() {
    if (handStarted) return;
    handStarted = true;
    let i = 0;
    const measure = document.createElement("span");
    measure.className = "hand-measure";
    slot.parentElement!.appendChild(measure);
    // Fix the slot to the widest word (in em, so it scales with the headline) so the
    // headline never shifts sideways while the words change.
    const sizeSlot = () => {
      const em = parseFloat(getComputedStyle(slot).fontSize) || 1;
      let max = 0;
      for (const w of HAND_WORDS) {
        measure.style.fontFamily = w.font;
        measure.lang = w.lang;
        measure.textContent = w.text;
        max = Math.max(max, measure.offsetWidth);
      }
      slot.style.width = `${(max + 6) / em}em`;
    };
    sizeSlot();
    void document.fonts?.ready.then(() => alive && sizeSlot());
    const show = () => {
      if (!alive) return;
      const w = HAND_WORDS[i % HAND_WORDS.length];
      word.textContent = w.text;
      word.style.fontFamily = w.font;
      word.lang = w.lang;
      word.classList.remove("is-erase");
      word.classList.add("is-draw");
      later(
        () => {
          word.classList.remove("is-draw");
          word.classList.add("is-erase");
          later(() => {
            i++;
            show();
          }, 420);
        },
        i % HAND_WORDS.length === 0 ? 2600 : 1700,
      );
    };
    show();
  }

  /* ---------- countdown to graduation ---------- */
  const tiles = $$(".tile");
  const cdLabel = $(".countdown-label");
  function tick() {
    const now = Date.now();
    let s = Math.max(0, Math.floor((GRAD_AT - now) / 1000));
    if (s === 0) cdLabel.textContent = "เราเรียนจบแล้ว 🎓";
    const days = Math.min(999, Math.floor(s / 86400));
    s %= 86400;
    const vals = [days, Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60];
    tiles.forEach((tile, k) => {
      const cols = [...tile.querySelectorAll<HTMLElement>(".roll-col")];
      const str = String(vals[k]).padStart(cols.length, "0");
      cols.forEach((c, j) => (c.style.transform = `translateY(${-Number(str[j]) * 10}%)`));
    });
  }
  tick();
  const tickId = window.setInterval(tick, 1000);
  disposers.push(() => clearInterval(tickId));

  /* ---------- in-view reveals ---------- */
  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        const el = en.target as HTMLElement;
        el.classList.add("is-in");
        io.unobserve(el);
        if (el.classList.contains("future-title")) {
          const o = el.querySelector(".people-o")!;
          later(() => o.classList.add("is-stack"), 250);
          later(() => o.classList.add("is-expanded"), 1300);
        }
        el.querySelectorAll<HTMLElement>("[data-text]").forEach((t) => typeText(t));
        if (el.classList.contains("connect")) runCounter(el);
      }
    },
    { threshold: 0.3 },
  );
  $$(
    ".future-title, .pain-notes, .commission-header, .commission-visual, .platform-row, .classmates",
  ).forEach((el) => io.observe(el));
  disposers.push(() => io.disconnect());

  function typeText(el: HTMLElement) {
    // split into graphemes so Thai vowel marks and emoji are typed as whole characters
    const full = [
      ...new Intl.Segmenter("th", { granularity: "grapheme" }).segment(el.dataset.text ?? ""),
    ].map((s) => s.segment);
    const loops = el.classList.contains("typed-ai");
    const stage = el.closest(".stage");
    let n = 0;
    const step = () => {
      if (!alive) return;
      el.textContent = full.slice(0, n).join("");
      if (n < full.length) {
        n++;
        later(step, 38 + Math.random() * 40);
        return;
      }
      if (!loops) return;
      stage?.classList.add("has-results");
      later(() => {
        stage?.classList.remove("has-results");
        n = 0;
        later(step, 600);
      }, 3600);
    };
    step();
  }

  function runCounter(el: HTMLElement) {
    const total = Number(el.dataset.total ?? 100);
    const amt = el.querySelector<HTMLElement>(".fee-amount")!;
    const rate = el.querySelector<HTMLElement>(".fee-rate")!;
    const bar = el.querySelector<HTMLElement>(".fee-bar span")!;
    const t0 = performance.now();
    const loop = (now: number) => {
      if (!alive) return;
      const p = clamp((now - t0 - 1600) / 2600);
      const eased = 1 - Math.pow(1 - p, 3);
      amt.textContent = Math.round(eased * total).toLocaleString();
      bar.style.width = `${eased * 100}%`;
      rate.textContent = `${Math.round(eased * 100)}%`;
      el.classList.toggle("is-capped", p >= 1);
      if (p < 1) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /* ---------- draggable sticky notes ---------- */
  $$(".pain-note").forEach((note) => {
    let sx = 0,
      sy = 0,
      ox = 0,
      oy = 0;
    note.addEventListener("pointerdown", (e) => {
      if (isMobile()) return;
      note.setPointerCapture(e.pointerId);
      note.classList.add("dragging");
      sx = e.clientX;
      sy = e.clientY;
      ox = parseFloat(note.dataset.dx ?? "0");
      oy = parseFloat(note.dataset.dy ?? "0");
      note.style.zIndex = String(Date.now() % 100000);
    });
    note.addEventListener("pointermove", (e) => {
      if (!note.classList.contains("dragging")) return;
      const dx = ox + e.clientX - sx;
      const dy = oy + e.clientY - sy;
      note.dataset.dx = String(dx);
      note.dataset.dy = String(dy);
      note.style.translate = `${dx}px ${dy}px`;
    });
    const end = () => note.classList.remove("dragging");
    note.addEventListener("pointerup", end);
    note.addEventListener("pointercancel", end);
  });

  /* ---------- go ---------- */
  layout();
  if (opts.splash && !reduced && !isMobile()) runSplash();
  else finishSplash();
  applyScroll();

  // deep links like /#classmates or /#showcase (e.g. from the album/student pages)
  if (location.hash) later(() => scrollToSel(location.hash, false), 60);

  return () => {
    alive = false;
    disposers.forEach((d) => d());
    timers.forEach((t) => clearTimeout(t));
    document.documentElement.classList.remove("is-loading");
    document.documentElement.style.overflow = "";
  };
}
