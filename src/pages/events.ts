// /events — every occasion in time order, a month at a time.
import { BRAND, CLASS } from "../data.ts";
import { eventCard } from "../lib/cards.ts";
import { listedEvents, schoolYear } from "../lib/events.ts";
import { icon, logoMark } from "../lib/icons.ts";
import type { Cleanup } from "../lib/router.ts";
import { rail } from "./profile.ts";

export function renderEvents(root: HTMLElement): Cleanup {
  document.body.className = "page-profile page-album";
  document.title = `ไทม์ไลน์ · ${BRAND}`;
  const evs = listedEvents();
  const bySchoolYear = new Map<string, typeof evs>();
  for (const e of evs) {
    const k = e.day ? `${schoolYear(e.day).year}` : "";
    bySchoolYear.set(k, [...(bySchoolYear.get(k) ?? []), e]);
  }
  const keys = [...bySchoolYear.keys()].sort((a, b) =>
    a === "" ? 1 : b === "" ? -1 : a < b ? -1 : 1,
  );
  const label = (k: string) => {
    if (!k) return "ไม่ทราบวันที่";
    const grade = schoolYear(`${Number(k) - 543}-06-01`).grade;
    return `${grade ? `${grade} · ` : ""}ปีการศึกษา ${k}`;
  };
  root.innerHTML = `<div class="pf-app">${rail()}<main class="pf-main al-main" id="pf-main">
    <div class="al-page">
      <div class="al-top">
        <nav class="pf-crumbs" aria-label="Breadcrumb"><a href="/" data-link>${logoMark(16)}</a>${icon("chevronRight", 14)}<span>ไทม์ไลน์</span></nav>
      </div>
      <header class="ev-head"><h1>ไทม์ไลน์ ${CLASS.name}</h1><p>${evs.length} เหตุการณ์ รวมรูปจากทุกอัลบั้ม</p></header>
      ${keys
        .map(
          (k) =>
            `<section class="ev-month"><h2>${label(k)}</h2><div class="al-more-row">${bySchoolYear
              .get(k)!
              .map((e) => eventCard(e))
              .join("")}</div></section>`,
        )
        .join("")}
    </div>
  </main></div>`;
  const main = root.querySelector<HTMLElement>("#pf-main")!;
  requestAnimationFrame(() => main.classList.add("is-mounted"));

  return () => {};
}
