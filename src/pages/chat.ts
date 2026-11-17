// /chat          private, end-to-end encrypted chat (Messenger-style)
// /chat/:no      private chat with one classmate
// /chat/public   public messages to friends (pending until the friend approves)
import { BRAND, applyWall, getStudent, studentAvatar, students, wall } from "../data.ts";
import {
  ApiError,
  api,
  myNo,
  refreshSession,
  session,
  type ChatMessage,
  type WallItem,
} from "../lib/api.ts";
import { paintChatBadge } from "../lib/chat-badge.ts";
import * as e2e from "../lib/e2e.ts";
import { icon } from "../lib/icons.ts";
import { esc, type Cleanup } from "../lib/router.ts";
import { rail } from "./profile.ts";
import { bindWallComposer, wallCard, wallComposer } from "./wall.ts";

const MSG_MAX = 2000;
const POLL_MS = 2500;

type Thread = { last?: ChatMessage; unread: number; msgs: ChatMessage[] | null; more: boolean };
type Outgoing = { tmp: number; text: string; state: "sending" | "failed"; error?: string };
type Panel = "thread" | "repin" | "reset";

const nick = (no: number) => getStudent(no)?.nickname ?? `เลขที่ ${no}`;
const avatar = (no: number) => {
  const s = getStudent(no);
  return s ? studentAvatar(s) : "";
};

const DAY = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric" });
const SHORT = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short" });
const CLOCK = new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit" });
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(Date.now() - 86400000);
  return sameDay(d, today) ? "วันนี้" : sameDay(d, y) ? "เมื่อวาน" : DAY.format(d);
}
const listTime = (iso: string) => {
  const d = new Date(iso);
  return sameDay(d, new Date()) ? CLOCK.format(d) : SHORT.format(d);
};

/** Escape, then turn bare links into real ones. */
const linkify = (text: string) =>
  esc(text).replace(
    /\bhttps?:\/\/[^\s<]+[^\s<.,!?)"']/g,
    (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`,
  );

const seg = (mode: "private" | "public", pending = 0) => `
  <nav class="ch-seg" aria-label="ประเภทแชท">
    <a href="/chat" data-link class="${mode === "private" ? "is-on" : ""}" ${mode === "private" ? 'aria-current="page"' : ""}>${icon("lock", 15)}<span>ส่วนตัว</span></a>
    <a href="/chat/public" data-link class="${mode === "public" ? "is-on" : ""}" ${mode === "public" ? 'aria-current="page"' : ""}>${icon("globe", 15)}<span>สาธารณะ</span>${pending ? `<span class="ch-seg-badge">${pending}</span>` : ""}</a>
  </nav>`;

export function renderChat(root: HTMLElement, target: "public" | number | null): Cleanup {
  document.title = `${target === "public" ? "ข้อความถึงเพื่อน" : "แชท"} · ${BRAND}`;
  document.body.className = "page-profile page-chat";
  root.innerHTML = `<div class="pf-app">${rail()}<main class="pf-main ch-main" id="pf-main"><div class="ch-boot"><span class="skeleton"></span><span class="skeleton"></span></div></main></div>`;
  const main = root.querySelector<HTMLElement>("#pf-main")!;
  let alive = true;
  const disposers: (() => void)[] = [];

  async function start() {
    const me = await refreshSession().catch(() => session);
    if (!alive) return;
    try {
      await api.wall().then((r) => applyWall(r.posts));
    } catch (e) {
      main.innerHTML = `<div class="me-wrap"><div class="me-card me-narrow"><h1>แชท</h1><p class="me-help">${esc((e as Error).message)}</p><a class="btn-outline" href="/" data-link>กลับหน้าแรก</a></div></div>`;
      return;
    }
    if (!alive) return;
    const no = myNo();
    if (target === "public") return renderPublic(no);
    if (!me.user) return renderNeedLogin();
    if ("admin" in me.user) {
      main.innerHTML = `<div class="me-wrap"><div class="me-card me-narrow"><div class="me-head">${icon("shield", 22)}<div><h1>บัญชีผู้ดูแล</h1><p class="me-help">แชทส่วนตัวใช้ได้เฉพาะบัญชีนักเรียน ข้อความสาธารณะจัดการได้ในหน้า backend</p></div></div><div class="me-row"><a class="me-btn" href="/backend#wall" data-link>จัดการข้อความ</a><a class="btn-outline" href="/chat/public" data-link>ดูข้อความสาธารณะ</a></div></div></div>`;
      return;
    }
    renderPrivate(no!, typeof target === "number" ? target : null);
  }

  function renderNeedLogin() {
    main.innerHTML = `<div class="me-wrap"><div class="me-card me-narrow ch-login">
      <div class="ch-lock-ico">${icon("chat", 28)}</div>
      <h1>แชทกับเพื่อน 6/2</h1>
      <p class="me-help">เข้าสู่ระบบก่อน เพื่อแชทส่วนตัวแบบเข้ารหัสกับเพื่อน หรือเขียนข้อความสาธารณะถึงเพื่อน</p>
      <a class="me-btn me-block" href="/me" data-link>เข้าสู่ระบบ</a>
      <a class="btn-outline me-block" href="/chat/public" data-link>${icon("globe", 16)} ดูข้อความสาธารณะ</a>
    </div></div>`;
  }

  /* =================================================================== *
   * PUBLIC
   * =================================================================== */
  function renderPublic(no: number | null) {
    const qTo = Number(new URLSearchParams(location.search).get("to")) || undefined;
    let inbox: WallItem[] = [];
    let sent: WallItem[] = [];
    let tab: "all" | "inbox" | "sent" = "all";

    main.innerHTML = `<div class="ch-pub">
      <header class="ch-pub-head">
        <div>
          <h1>ข้อความถึงเพื่อน</h1>
          <p class="me-help">ข้อความสาธารณะ ทุกคนเห็นได้ จะขึ้นบนหน้าแรกและโปรไฟล์ของเพื่อน <b>หลังเพื่อนกดอนุมัติ</b></p>
        </div>
        <div data-seg>${seg("public")}</div>
      </header>
      <div class="ch-pub-top${no ? "" : " is-guest"}">
        <section class="me-card ch-pub-card">
          ${
            no
              ? `<h2>เขียนข้อความ</h2>${wallComposer({ me: no, to: qTo })}`
              : `<h2>อยากเขียนถึงเพื่อน?</h2><p class="me-help">เข้าสู่ระบบก่อน แล้วเขียนข้อความถึงเพื่อนคนไหนก็ได้ เพื่อนกดอนุมัติแล้วข้อความจะขึ้นโปรไฟล์ของเขา</p><a class="me-btn" href="/me" data-link>เข้าสู่ระบบ</a>`
          }
        </section>
        ${no ? `<section class="me-card ch-pub-card" data-review></section>` : ""}
      </div>
      <nav class="pf-tabs ch-pub-tabs" role="tablist" data-tabs></nav>
      <div class="wall-grid" data-feed></div>
    </div>`;

    const reviewEl = main.querySelector<HTMLElement>("[data-review]");
    const tabsEl = main.querySelector<HTMLElement>("[data-tabs]")!;
    const feedEl = main.querySelector<HTMLElement>("[data-feed]")!;
    const segEl = main.querySelector<HTMLElement>("[data-seg]")!;

    const pending = () => inbox.filter((p) => p.status === "pending");

    function paint() {
      const pend = pending();
      segEl.innerHTML = seg("public", pend.length);
      if (reviewEl)
        reviewEl.innerHTML = `<h2>รอคุณอนุมัติ ${pend.length ? `<span class="ch-count">${pend.length}</span>` : ""}</h2>
          ${
            pend.length
              ? `<p class="me-help small">เพื่อนเขียนถึงคุณ กดอนุมัติเพื่อให้ขึ้นบนโปรไฟล์ของคุณ หรือซ่อนไว้</p><div class="ch-review-list">${pend.map((p) => wallCard(p, { hideTo: true, actions: ["approve", "hide", "delete"] })).join("")}</div>`
              : `<div class="ch-empty-small">${icon("check", 18)}<span>ไม่มีข้อความรออนุมัติ</span></div>`
          }`;
      const tabs: [typeof tab, string, number][] = [["all", "ทั้งหมด", wall.length]];
      if (no)
        tabs.push(
          ["inbox", "ถึงฉัน", inbox.filter((p) => p.status !== "pending").length],
          ["sent", "ที่ฉันส่ง", sent.length],
        );
      tabsEl.innerHTML = tabs
        .map(
          ([k, label, n]) =>
            `<button class="pf-tab${k === tab ? " is-active" : ""}" type="button" role="tab" aria-selected="${k === tab}" data-tab="${k}">${label}<span class="pf-tab-count">${n}</span></button>`,
        )
        .join("");
      const list =
        tab === "all"
          ? wall.map((p) => wallCard(p))
          : tab === "inbox"
            ? inbox
                .filter((p) => p.status !== "pending")
                .map((p) =>
                  wallCard(p, {
                    status: true,
                    hideTo: true,
                    actions: p.status === "approved" ? ["hide", "delete"] : ["approve", "delete"],
                  }),
                )
            : sent.map((p) => wallCard(p, { status: true, actions: ["delete"] }));
      feedEl.innerHTML = list.length
        ? list.join("")
        : `<p class="pf-empty">${tab === "sent" ? "ยังไม่ได้เขียนถึงใครเลย" : tab === "inbox" ? "ยังไม่มีข้อความที่อนุมัติแล้ว" : "ยังไม่มีข้อความ เป็นคนแรกที่เขียนถึงเพื่อนสิ"}</p>`;
    }

    async function load() {
      const [w, mine] = await Promise.all([
        api.wall().catch(() => null),
        no ? api.wallMine().catch(() => null) : Promise.resolve(null),
      ]);
      if (!alive) return;
      if (w) applyWall(w.posts);
      if (mine) ({ inbox, sent } = mine);
      paint();
      paintChatBadge({ private: lastPrivateUnread, pending: pending().length });
    }

    tabsEl.addEventListener("click", (e) => {
      const b = (e.target as Element).closest<HTMLElement>("[data-tab]");
      if (!b) return;
      tab = b.dataset.tab as typeof tab;
      paint();
    });

    main.addEventListener("click", async (e) => {
      const b = (e.target as Element).closest<HTMLButtonElement>("[data-wall-act]");
      if (!b) return;
      const act = b.dataset.wallAct as "approve" | "hide" | "delete";
      b.disabled = true;
      try {
        await api.wallAction(Number(b.dataset.id), act);
        await load();
      } catch (ex) {
        b.disabled = false;
        toast((ex as Error).message);
      }
    });

    if (no)
      bindWallComposer(
        main,
        (to, text) => api.wallPost(to, text).then((r) => r.post),
        (p) => {
          sent.unshift(p);
          tab = "sent";
          paint();
          toast(`ส่งแล้ว รอ ${nick(p.to)} อนุมัติ`);
        },
      );

    paint();
    void load();
    // see approvals from friends without reloading
    const id = window.setInterval(() => !document.hidden && void load(), 20000);
    disposers.push(() => clearInterval(id));
  }

  /* =================================================================== *
   * PRIVATE (end-to-end encrypted)
   * =================================================================== */
  let lastPrivateUnread = 0;

  function renderPrivate(me: number, initialPeer: number | null) {
    const pubs = new Map<string, string>(); // "no:v" -> public key
    const current = new Map<number, { v: number; pub: string }>();
    let mine: e2e.WrappedKey[] = [];
    let myV = 0;
    let unlocked = false;
    const threads = new Map<number, Thread>();
    const plain = new Map<number, string | null>();
    const outgoing = new Map<number, Outgoing[]>();
    let reads: Record<string, number> = {};
    let maxId = 0;
    let pendingPublic = 0;
    let peer: number | null =
      initialPeer && initialPeer !== me && getStudent(initialPeer) ? initialPeer : null;
    let panel: Panel = "thread";
    let query = "";
    let tmpId = 0;

    main.classList.add("is-private");
    main.innerHTML = `<div class="ch-app${peer ? " has-thread" : ""}" data-app>
      <aside class="ch-side">
        <header class="ch-side-head">
          <h1>แชท</h1>
          <div class="ch-menu-wrap">
            <button class="ch-icon-btn" type="button" data-menu-btn aria-label="ตั้งค่าแชท" aria-expanded="false" aria-haspopup="menu">${icon("more", 20)}</button>
            <div class="ch-menu" role="menu" data-menu hidden></div>
          </div>
        </header>
        <div data-seg>${seg("private")}</div>
        <label class="ch-search">${icon("search", 16)}<input type="search" placeholder="ค้นหาเพื่อน ชื่อ หรือเลขที่" data-search aria-label="ค้นหาเพื่อน"></label>
        <div class="ch-list" data-list><div class="ch-list-sk">${Array.from({ length: 6 }, () => `<span class="skeleton"></span>`).join("")}</div></div>
      </aside>
      <section class="ch-thread" data-thread aria-live="polite"></section>
    </div>`;
    const app = main.querySelector<HTMLElement>("[data-app]")!;
    const listEl = main.querySelector<HTMLElement>("[data-list]")!;
    const threadEl = main.querySelector<HTMLElement>("[data-thread]")!;
    const menuBtn = main.querySelector<HTMLButtonElement>("[data-menu-btn]")!;
    const menuEl = main.querySelector<HTMLElement>("[data-menu]")!;
    const segEl = main.querySelector<HTMLElement>("[data-seg]")!;
    document.body.classList.toggle("ch-in-thread", !!peer);

    const pubOf = (no: number, v: number) => pubs.get(`${no}:${v}`);
    const thread = (no: number) => {
      let t = threads.get(no);
      if (!t) threads.set(no, (t = { unread: 0, msgs: null, more: true }));
      return t;
    };
    const otherOf = (m: ChatMessage) => (m.from === me ? m.to : m.from);
    const unreadTotal = () => [...threads.values()].reduce((a, t) => a + t.unread, 0);
    const paintBadges = () => {
      lastPrivateUnread = unreadTotal();
      paintChatBadge({ private: lastPrivateUnread, pending: pendingPublic });
      segEl.innerHTML = seg("private", pendingPublic);
    };

    async function loadKeys() {
      const [all, my] = await Promise.all([api.chatKeys(), api.chatMyKey()]);
      pubs.clear();
      current.clear();
      for (const k of all.keys) {
        pubs.set(`${k.no}:${k.v}`, k.pub);
        if ((current.get(k.no)?.v ?? 0) < k.v) current.set(k.no, { v: k.v, pub: k.pub });
      }
      mine = my.keys;
      myV = mine[0]?.v ?? 0;
      unlocked = myV ? (await e2e.unlockedVersions(me, [myV])).length > 0 : false;
    }

    async function decryptAll(list: (ChatMessage | undefined)[]) {
      if (!unlocked) return;
      await Promise.all(
        list.map(async (m) => {
          if (!m || plain.has(m.id)) return;
          try {
            plain.set(m.id, await e2e.decryptText(me, m, pubOf));
          } catch {
            plain.set(m.id, null);
          }
        }),
      );
    }

    function addMessage(m: ChatMessage): boolean {
      const t = thread(otherOf(m));
      maxId = Math.max(maxId, m.id);
      if (!t.last || t.last.id < m.id) t.last = m;
      if (!t.msgs) return true;
      if (t.msgs.some((x) => x.id === m.id)) return false;
      t.msgs.push(m);
      t.msgs.sort((a, b) => a.id - b.id);
      return true;
    }

    /* ---------------- list ---------------- */
    const preview = (m: ChatMessage) => {
      if (!unlocked) return "ข้อความเข้ารหัส";
      const p = plain.get(m.id);
      return p == null ? "ถอดรหัสไม่ได้" : p.replace(/\s+/g, " ");
    };
    function row(no: number) {
      const t = threads.get(no);
      const last = t?.last;
      const sub = last
        ? `${last.from === me ? "คุณ: " : ""}${preview(last)}`
        : current.has(no)
          ? "เริ่มแชทเข้ารหัส"
          : "ยังไม่เปิดใช้แชท";
      return `<a class="ch-row${no === peer ? " is-on" : ""}${t?.unread ? " is-unread" : ""}${!last && !current.has(no) ? " is-off" : ""}" href="/chat/${no}" data-peer="${no}">
        <img class="ch-av" src="${avatar(no)}" alt="" loading="lazy">
        <span class="ch-row-main">
          <span class="ch-row-top"><b>${esc(nick(no))}</b>${last ? `<time>${esc(listTime(last.at))}</time>` : `<span class="ch-row-no">เลขที่ ${no}</span>`}</span>
          <span class="ch-row-sub"><span>${!unlocked && last ? `${icon("lock", 12)} ` : ""}${esc(sub)}</span>${t?.unread ? `<span class="ch-unread">${t.unread}</span>` : ""}</span>
        </span>
      </a>`;
    }
    function renderList() {
      const q = query.trim().toLowerCase();
      const match = (no: number) => {
        const s = getStudent(no);
        if (!s) return false;
        return (
          !q ||
          String(no) === q ||
          [s.nickname, s.nicknameEn, s.fullName].some((x) => x.toLowerCase().includes(q))
        );
      };
      const recent = [...threads.entries()]
        .filter(([, t]) => t.last)
        .sort((a, b) => b[1].last!.id - a[1].last!.id)
        .map(([no]) => no)
        .filter(match);
      const rest = students
        .filter((s) => s.no !== me && !threads.get(s.no)?.last)
        .map((s) => s.no)
        .filter(match);
      listEl.innerHTML =
        (recent.length ? `<h2 class="ch-list-h">ล่าสุด</h2>${recent.map(row).join("")}` : "") +
        (rest.length ? `<h2 class="ch-list-h">เพื่อนทั้งหมด</h2>${rest.map(row).join("")}` : "") +
        (!recent.length && !rest.length ? `<p class="ch-none">ไม่พบเพื่อนที่ค้นหา</p>` : "");
    }

    /* ---------------- thread area ---------------- */
    function lockCard(kind: "setup" | "unlock" | "repin" | "reset") {
      const pinField = (name: string, label: string, auto = "new-password") =>
        `<label class="me-field"><span>${label}</span><input name="${name}" type="password" autocomplete="${auto}" minlength="6" maxlength="64" required></label>`;
      const T = {
        setup: {
          title: "ตั้ง PIN แชทส่วนตัว",
          body: `แชทส่วนตัวเข้ารหัสปลายทางบนเครื่องของคุณ เซิร์ฟเวอร์และผู้ดูแลห้องอ่านไม่ได้ PIN ใช้ปลดล็อกแชทเมื่อเข้าจากเครื่องอื่น <b>ถ้าลืม PIN ข้อความเก่าจะอ่านไม่ได้อีก</b> และ PIN ไม่ควรซ้ำกับรหัสเข้าสู่ระบบ`,
          fields: pinField("pin", "PIN แชท (อย่างน้อย 6 ตัว)") + pinField("again", "พิมพ์ PIN อีกครั้ง"),
          btn: `${icon("lock", 16)} เปิดใช้แชทเข้ารหัส`,
        },
        unlock: {
          title: "ปลดล็อกแชท",
          body: "ใส่ PIN แชทที่ตั้งไว้ เพื่ออ่านและส่งข้อความบนเครื่องนี้ เครื่องนี้จะจำไว้จนกว่าจะออกจากระบบ",
          fields: pinField("pin", "PIN แชท", "current-password"),
          btn: "ปลดล็อก",
        },
        repin: {
          title: "เปลี่ยน PIN แชท",
          body: "ข้อความเดิมยังอ่านได้ตามปกติ ใช้ PIN ใหม่ในการปลดล็อกครั้งต่อไป",
          fields:
            pinField("old", "PIN เดิม", "current-password") +
            pinField("pin", "PIN ใหม่ (อย่างน้อย 6 ตัว)") +
            pinField("again", "พิมพ์ PIN ใหม่อีกครั้ง"),
          btn: "บันทึก PIN ใหม่",
        },
        reset: {
          title: "สร้างกุญแจใหม่",
          body: `ใช้เมื่อลืม PIN เท่านั้น <b>ข้อความเก่าทั้งหมดจะอ่านไม่ได้</b> (ทั้งของคุณและเพื่อนที่คุยกับคุณ) ข้อความใหม่หลังจากนี้ใช้ได้ปกติ`,
          fields: pinField("pin", "PIN ใหม่ (อย่างน้อย 6 ตัว)") + pinField("again", "พิมพ์ PIN ใหม่อีกครั้ง"),
          btn: "สร้างกุญแจใหม่",
        },
      }[kind];
      const cancel =
        kind === "repin" || kind === "reset"
          ? `<button class="btn-outline me-block" type="button" data-cancel>ยกเลิก</button>`
          : "";
      const forgot =
        kind === "unlock"
          ? `<button class="ch-link" type="button" data-forgot>ลืม PIN?</button>`
          : "";
      return `<div class="ch-lock">
        ${peer ? `<a class="ch-back ch-back-float" href="/chat" data-back aria-label="กลับไปรายชื่อ">${icon("chevronLeft", 22)}</a>` : ""}
        <form class="me-card me-narrow ch-lock-card${kind === "reset" ? " is-warn" : ""}" data-lock="${kind}" novalidate>
          <div class="ch-lock-ico">${icon(kind === "reset" ? "shield" : "lock", 28)}</div>
          <h2>${T.title}</h2>
          <p class="me-help">${T.body}</p>
          ${T.fields}
          <p class="me-error" data-error role="alert"></p>
          <button class="me-btn me-block" type="submit">${T.btn}</button>
          ${cancel}${forgot}
          ${!peer && (kind === "setup" || kind === "unlock") ? `<a class="ch-link ch-lock-alt" href="/chat/public" data-link>${icon("globe", 14)} ไปหน้าข้อความสาธารณะ</a>` : ""}
        </form>
      </div>`;
    }

    function renderThread() {
      // on phones only one pane shows: a lock/setup screen must win over the list
      const blocked = !e2e.e2eSupported() || !myV || !unlocked || panel !== "thread";
      app.classList.toggle("has-thread", peer != null || blocked);
      if (!e2e.e2eSupported()) {
        threadEl.innerHTML = `<div class="ch-lock"><div class="me-card me-narrow ch-lock-card"><div class="ch-lock-ico">${icon("lock", 28)}</div><h2>เบราว์เซอร์นี้เข้ารหัสไม่ได้</h2><p class="me-help">แชทส่วนตัวต้องเปิดเว็บผ่าน https หรือ localhost ลองเปิดใหม่ด้วยลิงก์ https</p></div></div>`;
        return;
      }
      if (!myV) return mountLock("setup");
      if (!unlocked) return mountLock("unlock");
      if (panel !== "thread") return mountLock(panel);
      if (peer == null) {
        threadEl.innerHTML = `<div class="ch-empty">
          <div class="ch-lock-ico">${icon("chat", 30)}</div>
          <h2>แชทส่วนตัว</h2>
          <p class="me-help">เลือกเพื่อนทางซ้ายเพื่อเริ่มคุย ทุกข้อความเข้ารหัสปลายทาง มีแค่คุณกับเพื่อนที่อ่านได้</p>
          <span class="ch-e2e-chip">${icon("lock", 13)} End-to-end encrypted</span>
        </div>`;
        return;
      }
      const p = peer;
      const peerKey = current.get(p);
      threadEl.innerHTML = `
        <header class="ch-thread-head">
          <a class="ch-back" href="/chat" data-back aria-label="กลับไปรายชื่อ">${icon("chevronLeft", 22)}</a>
          <a class="ch-peer" href="/member/${p}" data-link>
            <img class="ch-av" src="${avatar(p)}" alt="">
            <span><b>${esc(nick(p))}</b><span class="ch-peer-sub">${icon("lock", 12)} เข้ารหัสปลายทาง · เลขที่ ${p}</span></span>
          </a>
          ${peerKey ? `<button class="ch-icon-btn" type="button" data-safety aria-label="รหัสความปลอดภัย" aria-expanded="false">${icon("shield", 20)}</button>` : ""}
        </header>
        <div class="ch-safety" data-safety-box hidden></div>
        <div class="ch-scroll" data-scroll><div class="ch-msgs" data-msgs><div class="ch-msgs-sk">${Array.from({ length: 4 }, (_, i) => `<span class="skeleton ${i % 2 ? "is-r" : ""}"></span>`).join("")}</div></div></div>
        ${
          peerKey
            ? `<form class="ch-compose" data-compose>
                <textarea rows="1" maxlength="${MSG_MAX}" placeholder="พิมพ์ข้อความ…" data-input aria-label="ข้อความถึง ${esc(nick(p))}"></textarea>
                <button class="ch-send" type="submit" aria-label="ส่ง">${icon("send", 18)}</button>
              </form>`
            : `<div class="ch-no-key">${icon("lock", 16)}<span><b>${esc(nick(p))}</b> ยังไม่ได้เปิดใช้แชทส่วนตัว บอกให้เพื่อนเข้ามาตั้ง PIN ก่อน หรือ <a href="/chat/public?to=${p}" data-link>เขียนข้อความสาธารณะ</a> แทน</span></div>`
        }`;
      bindThread(p);
      void loadThread(p);
    }

    function mountLock(kind: "setup" | "unlock" | "repin" | "reset") {
      threadEl.innerHTML = lockCard(kind);
      const form = threadEl.querySelector<HTMLFormElement>("[data-lock]")!;
      const err = form.querySelector<HTMLElement>("[data-error]")!;
      const val = (n: string) =>
        (form.elements.namedItem(n) as HTMLInputElement | null)?.value ?? "";
      form.querySelector("[data-cancel]")?.addEventListener("click", () => {
        panel = "thread";
        renderThread();
      });
      form.querySelector("[data-forgot]")?.addEventListener("click", () => {
        panel = "reset";
        mountLock("reset");
      });
      form.querySelector("input")?.focus({ preventScroll: true });
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        err.textContent = "";
        const pin = val("pin");
        if (pin.length < 6) return void (err.textContent = "PIN ต้องยาวอย่างน้อย 6 ตัว");
        if (kind !== "unlock" && pin !== val("again"))
          return void (err.textContent = "PIN สองช่องไม่ตรงกัน");
        const btn = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
        btn.disabled = true;
        btn.textContent = kind === "unlock" ? "กำลังปลดล็อก…" : "กำลังเข้ารหัส…";
        try {
          if (kind === "unlock") {
            const ok = await e2e.unlockKeys(me, mine, pin);
            if (!ok.includes(myV)) throw new Error("PIN ไม่ถูกต้อง");
          } else if (kind === "repin") {
            const w = await e2e.rewrapKey(mine[0], val("old"), pin);
            await api.chatSaveKey({ mode: "repin", v: myV }, w);
            toast("เปลี่ยน PIN แล้ว");
          } else {
            const k = await e2e.createKey(me, pin);
            const { pub, wrapped, salt, iv, iter } = k;
            const r = await api.chatSaveKey({ mode: "new", pub }, { wrapped, salt, iv, iter });
            await k.keep(r.v);
            toast(kind === "setup" ? "เปิดใช้แชทเข้ารหัสแล้ว" : "สร้างกุญแจใหม่แล้ว");
          }
          await loadKeys();
          plain.clear();
          for (const t of threads.values()) t.msgs = null; // re-fetch + decrypt with the key
          await decryptAll([...threads.values()].map((t) => t.last));
          panel = "thread";
          if (!alive) return;
          renderList();
          renderThread();
          renderMenu();
        } catch (ex) {
          err.textContent = (ex as Error).message;
          btn.disabled = false;
          btn.textContent = "ลองอีกครั้ง";
        }
      });
    }

    /* ---------------- messages ---------------- */
    let scrollEl: HTMLElement | null = null;
    let msgsEl: HTMLElement | null = null;
    const nearBottom = () =>
      !scrollEl || scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 120;

    function renderMsgs(opts: { stick?: boolean; keepTop?: number } = {}) {
      if (!msgsEl || peer == null) return;
      const p = peer;
      const t = thread(p);
      if (!t.msgs) return;
      const stick = opts.stick ?? nearBottom();
      const out: string[] = [];
      if (t.more)
        out.push(`<button class="ch-older" type="button" data-older>โหลดข้อความก่อนหน้า</button>`);
      else
        out.push(`<div class="ch-intro">
          <img class="ch-intro-av" src="${avatar(p)}" alt="">
          <b>${esc(nick(p))}</b>
          <span class="muted">เลขที่ ${p} · ม.6/2</span>
          <p>${icon("lock", 13)} ข้อความในแชทนี้เข้ารหัสปลายทาง มีแค่คุณกับ ${esc(nick(p))} ที่อ่านได้</p>
        </div>`);
      const msgs = t.msgs;
      const lastMine = [...msgs].reverse().find((m) => m.from === me);
      const seenUpTo = reads[p] ?? 0;
      let day = "";
      msgs.forEach((m, i) => {
        const prev = msgs[i - 1];
        const next = msgs[i + 1];
        const d = dayLabel(m.at);
        if (d !== day) {
          out.push(`<div class="ch-day"><span>${d}</span></div>`);
          day = d;
        }
        const close = (a?: ChatMessage, b?: ChatMessage) =>
          !!a &&
          !!b &&
          a.from === b.from &&
          Math.abs(Date.parse(b.at) - Date.parse(a.at)) < 5 * 60000 &&
          dayLabel(a.at) === dayLabel(b.at);
        const cont = close(prev, m);
        const end = !close(m, next);
        const mineMsg = m.from === me;
        const text = plain.get(m.id);
        const time = CLOCK.format(new Date(m.at));
        out.push(`<div class="ch-msg ${mineMsg ? "is-mine" : "is-theirs"}${cont ? " is-cont" : ""}${end ? " is-end" : ""}">
          ${!mineMsg ? (end ? `<img class="ch-msg-av" src="${avatar(m.from)}" alt="">` : `<span class="ch-msg-av"></span>`) : ""}
          <div class="ch-bubble${text == null ? " is-fail" : ""}" title="${esc(time)}">${text == null ? `${icon("lock", 13)} ถอดรหัสไม่ได้ (กุญแจเก่า)` : linkify(text)}</div>
        </div>`);
        if (end) out.push(`<div class="ch-time ${mineMsg ? "is-mine" : ""}">${esc(time)}</div>`);
        if (m === lastMine && !outgoing.get(p)?.length)
          out.push(
            `<div class="ch-status">${seenUpTo >= m.id ? `${icon("checks", 14)} เห็นแล้ว` : `${icon("check", 14)} ส่งแล้ว`}</div>`,
          );
      });
      for (const o of outgoing.get(p) ?? [])
        out.push(`<div class="ch-msg is-mine is-end is-${o.state}" data-tmp="${o.tmp}">
          <div class="ch-bubble">${linkify(o.text)}</div>
        </div>
        <div class="ch-status${o.state === "failed" ? " is-failed" : ""}">${
          o.state === "sending"
            ? "กำลังส่ง…"
            : `${esc(o.error ?? "ส่งไม่สำเร็จ")} · <button class="ch-link" type="button" data-retry="${o.tmp}">ลองใหม่</button> · <button class="ch-link" type="button" data-discard="${o.tmp}">ลบ</button>`
        }</div>`);
      const before = scrollEl?.scrollHeight ?? 0;
      msgsEl.innerHTML = out.join("");
      if (!scrollEl) return;
      if (opts.keepTop != null) scrollEl.scrollTop = scrollEl.scrollHeight - before + opts.keepTop;
      else if (stick) scrollEl.scrollTop = scrollEl.scrollHeight;
    }

    async function loadThread(p: number) {
      const t = thread(p);
      if (!t.msgs) {
        try {
          const r = await api.chatMessages(p);
          if (t.msgs) return; // another load finished first
          t.msgs = r.messages;
          t.more = r.more;
          for (const m of r.messages) maxId = Math.max(maxId, m.id);
          await decryptAll(r.messages);
        } catch (ex) {
          if (peer === p && msgsEl)
            msgsEl.innerHTML = `<p class="ch-none">${esc((ex as Error).message)}</p>`;
          return;
        }
      }
      if (!alive || peer !== p) return;
      renderMsgs({ stick: true });
      markRead(p);
    }

    async function loadOlder(p: number) {
      const t = thread(p);
      if (!t.msgs?.length) return;
      const top = scrollEl?.scrollTop ?? 0;
      const r = await api.chatMessages(p, t.msgs[0].id);
      t.msgs = [...r.messages, ...t.msgs];
      t.more = r.more;
      await decryptAll(r.messages);
      if (peer === p) renderMsgs({ keepTop: top });
    }

    function markRead(p: number) {
      const t = thread(p);
      if (document.hidden || peer !== p) return;
      const lastIn = [...(t.msgs ?? [])].reverse().find((m) => m.from === p);
      if (!t.unread && !lastIn) return;
      const had = t.unread;
      t.unread = 0;
      if (had) {
        renderList();
        paintBadges();
      }
      if (lastIn) void api.chatRead(p, lastIn.id).catch(() => {});
    }

    async function send(p: number, text: string, existing?: Outgoing) {
      const o = existing ?? { tmp: --tmpId, text, state: "sending" as const };
      o.state = "sending";
      if (!existing) outgoing.set(p, [...(outgoing.get(p) ?? []), o]);
      renderMsgs({ stick: true });
      const attempt = async () => {
        const pk = current.get(p);
        if (!pk) throw new Error("เพื่อนยังไม่ได้เปิดใช้แชท");
        const c = await e2e.encryptText(text, { me, myV, peer: p, peerV: pk.v, peerPub: pk.pub });
        return api.chatSend(p, { ...c, fromV: myV, toV: pk.v });
      };
      try {
        let r;
        try {
          r = await attempt();
        } catch (ex) {
          // the friend made a new key since we loaded: refresh keys and try once more
          if (!(ex instanceof ApiError && ex.status === 409)) throw ex;
          await loadKeys();
          r = await attempt();
        }
        plain.set(r.message.id, text);
        outgoing.set(
          p,
          (outgoing.get(p) ?? []).filter((x) => x !== o),
        );
        addMessage(r.message);
      } catch (ex) {
        o.state = "failed";
        o.error = (ex as Error).message;
      }
      if (!alive) return;
      if (peer === p) renderMsgs({ stick: true });
      renderList();
    }

    function bindThread(p: number) {
      scrollEl = threadEl.querySelector<HTMLElement>("[data-scroll]");
      msgsEl = threadEl.querySelector<HTMLElement>("[data-msgs]");
      const form = threadEl.querySelector<HTMLFormElement>("[data-compose]");
      const input = threadEl.querySelector<HTMLTextAreaElement>("[data-input]");
      const grow = () => {
        if (!input) return;
        input.style.height = "auto";
        input.style.height = `${Math.min(140, input.scrollHeight)}px`;
        input.style.overflowY = input.scrollHeight > 140 ? "auto" : "hidden";
      };
      const submit = () => {
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;
        if (text.length > MSG_MAX) return toast(`ข้อความยาวได้ไม่เกิน ${MSG_MAX} ตัว`);
        input.value = "";
        grow();
        void send(p, text);
      };
      form?.addEventListener("submit", (e) => {
        e.preventDefault();
        submit();
        input?.focus();
      });
      input?.addEventListener("input", grow);
      input?.addEventListener("keydown", (e) => {
        // Enter sends on keyboards; touch keyboards keep Enter for new lines
        if (
          e.key === "Enter" &&
          !e.shiftKey &&
          !e.isComposing &&
          !matchMedia("(pointer: coarse)").matches
        ) {
          e.preventDefault();
          submit();
        }
      });
      if (!matchMedia("(pointer: coarse)").matches) input?.focus({ preventScroll: true });

      threadEl.querySelector("[data-safety]")?.addEventListener("click", async (e) => {
        const b = e.currentTarget as HTMLButtonElement;
        const box = threadEl.querySelector<HTMLElement>("[data-safety-box]")!;
        const open = box.hidden;
        box.hidden = !open;
        b.setAttribute("aria-expanded", String(open));
        if (!open) return;
        const a = current.get(me);
        const c = current.get(p);
        if (!a || !c) return;
        const code = await e2e.safetyNumber({ no: me, pub: a.pub }, { no: p, pub: c.pub });
        box.innerHTML = `<div><b>รหัสความปลอดภัย</b><p>เปิดหน้านี้พร้อมกับ ${esc(nick(p))} แล้วเทียบตัวเลข ถ้าตรงกันแปลว่าไม่มีใครแอบสลับกุญแจ</p></div><code>${code}</code>`;
      });

      msgsEl?.addEventListener("click", (e) => {
        const el = e.target as Element;
        if (el.closest("[data-older]")) {
          (el.closest("[data-older]") as HTMLButtonElement).disabled = true;
          void loadOlder(p);
          return;
        }
        const retry = el.closest<HTMLElement>("[data-retry]");
        const discard = el.closest<HTMLElement>("[data-discard]");
        const id = Number((retry ?? discard)?.dataset.retry ?? (retry ?? discard)?.dataset.discard);
        const o = (outgoing.get(p) ?? []).find((x) => x.tmp === id);
        if (!o) return;
        if (retry) void send(p, o.text, o);
        else {
          outgoing.set(
            p,
            (outgoing.get(p) ?? []).filter((x) => x !== o),
          );
          renderMsgs();
        }
      });
    }

    /* ---------------- navigation inside the page ---------------- */
    function openPeer(no: number | null, push = true) {
      peer = no && no !== me && getStudent(no) ? no : null;
      const url = peer ? `/chat/${peer}` : "/chat";
      if (push && location.pathname !== url) history.pushState({}, "", url);
      document.title = `${peer ? nick(peer) : "แชท"} · ${BRAND}`;
      app.classList.toggle("has-thread", !!peer);
      document.body.classList.toggle("ch-in-thread", !!peer);
      scrollEl = msgsEl = null;
      renderList();
      renderThread();
    }

    listEl.addEventListener("click", (e) => {
      const a = (e.target as Element).closest<HTMLAnchorElement>("[data-peer]");
      if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault(); // handled here, so the router doesn't rebuild the page
      if (panel !== "thread") panel = "thread";
      openPeer(Number(a.dataset.peer));
    });
    threadEl.addEventListener("click", (e) => {
      if (!(e.target as Element).closest("[data-back]")) return;
      e.preventDefault();
      openPeer(null);
    });
    main.querySelector<HTMLInputElement>("[data-search]")!.addEventListener("input", (e) => {
      query = (e.target as HTMLInputElement).value;
      renderList();
    });

    /* ---------------- settings menu ---------------- */
    function renderMenu() {
      menuBtn.hidden = !myV;
      menuEl.innerHTML = unlocked
        ? `<button type="button" role="menuitem" data-act="repin">${icon("lock", 16)} เปลี่ยน PIN แชท</button>
           <button type="button" role="menuitem" data-act="lock">${icon("eyeOff", 16)} ล็อกแชทบนเครื่องนี้</button>
           <button type="button" role="menuitem" data-act="reset" class="is-danger">${icon("shield", 16)} ลืม PIN / สร้างกุญแจใหม่</button>`
        : `<button type="button" role="menuitem" data-act="reset" class="is-danger">${icon("shield", 16)} ลืม PIN / สร้างกุญแจใหม่</button>`;
    }
    const closeMenu = () => {
      menuEl.hidden = true;
      menuBtn.setAttribute("aria-expanded", "false");
    };
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      menuEl.hidden = !menuEl.hidden;
      menuBtn.setAttribute("aria-expanded", String(!menuEl.hidden));
    });
    menuEl.addEventListener("click", async (e) => {
      const b = (e.target as Element).closest<HTMLElement>("[data-act]");
      if (!b) return;
      closeMenu();
      const act = b.dataset.act;
      if (act === "lock") {
        await e2e.forgetKeys();
        unlocked = false;
        plain.clear();
        renderList();
        renderMenu();
        renderThread();
        toast("ล็อกแชทบนเครื่องนี้แล้ว");
        return;
      }
      panel = act === "repin" ? "repin" : "reset";
      app.classList.add("has-thread");
      renderThread();
    });
    const onDocClick = (e: MouseEvent) => {
      if (!menuEl.hidden && !(e.target as Element).closest(".ch-menu-wrap")) closeMenu();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeMenu();
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    disposers.push(() => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    });

    /* ---------------- polling ---------------- */
    let polling = false;
    async function poll() {
      if (!alive || polling || document.hidden) return;
      polling = true;
      try {
        const r = await api.chatPoll(maxId);
        if (!alive) return;
        const seenBefore = peer != null ? (reads[peer] ?? 0) : 0;
        reads = r.reads;
        pendingPublic = r.pending;
        const fresh = r.messages.filter((m) => addMessage(m) || !plain.has(m.id));
        // a friend we didn't have a key for may have just set one up
        if (fresh.some((m) => !pubOf(otherOf(m), m.from === me ? m.toV : m.fromV)))
          await loadKeys();
        await decryptAll(fresh);
        let touchedOpen = false;
        for (const m of fresh) {
          if (m.from === me) continue;
          if (m.from === peer && panel === "thread" && unlocked) touchedOpen = true;
          else thread(m.from).unread++;
        }
        if (fresh.length) renderList();
        if (
          peer != null &&
          (touchedOpen ||
            fresh.some((m) => otherOf(m) === peer) ||
            (reads[peer] ?? 0) !== seenBefore)
        ) {
          renderMsgs();
          if (touchedOpen) markRead(peer);
        }
        paintBadges();
      } catch {
        /* offline for a moment: try again next tick */
      } finally {
        polling = false;
      }
    }
    const pollId = window.setInterval(() => void poll(), POLL_MS);
    const onVis = () => {
      if (document.hidden) return;
      void poll();
      if (peer != null) markRead(peer);
    };
    document.addEventListener("visibilitychange", onVis);
    // the friend may set up their key while we're on the page
    const keysId = window.setInterval(() => {
      if (document.hidden) return;
      const before = peer != null ? current.get(peer)?.v : undefined;
      void loadKeys()
        .then(() => {
          if (
            alive &&
            peer != null &&
            current.get(peer)?.v !== before &&
            panel === "thread" &&
            unlocked
          )
            renderThread();
        })
        .catch(() => {});
    }, 30000);
    disposers.push(() => {
      clearInterval(pollId);
      clearInterval(keysId);
      document.removeEventListener("visibilitychange", onVis);
    });

    /* ---------------- boot ---------------- */
    void (async () => {
      try {
        await loadKeys();
        const th = await api.chatThreads();
        if (!alive) return;
        for (const t of th.threads) {
          threads.set(t.peer, { last: t.last, unread: t.unread, msgs: null, more: true });
          maxId = Math.max(maxId, t.last.id);
        }
        reads = th.reads;
        await decryptAll(th.threads.map((t) => t.last));
        const counts = await api.chatUnread().catch(() => null);
        pendingPublic = counts?.pending ?? 0;
      } catch (ex) {
        listEl.innerHTML = `<p class="ch-none">${esc((ex as Error).message)}</p>`;
        return;
      }
      if (!alive) return;
      renderList();
      renderMenu();
      renderThread();
      paintBadges();
    })();
  }

  /* ---------------- toast ---------------- */
  let toastTimer = 0;
  function toast(msg: string) {
    let el = root.querySelector<HTMLElement>(".ch-toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "ch-toast";
      el.setAttribute("role", "status");
      root.querySelector(".pf-app")!.append(el);
    }
    el.textContent = msg;
    el.classList.add("is-in");
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => el!.classList.remove("is-in"), 2600);
  }

  void start();
  return () => {
    alive = false;
    clearTimeout(toastTimer);
    disposers.forEach((d) => d());
    document.body.classList.remove("ch-in-thread");
  };
}
