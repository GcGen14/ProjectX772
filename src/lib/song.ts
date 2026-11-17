// เพลงห้อง — the class song, as a small floating player on every page + a section on the landing page.
// YouTube only loads after someone presses play (privacy + speed); youtube-nocookie.com is used.
import { esc } from "./router.ts";
import { icon } from "./icons.ts";

export const CLASS_SONG = {
  id: "vmAKksjK1Fg",
  title: "602 not found: ไม่เคย (How Lucky)",
  artist: "602TEPGEN14",
  url: "https://youtu.be/vmAKksjK1Fg",
};

const thumb = `https://i.ytimg.com/vi/${CLASS_SONG.id}/hqdefault.jpg`;
const embed = (autoplay: boolean) =>
  `https://www.youtube-nocookie.com/embed/${CLASS_SONG.id}?rel=0&playsinline=1${autoplay ? "&autoplay=1" : ""}`;
const iframe = () =>
  `<iframe src="${embed(true)}" title="${esc(CLASS_SONG.title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;

/** Thumbnail + play button (YouTube itself only loads after the click). */
const posterHtml = () => `
    <button class="song-poster" type="button" data-song-play aria-label="เล่นเพลงห้อง ${esc(CLASS_SONG.title)}">
      <img src="${thumb}" alt="" loading="lazy">
      <span class="song-play">${icon("play", 26)}</span>
    </button>`;

/** Click-to-play video block. */
export const songPlayerHtml = () => `<div class="song-video" data-song-video>${posterHtml()}</div>`;

/** Landing-page section. */
export const songSectionHtml = () => `
  <section class="song-section" id="song">
    <div class="song-copy">
      <span class="song-kicker">${icon("music", 16)} เพลงห้อง</span>
      <h2>${esc(CLASS_SONG.title)}</h2>
      <p>เพลงของ ม.6/2 โดย ${esc(CLASS_SONG.artist)} — กดปุ่ม ♪ เพลงห้อง ในแถบเมนูได้ทุกหน้า เพลงจะเล่นต่อแม้เปลี่ยนหน้า</p>
      <div class="song-actions">
        <button class="me-btn" type="button" data-song-mini>${icon("music", 16)} ฟังต่อขณะดูรูป</button>
        <a class="btn-outline" href="${CLASS_SONG.url}" target="_blank" rel="noopener">${icon("arrowUpRight", 14)} เปิดใน YouTube</a>
      </div>
    </div>
    ${songPlayerHtml()}
  </section>`;

/** Turn every click-to-play block inside `root` into a real player when pressed. */
export function bindSongPlayers(root: HTMLElement) {
  root.addEventListener("click", (e) => {
    const t = e.target as Element;
    const play = t.closest<HTMLElement>("[data-song-play]");
    if (play) {
      stopMini(); // don't play two copies at once
      play.closest<HTMLElement>("[data-song-video]")!.innerHTML = iframe();
      return;
    }
    if (t.closest("[data-song-mini]")) {
      // stop any inline player and continue in the floating one (it survives page changes)
      root
        .querySelectorAll<HTMLElement>("[data-song-video] iframe")
        .forEach((f) => (f.parentElement!.innerHTML = posterHtml()));
      openMini(true);
    }
  });
}

/** Song button for a navigation bar: "rail" (side menu), "tab" (phone tab bar) or "pill" (top bars). */
export function songNavButton(variant: "rail" | "tab" | "pill"): string {
  const eq = `<span class="song-nav-eq" aria-hidden="true"><i></i><i></i><i></i></span>`;
  const cls = { rail: "rail-item", tab: "tab-song", pill: "lang-pill" }[variant];
  const size = { rail: 24, tab: 22, pill: 16 }[variant];
  const on =
    document.documentElement.dataset.song && document.documentElement.dataset.song !== "closed";
  return `<button class="${cls} song-nav" type="button" data-song-toggle aria-pressed="${!!on}" aria-label="เพลงห้อง: ${esc(CLASS_SONG.title)}" title="เพลงห้อง">${icon("music", size)}<span>เพลงห้อง</span>${eq}</button>`;
}

/* ---------------- floating mini player (mounted once, outside the page content) ---------------- */
let mini: HTMLElement | null = null;

/** closed | open | playing (minimised while playing). Mirrored on <html data-song> for the nav buttons. */
function setState(state: "closed" | "open" | "playing") {
  if (!mini) return;
  mini.dataset.state = state;
  document.documentElement.dataset.song = state;
  document
    .querySelectorAll("[data-song-toggle]")
    .forEach((b) => b.setAttribute("aria-pressed", String(state !== "closed")));
}

export function mountSongMini() {
  if (mini) return;
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="song-mini" data-state="closed">
      <button class="song-fab" type="button" data-mini-toggle aria-label="เพลงห้อง" title="เพลงห้อง">${icon("music", 20)}<span class="song-eq" aria-hidden="true"><i></i><i></i><i></i></span></button>
      <div class="song-card" role="dialog" aria-label="เพลงห้อง">
        <div class="song-card-head">
          <div><b>เพลงห้อง</b><span>${esc(CLASS_SONG.title)}</span></div>
          <button type="button" data-mini-min aria-label="ย่อ">${icon("chevronDown", 18)}</button>
          <button type="button" data-mini-close aria-label="ปิดเพลง">${icon("close", 16)}</button>
        </div>
        <div class="song-card-video" data-mini-video>${songPlayerHtml()}</div>
        <a class="song-card-link" href="${CLASS_SONG.url}" target="_blank" rel="noopener">${icon("arrowUpRight", 13)} เปิดใน YouTube</a>
      </div>
    </div>`,
  );
  mini = document.body.lastElementChild as HTMLElement;
  setState("closed");
  // nav buttons on every page (rail, tab bar, landing + backend headers): open the player and play
  document.addEventListener("click", (e) => {
    if (!(e.target as Element).closest?.("[data-song-toggle]")) return;
    if (mini!.dataset.state === "open") return setState(playing() ? "playing" : "closed");
    if (!playing()) startMini();
    setState("open");
  });
  mini.addEventListener("click", (e) => {
    const t = e.target as Element;
    if (t.closest("[data-mini-toggle]")) {
      setState(mini!.dataset.state === "open" ? (playing() ? "playing" : "closed") : "open");
      return;
    }
    if (t.closest("[data-mini-min]")) return setState(playing() ? "playing" : "closed");
    if (t.closest("[data-mini-close]")) return stopMini();
    if (t.closest("[data-song-play]")) startMini();
  });
}

function startMini() {
  mini!.querySelector("[data-mini-video]")!.innerHTML = `<div class="song-video">${iframe()}</div>`;
}

const playing = () => !!mini?.querySelector("[data-mini-video] iframe");

function openMini(autoplay: boolean) {
  mountSongMini();
  if (autoplay && !playing()) startMini();
  setState("open");
}

function stopMini() {
  if (!mini) return;
  mini.querySelector("[data-mini-video]")!.innerHTML = songPlayerHtml();
  setState("closed");
}
