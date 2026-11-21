// Hover preview for photo / video tiles (mouse only): rest on a tile and a bigger picture, or the
// clip itself (muted, looping), appears beside it. Tiles opt in with data attributes:
//   data-hp="photo"  data-hp-src="<bigger image>" data-hp-ratio="w/h" data-hp-cap="…" data-hp-people="…"
//   data-hp="video"  data-hp-id="<Drive file id>" data-hp-poster="<thumb>" data-hp-cap="…"
import { esc } from "./router.ts";

const DWELL = 320; // ms before the preview opens (so sweeping the mouse across a grid doesn't flash)
/** short silent preview made by scripts/video_previews.py (instant) */
const previewClip = (id: string) => `/photos/previews/${encodeURIComponent(id)}.mp4`;
/** fallback: the original streamed through our server (server/extras.ts); Drive won't play cross-site */
const driveStream = (id: string) => `/media/clip/${encodeURIComponent(id)}`;

let card: HTMLElement | null = null;
let current: HTMLElement | null = null;
let timer = 0;
let giveUp = 0;

function hide() {
  clearTimeout(timer);
  clearTimeout(giveUp);
  current = null;
  if (!card) return;
  card.classList.remove("is-open");
  const v = card.querySelector("video");
  if (v) {
    // stop the download, not just the playback
    v.pause();
    v.removeAttribute("src");
    v.load();
  }
  card.innerHTML = "";
  card.style.width = "";
}

function place(el: HTMLElement, w: number, h: number) {
  const r = el.getBoundingClientRect();
  const gap = 14;
  const vw = innerWidth;
  const vh = innerHeight;
  // beside the tile, on whichever side has room; otherwise above / below it
  let left: number;
  let top: number;
  if (vw - r.right >= w + gap) left = r.right + gap;
  else if (r.left >= w + gap) left = r.left - gap - w;
  else left = Math.min(vw - w - 8, Math.max(8, r.left + r.width / 2 - w / 2));
  if (left === r.right + gap || left === r.left - gap - w) top = r.top + r.height / 2 - h / 2;
  else top = r.top - h - gap >= 8 ? r.top - h - gap : r.bottom + gap;
  top = Math.min(vh - h - 8, Math.max(8, top));
  card!.style.left = `${Math.round(left)}px`;
  card!.style.top = `${Math.round(top)}px`;
}

/** largest box with this ratio that fits the preview limits */
function fit(ratio: number) {
  const maxW = Math.min(460, innerWidth * 0.42);
  const maxH = Math.min(420, innerHeight * 0.7);
  let w = maxW;
  let h = w / ratio;
  if (h > maxH) {
    h = maxH;
    w = h * ratio;
  }
  return { w: Math.round(w), h: Math.round(h) };
}

const parseRatio = (r: string | undefined) => {
  const [a, b] = (r ?? "").split("/").map(Number);
  return a && b ? a / b : 0;
};

/** camera file names (IMG_1234, long random ids) say nothing: don't caption with them */
const usefulName = (n: string) => n && n.length <= 40 && !/^(IMG|DJI|VID|MVI|PXL)_[\d_]+$/i.test(n);

function open(el: HTMLElement) {
  if (!card) return;
  const kind = el.dataset.hp;
  const cap =
    kind === "video" && !usefulName(el.dataset.hpCap ?? "") ? "" : (el.dataset.hpCap ?? "");
  const people = el.dataset.hpPeople ?? "";
  const foot =
    cap || people
      ? `<div class="hp-foot">${cap ? `<b>${esc(cap)}</b>` : ""}${people ? `<span>${esc(people)}</span>` : ""}</div>`
      : "";
  const footH = foot ? (people && cap ? 58 : 38) : 0;
  const size = (ratio: number) => {
    const { w, h } = fit(ratio);
    card!.style.width = `${w}px`; // the caption never widens the card
    const media = card!.querySelector<HTMLElement>(".hp-media");
    if (media) {
      media.style.width = `${w}px`;
      media.style.height = `${h}px`;
    }
    place(el, w, h + footH);
  };
  if (kind === "video") {
    card.innerHTML = `<div class="hp-media">
        <video muted loop playsinline autoplay preload="auto" poster="${esc(el.dataset.hpPoster ?? "")}"></video>
        <span class="hp-state">กำลังโหลดตัวอย่าง…</span>
      </div>${foot}`;
    size(parseRatio(el.dataset.hpRatio) || 16 / 9);
    const v = card.querySelector("video")!;
    const state = card.querySelector<HTMLElement>(".hp-state")!;
    const fail = () => {
      state.textContent = "คลิกเพื่อเล่นวิดีโอ";
      card?.classList.add("is-still");
    };
    // portrait clips get a portrait card once the real size is known
    v.addEventListener("loadedmetadata", () => {
      if (current === el && v.videoWidth && v.videoHeight) size(v.videoWidth / v.videoHeight);
    });
    v.addEventListener("playing", () => {
      clearTimeout(giveUp);
      state.hidden = true;
    });
    const id = el.dataset.hpId ?? "";
    let usedFallback = false;
    v.addEventListener("error", () => {
      if (usedFallback) return fail();
      usedFallback = true; // no preview clip for this video yet: stream the original
      v.src = driveStream(id);
      void v.play().catch(() => {});
      clearTimeout(giveUp);
      giveUp = window.setTimeout(() => !v.currentTime && fail(), 15000);
    });
    v.src = previewClip(id);
    void v.play().catch(() => {});
  } else {
    card.innerHTML = `<div class="hp-media"><img src="${esc(el.dataset.hpSrc ?? "")}" alt=""></div>${foot}`;
    size(parseRatio(el.dataset.hpRatio) || 4 / 3);
  }
  card.classList.remove("is-still");
  requestAnimationFrame(() => card?.classList.add("is-open"));
}

/** Install once (main.ts). Does nothing on touch-only devices. */
export function initHoverPreview() {
  if (card || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  card = document.createElement("div");
  card.className = "hp-card";
  card.setAttribute("aria-hidden", "true");
  document.body.appendChild(card);

  document.addEventListener("pointerover", (e) => {
    if (e.pointerType !== "mouse") return;
    const el = (e.target as Element).closest<HTMLElement>("[data-hp]");
    if (el === current) return;
    hide();
    if (!el || document.documentElement.classList.contains("has-viewer")) return;
    current = el;
    timer = window.setTimeout(() => current === el && open(el), DWELL);
  });
  document.addEventListener("pointerout", (e) => {
    const to = (e as PointerEvent).relatedTarget as Element | null;
    if (current && !(to && current.contains(to))) hide();
  });
  // anything that moves the page or opens the photo viewer closes the preview
  for (const ev of ["scroll", "wheel", "pointerdown", "keydown"])
    document.addEventListener(ev, hide, { capture: true, passive: true });
  window.addEventListener("blur", hide);
}
