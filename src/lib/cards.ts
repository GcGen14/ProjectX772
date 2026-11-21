// Cards for albums and events. Both flip through pictures on hover (see preview.ts).
import type { Album, EventRec } from "../data.ts";
import { albumCount, albumSrcs, dateRange, eventDay, eventSrcs } from "./events.ts";
import { previewHtml } from "./preview.ts";
import { esc } from "./router.ts";

export const albumCard = (a: Album, cls = "") => {
  const { srcs, videoFrom } = albumSrcs(a);
  const range = dateRange(a.photos);
  return `<a class="al-card pv-host ${cls}" href="/album/${a.slug}" data-link>
    <span class="al-card-img">${previewHtml(srcs, { videoFrom })}</span>
    <b>${esc(a.title)}</b><span>${albumCount(a)}${range ? ` · ${range}` : ""}</span></a>`;
};

/** `n` = how many of the event's photos to count (e.g. only those in one album). */
export const eventCard = (e: EventRec, n = e.photos.length) => {
  const meta = [eventDay(e), e.place].filter(Boolean).join(" · ");
  return `<a class="al-card ev-card pv-host" href="/event/${e.id}" data-link>
    <span class="al-card-img">${previewHtml(eventSrcs(e))}</span>
    <b>${esc(e.title)}</b><span>${meta ? `${esc(meta)} · ` : ""}${n.toLocaleString()} รูป</span></a>`;
};
