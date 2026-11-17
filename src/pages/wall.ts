// Public messages ("ข้อความถึงเพื่อน"): the card + composer shared by /chat/public,
// the member page tab and the landing page.
import { getStudent, studentAvatar, students, type WallPost } from "../data.ts";
import type { WallItem } from "../lib/api.ts";
import { icon } from "../lib/icons.ts";
import { esc } from "../lib/router.ts";

export const WALL_MAX = 300;

const nick = (no: number) => getStudent(no)?.nickname ?? `เลขที่ ${no}`;

export function timeAgo(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "เมื่อกี้";
  if (s < 3600) return `${Math.floor(s / 60)} นาทีที่แล้ว`;
  if (s < 86400) return `${Math.floor(s / 3600)} ชม.ที่แล้ว`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} วันที่แล้ว`;
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  }).format(t);
}

const STATUS: Record<WallItem["status"], string> = {
  pending: "รออนุมัติ",
  approved: "แสดงอยู่",
  hidden: "ซ่อนแล้ว",
};

/**
 * One message card, styled like the landing page's "ถึงเพื่อน" cards.
 * `actions` adds review / delete buttons (data-wall-act="approve|hide|delete").
 */
export function wallCard(
  p: WallPost | WallItem,
  opts: { status?: boolean; actions?: ("approve" | "hide" | "delete")[]; hideTo?: boolean } = {},
): string {
  const from = getStudent(p.from);
  const st = "status" in p ? p.status : "approved";
  const acts = opts.actions ?? [];
  const btn = (a: "approve" | "hide" | "delete") =>
    a === "approve"
      ? `<button class="wall-act is-ok" type="button" data-wall-act="approve" data-id="${p.id}">${icon("check", 14)} อนุมัติ</button>`
      : a === "hide"
        ? `<button class="wall-act" type="button" data-wall-act="hide" data-id="${p.id}">${icon("eyeOff", 14)} ซ่อน</button>`
        : `<button class="wall-act is-danger" type="button" data-wall-act="delete" data-id="${p.id}" aria-label="ลบ">${icon("trash", 14)}</button>`;
  return `<article class="wall-card${st !== "approved" ? ` is-${st}` : ""}" data-post="${p.id}">
    <div class="wall-top">
      <span class="wall-to">${icon("heart", 14)} ${opts.hideTo ? "ถึงเพื่อน" : `ถึง <a href="/member/${p.to}" data-link>${esc(nick(p.to))}</a>`}</span>
      ${opts.status ? `<span class="wall-status is-${st}">${STATUS[st]}</span>` : ""}
    </div>
    <p class="wall-text">“${esc(p.text)}”</p>
    <div class="wall-foot">
      <a class="wall-author" href="/member/${p.from}" data-link><img src="${from ? studentAvatar(from) : ""}" alt=""><span>${esc(nick(p.from))}</span></a>
      <span class="wall-time">${esc(timeAgo(p.at))}</span>
    </div>
    ${acts.length ? `<div class="wall-acts">${acts.map(btn).join("")}</div>` : ""}
  </article>`;
}

/** Composer: pick a friend (unless `to` is fixed) and write up to 300 characters. */
export function wallComposer(opts: { me: number; to?: number; fixedTo?: boolean }): string {
  const others = students.filter((s) => s.no !== opts.me);
  const sel = opts.to && opts.to !== opts.me ? opts.to : others[0]?.no;
  const target = getStudent(sel ?? 0);
  return `<form class="wall-compose" data-wall-form novalidate>
    ${
      opts.fixedTo && target
        ? `<input type="hidden" name="to" value="${target.no}">`
        : `<label class="me-field"><span>เขียนถึง</span>
            <div class="me-picker">
              <img class="me-pick-avatar" src="${target ? studentAvatar(target) : ""}" alt="" data-wall-avatar>
              <select name="to">${others.map((s) => `<option value="${s.no}"${s.no === sel ? " selected" : ""}>${s.no} · ${esc(s.nickname)}</option>`).join("")}</select>
            </div>
          </label>`
    }
    <label class="me-field"><span>${opts.fixedTo && target ? `เขียนถึง ${esc(target.nickname)}` : "ข้อความ"}<em data-wall-count>0/${WALL_MAX}</em></span>
      <textarea name="text" rows="3" maxlength="${WALL_MAX}" placeholder="อยากบอกอะไรเพื่อนคนนี้… (ทุกคนเห็นได้หลังเพื่อนกดอนุมัติ)"></textarea>
    </label>
    <p class="me-error" data-wall-error role="alert"></p>
    <div class="wall-compose-foot">
      <span class="me-help small">${icon("shield", 14)} เพื่อนต้องกดอนุมัติก่อน ข้อความถึงจะขึ้นหน้าแรกและโปรไฟล์</span>
      <button class="me-btn" type="submit">${icon("send", 16)} ส่งให้เพื่อนอนุมัติ</button>
    </div>
  </form>`;
}

/** Wire up a composer rendered by wallComposer(). `onSent` gets the new (pending) post. */
export function bindWallComposer(
  host: HTMLElement,
  send: (to: number, text: string) => Promise<WallItem>,
  onSent: (p: WallItem) => void,
) {
  const form = host.querySelector<HTMLFormElement>("[data-wall-form]");
  if (!form) return;
  const ta = form.querySelector<HTMLTextAreaElement>("textarea")!;
  const count = form.querySelector<HTMLElement>("[data-wall-count]")!;
  const err = form.querySelector<HTMLElement>("[data-wall-error]")!;
  const sel = form.querySelector<HTMLSelectElement>("select");
  const av = form.querySelector<HTMLImageElement>("[data-wall-avatar]");
  ta.addEventListener("input", () => (count.textContent = `${ta.value.length}/${WALL_MAX}`));
  sel?.addEventListener("change", () => {
    const s = getStudent(Number(sel.value));
    if (av && s) av.src = studentAvatar(s);
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = ta.value.trim();
    if (!text) return void (err.textContent = "พิมพ์ข้อความก่อนนะ");
    const btn = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
    btn.disabled = true;
    err.textContent = "";
    try {
      const to = Number(
        (form.elements.namedItem("to") as HTMLInputElement | HTMLSelectElement).value,
      );
      const p = await send(to, text);
      ta.value = "";
      count.textContent = `0/${WALL_MAX}`;
      onSent(p);
    } catch (ex) {
      err.textContent = (ex as Error).message;
    } finally {
      btn.disabled = false;
    }
  });
}
