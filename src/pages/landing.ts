import {
  BRAND,
  CLASS,
  albums,
  featured,
  getStudent,
  large,
  messages,
  notes,
  photoExif,
  photoTags,
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
import { myNo, session } from "../lib/api.ts";
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
  { text: "พวกเรา", font: "'Mali', cursive", lang: "th" },
  { text: "กิฟคอม", font: "'Mali', cursive", lang: "th" },
  { text: "ทุกคน", font: "'Mali', cursive", lang: "th" },
  { text: "TEP", font: "'Mali', cursive", lang: "th" },
  { text: "GC14", font: "'Mali', cursive", lang: "th" },
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
              <span class="hand-slot" aria-label="เรา"><span class="hand-word"></span><svg class="hand-line" viewBox="0 0 200 24" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="hand-ink" x1="0" x2="1"><stop offset="0" stop-color="#82bcff"/><stop offset=".35" stop-color="#2483ff"/><stop offset=".7" stop-color="#ff66f4"/><stop offset="1" stop-color="#fe7b02"/></linearGradient></defs><path pathLength="1" d="M4 15C38 7 74 18 108 11S170 6 196 13"/></svg></span>
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
        <p>ไม่ใช่แค่เพื่อนร่วมห้อง แต่คือคนที่อยู่ด้วยกันตลอด ม.ปลาย<br>เลื่อนลงเพื่อย้อนดูทุกช่วงของ ${CLASS.name}</p>
      </header>
      ${timeline()}
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

/* ---- timeline: every album, as stops along the 3 years (horizontal) ---- */

type Stop = {
  key: string;
  /** "YYYY-MM" (or "0000" for the everyday chapter, "9999" for graduation) */
  date: string;
  label: string;
  sub: string;
  title: string;
  album?: Album;
  photos: Photo[];
  count: number;
  videos: number;
};
const TH_MONTHS = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];
const gradDate = new Date(GRAD_AT);
// the school year starts in May; ม.6 is the year that ends with graduation
const M6_START = gradDate.getMonth() < 4 ? gradDate.getFullYear() - 1 : gradDate.getFullYear();
const gradeOf = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  const start = m >= 5 ? y : y - 1;
  const g = 6 - (M6_START - start);
  return g >= 4 && g <= 6 ? `ม.${g}` : "";
};
const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return `${TH_MONTHS[m - 1]} ${y + 543}`;
};

function timelineStops(): Stop[] {
  const stops: Stop[] = [];
  for (const a of albums) {
    const byMonth = new Map<string, Photo[]>();
    const undated: Photo[] = [];
    for (const p of a.photos) {
      const d = photoExif(p.id).date;
      if (d && d >= "2020") byMonth.set(d.slice(0, 7), [...(byMonth.get(d.slice(0, 7)) ?? []), p]);
      else undated.push(p);
    }
    // tiny clusters aren't worth a stop of their own
    // (deleting the current entry while iterating a Map is safe)
    for (const [ym, list] of byMonth) {
      if (list.length < 3) {
        undated.push(...list);
        byMonth.delete(ym);
      }
    }
    const months = [...byMonth.keys()].sort();
    if (months.length === 1 || (!months.length && (undated.length || a.videos.length))) {
      // one event (a shoot, a trip): everything in one stop
      const ym = months[0];
      stops.push({
        key: a.slug,
        date: ym ?? "0001",
        label: ym ? monthLabel(ym) : "ตลอด ม.ปลาย",
        sub: ym ? gradeOf(ym) : "",
        title: a.title,
        album: a,
        photos: [...(byMonth.get(ym) ?? []), ...undated],
        count: a.photos.length,
        videos: a.videos.length,
      });
      continue;
    }
    for (const ym of months)
      stops.push({
        key: `${a.slug}-${ym}`,
        date: ym,
        label: monthLabel(ym),
        sub: gradeOf(ym),
        title: a.title,
        album: a,
        photos: byMonth.get(ym)!,
        count: byMonth.get(ym)!.length,
        videos: 0,
      });
    if (undated.length || a.videos.length)
      stops.push({
        key: `${a.slug}-all`,
        date: "0000",
        label: "ตลอด ม.ปลาย",
        sub: "ม.4 – ม.6",
        title: `${a.title} · ทุกวันของเรา`,
        album: a,
        photos: undated,
        count: undated.length,
        videos: a.videos.length,
      });
  }
  stops.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
  stops.push({
    key: "grad",
    date: "9999",
    label: `${gradDate.getDate()} ${TH_MONTHS[gradDate.getMonth()]} ${gradDate.getFullYear() + 543}`,
    sub: "ม.6",
    title: "วันจบ ม.6",
    photos: [],
    count: 0,
    videos: 0,
  });
  return stops;
}

const tlStop = (s: Stop, i: number) => {
  // a spread of photos from the whole stop, not just the first few
  // (offset by half a step so a stop never opens on its first file, often a sign / test shot)
  const step = Math.max(1, Math.floor(s.photos.length / 3));
  const pics = [0, 1, 2]
    .map((k) => s.photos[Math.min(s.photos.length - 1, k * step + Math.floor(step / 2))])
    .filter((p, k, arr) => p && arr.indexOf(p) === k);
  const vids = s.album?.videos.filter((v) => v.thumb).slice(0, 3 - pics.length) ?? [];
  const meta = [s.count ? `${s.count.toLocaleString()} รูป` : "", s.videos ? `${s.videos} คลิป` : ""]
    .filter(Boolean)
    .join(" · ");
  const days = Math.max(0, Math.ceil((GRAD_AT - Date.now()) / 86_400_000));
  const inner = s.album
    ? `<div class="tl-photos n-${pics.length + vids.length}">${pics
        .map((p) => `<img src="${thumb(p.id)}" alt="" loading="lazy">`)
        .join(
          "",
        )}${vids.map((v) => `<img src="${thumb(v.id)}" alt="" loading="lazy">`).join("")}</div>
      <div class="tl-text"><b>${esc(s.title)}</b><span>${meta}</span></div>`
    : `<div class="tl-grad"><span class="tl-grad-faces">${students
        .slice(0, 6)
        .map((st) => `<img src="${studentAvatar(st)}" alt="">`)
        .join(
          "",
        )}</span><b>${esc(s.title)}</b><span>${days ? `อีก ${days.toLocaleString()} วัน` : "วันนี้แหละ 🎓"}</span></div>`;
  const href = s.album
    ? `/album/${s.album.slug}${s.photos[0] ? `#photo=${s.photos[0].id}` : ""}`
    : "#classmates";
  return `<li class="tl-stop${s.album ? "" : " is-grad"}" style="--i:${i}">
    <span class="tl-when"><b>${s.label}</b>${s.sub ? `<small>${s.sub}</small>` : ""}</span>
    <span class="tl-dot" aria-hidden="true"></span>
    <a class="tl-card" href="${href}" ${s.album ? "data-link" : `data-scroll="#classmates"`}>${inner}</a>
  </li>`;
};

const timeline = () => `
      <section class="tl" id="showcase" aria-label="ไทม์ไลน์ความทรงจำ">
        <div class="tl-sticky">
          <header class="tl-head">
            <span class="tl-kicker">${icon("clock", 14)} ไทม์ไลน์</span>
            <h2>3 ปีของ ${CLASS.name} ตั้งแต่ ม.4 จนวันจบ</h2>
            <p>เลื่อนลงเพื่อเดินทางผ่านแต่ละช่วง · กดการ์ดเพื่อเปิดรูปของช่วงนั้น</p>
          </header>
          <div class="tl-viewport"><ol class="tl-track">${timelineStops().map(tlStop).join("")}</ol></div>
          <div class="tl-progress" aria-hidden="true"><i></i></div>
        </div>
      </section>`;

/* ---- memories: polaroids, the teacher's letter, messages between friends ---- */

const memoryPhotos = () => {
  // one good landscape photo from each album, spread over the years
  const out: { p: Photo; a: Album }[] = [];
  for (const a of albums) {
    // the landscape shot with the most classmates found in it (face detection also means the
    // picture is the right way up)
    const f = featured(a).filter((p) => p.w >= p.h);
    const pick =
      [...f].sort((x, y) => photoTags(y.id).length - photoTags(x.id).length)[0] ?? a.photos[0];
    if (pick) out.push({ p: pick, a });
  }
  return out.slice(0, 5);
};

const memories = () => {
  const lead = teachers.find((t) => t.name && !t.hidden);
  return `
  <section class="mem" id="memories">
    <header class="mem-head">
      <span class="tl-kicker">${icon("heart", 14)} ความทรงจำ</span>
      <h2>บางอย่างที่เราจะไม่มีวันลืม</h2>
    </header>
    <div class="mem-grid">
      <div class="mem-polaroids">${memoryPhotos()
        .map(({ p, a }, i) => {
          const d = photoExif(p.id).date;
          const when = d ? monthLabel(d.slice(0, 7)) : a.en;
          return `<a class="mem-polaroid" href="/album/${a.slug}#photo=${p.id}" data-link style="--i:${i}">
            <img src="${large(p)}" alt="" loading="lazy">
            <span class="mem-cap"><b>${esc(a.title)}</b><small>${esc(when)}</small></span>
          </a>`;
        })
        .join("")}</div>
      <article class="mem-letter" data-letter aria-label="จดหมายจากคุณครู">
        <div class="mem-envelope" aria-hidden="true"><span class="mem-flap"></span><span class="mem-seal">${icon("heart", 18)}</span></div>
        <div class="mem-paper">
          <span class="mem-to">ถึง นักเรียน ${CLASS.name} ทุกคน</span>
          <div class="mem-text" data-letter-text><p class="mem-wait">คุณครูกำลังเขียนจดหมายถึงพวกเราอยู่… เร็ว ๆ นี้นะ</p></div>
          <span class="mem-sign" data-letter-sign>${lead ? `— ${esc(teacherName(lead))}` : "— คุณครูของเรา"}</span>
          <div class="mem-admin" data-letter-admin hidden></div>
        </div>
      </article>
    </div>
    <div class="mem-messages">
      <div class="mem-messages-head"><b>${icon("chat", 16)} ข้อความถึงเพื่อน</b><a href="/chat/public" data-link>เขียนข้อความ ${icon("arrowUpRight", 14)}</a></div>
      ${messageCards()}
    </div>
  </section>`;
};

const footer = () => `
  <footer class="site-footer" data-theme="dark">
    <div class="footer-inner footer-grid">
      <div class="footer-brand">
        <a class="nav-logo" href="/" data-link>${logoMark(20)}<span>${BRAND}</span></a>
        <p class="footer-made">Made with love and memory by <a href="${profileUrl(students[0])}" data-link>@jxxn03</a> (member 1)</p>
        <span class="muted">${CLASS.name} · ${CLASS.gen} · Class of ${CLASS.yearEn}</span>
      </div>
      <div class="footer-col">
        <b>ทุกอย่างของ ${CLASS.name}</b>
        <a href="#showcase" data-scroll="#showcase">ไทม์ไลน์</a>
        <button type="button" data-albums>อัลบั้มทั้งหมด</button>
        <a href="#classmates" data-scroll="#classmates">เพื่อนทั้ง ${students.length} คน</a>
        <a href="#memories" data-scroll="#memories">จดหมาย &amp; ความทรงจำ</a>
      </div>
      <div class="footer-col">
        <b>ของเรา</b>
        <a href="/me" data-link>โปรไฟล์ของฉัน</a>
        <a href="/chat" data-link>แชท</a>
        <a href="/chat/public" data-link>ข้อความถึงเพื่อน</a>
        <button type="button" data-song-toggle>เพลงห้อง</button>
      </div>
      <div class="footer-col footer-stats">
        <b>ในเว็บนี้</b>
        <span><strong>${totals.photos.toLocaleString()}</strong> รูป</span>
        <span><strong>${totals.videos}</strong> คลิป</span>
        <span><strong>${albums.length}</strong> อัลบั้ม · <strong>${students.length}</strong> คน</span>
        <a href="/backend" data-link>แก้ไขข้อมูล</a>
      </div>
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
  root.innerHTML = `<div class="landing-root">${nav()}<main class="landing">${hero(HERO)}${future()}${pain()}${memories()}</main>${footer()}${albumsModal()}</div>`;
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
    const STACK_W = 150; // on-screen width of a card in the centre stack (matches the boot screen)
    const DEAL_GAP = 85; // ms between cards landing on the stack
    const DEAL_MS = 380;
    const SHUFFLE_MS = 640; // one "top card tucks under" while photos are still loading
    const SQUEEZE_MS = 170; // anticipation before the burst
    const FLY_GAP = 45;
    const FLY_MS = 1150;
    const dealEnd = (N - 1) * DEAL_GAP + DEAL_MS;

    // A slightly messy pile: fixed per-card tilt and offset so it looks hand-stacked.
    const pile = Array.from({ length: N }, (_, i) => ({
      r: ((i * 47) % 15) - 7,
      dx: (((i * 29) % 9) - 4) * 1.6,
      dy: (((i * 13) % 7) - 3) * 1.4,
      dir: i % 2 ? 1 : -1,
    }));
    let order = cards.map((_, i) => i); // bottom -> top
    const restack = () => order.forEach((c, z) => (cards[c].style.zIndex = String(10 + z)));
    restack();

    let ready = false;
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

    let shuffleAt = 0; // start time of the current shuffle (0 = none yet)
    let shuffleN = 0;
    let swapped = false;
    let releaseAt = 0;
    const flyStart: number[] = Array.from({ length: N }, () => Infinity);
    const from: { x: number; y: number; r: number; s: number }[] = [];

    const frame = (now: number) => {
      if (!alive) return;
      const t = now - start;
      const cx = vw / 2;
      const cy = vh / 2;

      // stack done and settled: either burst now, or tuck the top card under until photos are in
      const shuffling = shuffleAt && t - shuffleAt < SHUFFLE_MS;
      if (!releaseAt && t >= dealEnd && !shuffling) {
        if (ready) {
          releaseAt = t;
          // top of the pile flies first
          [...order].reverse().forEach((c, rank) => {
            flyStart[c] = t + SQUEEZE_MS + rank * FLY_GAP;
          });
          later(() => heroEl.classList.add("is-copy-in"), SQUEEZE_MS + 480);
        } else {
          shuffleAt = t;
          shuffleN++;
          swapped = false;
        }
      }
      const squeeze = releaseAt
        ? 1 - 0.07 * Math.sin((Math.PI / 2) * clamp((t - releaseAt) / SQUEEZE_MS))
        : 1;
      const top = order[N - 1];
      const sp = shuffleAt && !releaseAt ? clamp((t - shuffleAt) / SHUFFLE_MS) : 1;
      if (sp >= 0.5 && !swapped && shuffleAt && !releaseAt) {
        swapped = true;
        order = [top, ...order.slice(0, -1)];
        restack();
      }

      let finished = 0;
      for (let i = 0; i < N; i++) {
        const P = pile[i];
        const s = STACK_W / HERO[i].w / scaleNow();
        if (t < flyStart[i]) {
          // dealing onto the pile
          const dp = clamp((t - i * DEAL_GAP) / DEAL_MS);
          const dk = easeOut(dp);
          let x = cx + P.dx;
          let y = cy + P.dy - (1 - dk) * 70;
          let r = P.r + (1 - dk) * 16 * P.dir;
          let sc = s * (1.16 - 0.16 * dk) * squeeze;
          // the card being shuffled swings out sideways and back under the pile
          const isShuffled =
            shuffleAt && !releaseAt && (swapped ? order[0] === i : top === i) && sp < 1;
          if (isShuffled) {
            const arc = Math.sin(Math.PI * sp);
            const side = shuffleN % 2 ? 1 : -1;
            x += arc * STACK_W * 0.88 * side;
            y -= arc * 12;
            r += arc * 12 * side;
            sc *= 1 + arc * 0.03;
          }
          from[i] = { x, y, r, s: sc };
          place(i, x, y, r, sc, 0, clamp(dp * 2.5));
          continue;
        }
        // burst out to the hero layout
        const p = clamp((t - flyStart[i]) / FLY_MS);
        const k = easeOut(p);
        const kr = easeOutBack(clamp(p * 1.1));
        const f = from[i];
        const g = geo[i];
        const lift = Math.sin(Math.PI * k) * 36;
        place(
          i,
          f.x + (g.cx - f.x) * k,
          f.y + (g.cy - f.y) * k - lift,
          f.r + (HERO[i].r - f.r) * kr,
          f.s + (1 - f.s) * k,
          clamp((p - 0.3) / 0.55),
        );
        if (p >= 1) finished++;
      }
      if (finished === N) {
        cards.forEach((c) => (c.style.zIndex = ""));
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
  const tl = $(".tl");
  const tlTrack = $(".tl-track");
  const tlViewport = $(".tl-viewport");
  const tlBar = $<HTMLElement>(".tl-progress i");
  const memEl = $(".mem");
  // desktop: the timeline is pinned and slides sideways while you scroll down
  let tlShift = 0;
  function sizeTimeline() {
    // phones and very short screens (phone landscape): a normal swipeable row instead
    if (isMobile() || reduced || innerHeight < 540) {
      tl.style.height = "";
      tlTrack.style.transform = "";
      tlShift = 0;
      return;
    }
    tlShift = Math.max(0, tlTrack.scrollWidth - tlViewport.clientWidth);
    tl.style.height = `${vh + tlShift}px`;
  }
  function applyScroll() {
    const y = scrollY;
    navEl.classList.toggle("is-scrolled", y > vh * 0.55);
    const probe = 36;
    const dark = $$("[data-theme=dark]").some((s) => {
      const r = s.getBoundingClientRect();
      return r.top <= probe && r.bottom >= probe;
    });
    const overLight = [memEl.getBoundingClientRect(), futureInner.getBoundingClientRect()].some(
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

    // timeline: vertical scroll -> sideways travel
    if (tlShift) {
      const r = tl.getBoundingClientRect();
      const prog = clamp(-r.top / Math.max(1, r.height - vh));
      tlTrack.style.transform = `translate3d(${(-prog * tlShift).toFixed(1)}px, 0, 0)`;
      tlBar.style.transform = `scaleX(${prog.toFixed(4)})`;
      tl.classList.toggle("is-moving", prog > 0 && prog < 1);
    }

    const fr = futureEl.getBoundingClientRect();
    const shrink = isMobile() ? 0 : clamp((vh - fr.bottom) / (vh * 0.7));
    futureInner.style.setProperty("--shrink", shrink.toFixed(4));
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
    sizeTimeline();
    applyScroll();
  });
  // phones: the timeline is a normal sideways-scrolling row; keep the progress bar in sync
  tlViewport.addEventListener(
    "scroll",
    () => {
      if (tlShift) return;
      const max = tlViewport.scrollWidth - tlViewport.clientWidth;
      tlBar.style.transform = `scaleX(${max > 0 ? (tlViewport.scrollLeft / max).toFixed(4) : 0})`;
    },
    { passive: true },
  );

  /* ---------- smooth anchor scroll + albums panel ---------- */
  const scrollToSel = (sel: string, smooth = true) => {
    const target = root.querySelector<HTMLElement>(sel);
    if (!target) return;
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
  // Like the original hero: the slot glides to the width of each word, the word is "written"
  // left to right, a felt-pen underline follows, then it all wipes away for the next word.
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
    let widths: number[] = [];
    const sizeWords = () => {
      const em = parseFloat(getComputedStyle(slot).fontSize) || 1;
      widths = HAND_WORDS.map((w) => {
        measure.style.fontFamily = w.font;
        measure.lang = w.lang;
        measure.textContent = w.text;
        return (measure.offsetWidth + 4) / em;
      });
      slot.style.width = `${widths[i % HAND_WORDS.length]}em`;
    };
    sizeWords();
    void document.fonts?.ready.then(() => alive && sizeWords());
    const show = () => {
      if (!alive) return;
      const n = i % HAND_WORDS.length;
      const w = HAND_WORDS[n];
      slot.style.width = `${widths[n]}em`;
      slot.setAttribute("aria-label", w.text);
      word.textContent = w.text;
      word.style.fontFamily = w.font;
      word.lang = w.lang;
      slot.classList.remove("is-erase");
      void slot.offsetWidth; // restart the CSS animations
      slot.classList.add("is-draw");
      later(
        () => {
          slot.classList.remove("is-draw");
          slot.classList.add("is-erase");
          later(() => {
            i++;
            show();
          }, 480);
        },
        n === 0 ? 2800 : 1900,
      );
    };
    // let the slot settle on the first word's width before writing it
    later(show, 60);
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
      }
    },
    // Reveal once the element's top is 15% above the bottom of the screen. (A ratio threshold
    // like 0.3 never fires for sections taller than ~3 screens, e.g. the 49 friends on a phone,
    // which then stayed invisible.)
    { threshold: 0, rootMargin: "0px 0px -15% 0px" },
  );
  $$(
    ".future-title, .pain-notes, .tl-head, .mem-head, .mem-polaroids, .mem-letter, .mem-messages, .classmates",
  ).forEach((el) => io.observe(el));
  disposers.push(() => io.disconnect());

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

  /* ---------- the teacher's letter ---------- */
  const letterEl = $(".mem-letter");
  const showLetter = (l: { text: string; signed: string }) => {
    const box = $("[data-letter-text]");
    box.innerHTML = l.text
      ? l.text
          .split(/\n{2,}/)
          .map((para) => `<p>${esc(para).replace(/\n/g, "<br>")}</p>`)
          .join("")
      : `<p class="mem-wait">คุณครูกำลังเขียนจดหมายถึงพวกเราอยู่… เร็ว ๆ นี้นะ</p>`;
    if (l.signed) $("[data-letter-sign]").textContent = `— ${l.signed}`;
    letterEl.classList.toggle("has-letter", !!l.text);
  };
  let letter = { text: "", signed: "" };
  void fetch("/api/letter", { credentials: "same-origin" })
    .then((r) => r.json())
    .then((d: { letter?: { text: string; signed: string } }) => {
      if (!alive || !d.letter) return;
      letter = d.letter;
      showLetter(letter);
    })
    .catch(() => {});
  // opening the envelope when it scrolls into view
  const letterIo = new IntersectionObserver(
    (en) => en.some((e) => e.isIntersecting) && letterEl.classList.add("is-open"),
    { threshold: 0, rootMargin: "0px 0px -25% 0px" },
  );
  letterIo.observe(letterEl);
  disposers.push(() => letterIo.disconnect());
  // the admin can write / edit it right here
  if (session.user && "admin" in session.user) {
    const adminBox = $("[data-letter-admin]");
    adminBox.hidden = false;
    adminBox.innerHTML = `<button type="button" class="mem-edit" data-letter-edit>${icon("pen", 14)} เขียน / แก้ไขจดหมาย</button>`;
    adminBox.addEventListener("click", async (e) => {
      const t = e.target as Element;
      if (t.closest("[data-letter-edit]")) {
        adminBox.innerHTML = `<label><span>จดหมาย (เว้นบรรทัดว่างเพื่อขึ้นย่อหน้าใหม่)</span><textarea rows="10" maxlength="6000" data-l-text>${esc(letter.text)}</textarea></label>
          <label><span>ลงชื่อ</span><input maxlength="120" data-l-sign value="${esc(letter.signed)}" placeholder="เช่น ครูประจำชั้น"></label>
          <div class="mem-edit-row"><button type="button" class="mem-edit is-primary" data-letter-save>บันทึก</button><button type="button" class="mem-edit" data-letter-cancel>ยกเลิก</button><span data-l-msg></span></div>`;
        adminBox.querySelector<HTMLTextAreaElement>("textarea")!.focus();
      } else if (t.closest("[data-letter-cancel]")) {
        adminBox.innerHTML = `<button type="button" class="mem-edit" data-letter-edit>${icon("pen", 14)} เขียน / แก้ไขจดหมาย</button>`;
      } else if (t.closest("[data-letter-save]")) {
        const msg = adminBox.querySelector<HTMLElement>("[data-l-msg]")!;
        msg.textContent = "กำลังบันทึก…";
        try {
          const r = await fetch("/api/admin/letter", {
            method: "PUT",
            credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              text: adminBox.querySelector<HTMLTextAreaElement>("[data-l-text]")!.value,
              signed: adminBox.querySelector<HTMLInputElement>("[data-l-sign]")!.value,
            }),
          });
          const d = (await r.json()) as { letter?: typeof letter; error?: string };
          if (!r.ok || !d.letter) throw new Error(d.error ?? "บันทึกไม่สำเร็จ");
          letter = d.letter;
          showLetter(letter);
          adminBox.innerHTML = `<button type="button" class="mem-edit" data-letter-edit>${icon("pen", 14)} เขียน / แก้ไขจดหมาย</button>`;
        } catch (ex) {
          msg.textContent = (ex as Error).message;
        }
      }
    });
  }

  /* ---------- go ---------- */
  layout();
  sizeTimeline();
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
