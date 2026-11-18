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
// A small "now playing" card: cover + title, our own play / seek / volume controls, and the
// YouTube video itself (driven through the IFrame API so the controls stay in sync).
let mini: HTMLElement | null = null;

type YTPlayer = {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(s: number, allow: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  setVolume(v: number): void;
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  destroy(): void;
};
type YTNamespace = {
  Player: new (
    el: HTMLElement,
    o: {
      host?: string;
      videoId: string;
      playerVars?: Record<string, number | string>;
      events?: Record<string, (e: { target: YTPlayer; data: number }) => void>;
    },
  ) => YTPlayer;
};
let player: YTPlayer | null = null;
let ticker = 0;
let apiReady: Promise<YTNamespace> | null = null;

function loadApi(): Promise<YTNamespace> {
  const w = window as unknown as { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void };
  if (w.YT?.Player) return Promise.resolve(w.YT);
  apiReady ??= new Promise((resolve, reject) => {
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(w.YT!);
    };
    const sc = document.createElement("script");
    sc.src = "https://www.youtube.com/iframe_api";
    sc.async = true;
    sc.onerror = () => {
      apiReady = null;
      reject(new Error("YouTube API blocked"));
    };
    document.head.appendChild(sc);
  });
  return apiReady;
}

const fmt = (t: number) => {
  const s = Math.max(0, Math.floor(t || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const PAUSE_SVG = `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>`;
const skipSvg = (fwd: boolean) =>
  `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${
    fwd
      ? `<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v4h-4"/>`
      : `<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/>`
  }<text x="12" y="15.5" font-size="7" text-anchor="middle" fill="currentColor" stroke="none">10</text></svg>`;

/** closed | open | playing (minimised while a song session is active). Mirrored on <html data-song>. */
function setState(state: "closed" | "open" | "playing") {
  if (!mini) return;
  mini.dataset.state = state;
  document.documentElement.dataset.song = state;
  document
    .querySelectorAll("[data-song-toggle]")
    .forEach((b) => b.setAttribute("aria-pressed", String(state !== "closed")));
}

/** Is audio actually running right now (equaliser + play/pause button)? */
/**
 * Phones (iPhone especially) only start sound from a tap inside the YouTube frame itself, so a
 * play request from our own button can be ignored. If nothing starts, point at the video.
 */
function expectPlayback() {
  window.setTimeout(() => {
    const st = player?.getPlayerState?.();
    if (mini && player && st !== 1 && st !== 3) mini.classList.add("needs-tap");
  }, 1600);
}

function setAudible(on: boolean) {
  if (!mini) return;
  mini.classList.toggle("is-audible", on);
  document.documentElement.toggleAttribute("data-song-audible", on);
  const btn = mini.querySelector<HTMLElement>("[data-sc-play]")!;
  btn.innerHTML = on ? PAUSE_SVG : icon("play", 22);
  btn.setAttribute("aria-label", on ? "หยุดชั่วคราว" : "เล่น");
}

function tick() {
  if (!mini) return;
  const cur = player?.getCurrentTime?.() ?? 0;
  const dur = player?.getDuration?.() ?? 0;
  const bar = mini.querySelector<HTMLInputElement>("[data-sc-seek]")!;
  if (!bar.matches(":active")) {
    bar.max = String(Math.max(1, dur));
    bar.value = String(cur);
    bar.style.setProperty("--p", `${dur ? (cur / dur) * 100 : 0}%`);
  }
  mini.querySelector("[data-sc-cur]")!.textContent = fmt(cur);
  mini.querySelector("[data-sc-dur]")!.textContent = dur ? fmt(dur) : "–:–";
}

export function mountSongMini() {
  if (mini) return;
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="song-mini" data-state="closed">
      <button class="song-fab" type="button" data-mini-toggle aria-label="เพลงห้อง" title="เพลงห้อง">${icon("music", 20)}<span class="song-eq" aria-hidden="true"><i></i><i></i><i></i></span></button>
      <div class="song-card" role="dialog" aria-label="เพลงห้อง">
        <div class="song-card-head">
          <img class="song-cover" src="${thumb}" alt="">
          <div class="song-meta"><span class="song-kicker-sm">${icon("music", 12)} เพลงห้อง ม.6/2<span class="song-eq-sm" aria-hidden="true"><i></i><i></i><i></i></span></span><b>${esc(CLASS_SONG.title)}</b><span>${esc(CLASS_SONG.artist)}</span></div>
          <button type="button" class="song-icon-btn" data-mini-min aria-label="ย่อ" title="ย่อ (เพลงยังเล่นต่อ)">${icon("chevronDown", 18)}</button>
          <button type="button" class="song-icon-btn" data-mini-close aria-label="ปิดเพลง" title="ปิดเพลง">${icon("close", 16)}</button>
        </div>
        <div class="song-card-video" data-mini-video>${songPlayerHtml()}</div>
        <div class="song-progress">
          <span data-sc-cur>0:00</span>
          <input type="range" min="0" max="1" step="0.1" value="0" data-sc-seek aria-label="ตำแหน่งเพลง">
          <span data-sc-dur>–:–</span>
        </div>
        <div class="song-controls">
          <button type="button" class="song-icon-btn" data-sc-back aria-label="ย้อน 10 วินาที" title="ย้อน 10 วิ">${skipSvg(false)}</button>
          <button type="button" class="song-play-btn" data-sc-play aria-label="เล่น">${icon("play", 22)}</button>
          <button type="button" class="song-icon-btn" data-sc-fwd aria-label="ข้ามไป 10 วินาที" title="ข้าม 10 วิ">${skipSvg(true)}</button>
          <span class="song-volume">${icon("music", 15)}<input type="range" min="0" max="100" value="80" data-sc-vol aria-label="ระดับเสียง" style="--p:80%"></span>
          <a class="song-icon-btn" href="${CLASS_SONG.url}" target="_blank" rel="noopener" aria-label="เปิดใน YouTube" title="เปิดใน YouTube">${icon("arrowUpRight", 16)}</a>
        </div>
      </div>
    </div>`,
  );
  mini = document.body.lastElementChild as HTMLElement;
  setState("closed");
  setAudible(false);
  // nav buttons on every page (rail, tab bar, landing + backend headers): open the player and play
  document.addEventListener("click", (e) => {
    if (!(e.target as Element).closest?.("[data-song-toggle]")) return;
    if (mini!.dataset.state === "open") return setState(active() ? "playing" : "closed");
    if (!active()) void startMini();
    setState("open");
  });
  mini.addEventListener("click", (e) => {
    const t = e.target as Element;
    if (t.closest("[data-mini-toggle]")) {
      setState(mini!.dataset.state === "open" ? (active() ? "playing" : "closed") : "open");
      return;
    }
    if (t.closest("[data-mini-min]")) return setState(active() ? "playing" : "closed");
    if (t.closest("[data-mini-close]")) return stopMini();
    if (t.closest("[data-song-play]")) return void startMini();
    if (t.closest("[data-sc-play]")) {
      if (!player) return void startMini();
      if (player.getPlayerState() === 1) return player.pauseVideo();
      player.playVideo();
      return expectPlayback();
    }
    if (t.closest("[data-sc-back]") && player)
      player.seekTo(Math.max(0, player.getCurrentTime() - 10), true);
    if (t.closest("[data-sc-fwd]") && player) player.seekTo(player.getCurrentTime() + 10, true);
  });
  const seek = mini.querySelector<HTMLInputElement>("[data-sc-seek]")!;
  seek.addEventListener("input", () => {
    seek.style.setProperty("--p", `${(Number(seek.value) / Number(seek.max || 1)) * 100}%`);
  });
  seek.addEventListener("change", () => player?.seekTo(Number(seek.value), true));
  mini.querySelector<HTMLInputElement>("[data-sc-vol]")!.addEventListener("input", (e) => {
    const el = e.target as HTMLInputElement;
    const v = Number(el.value);
    player?.setVolume(v);
    if (v > 0) player?.unMute();
    el.style.setProperty("--p", `${v}%`);
  });
}

async function startMini() {
  if (!mini) return;
  const host = mini.querySelector<HTMLElement>("[data-mini-video]")!;
  host.innerHTML = `<div class="song-video"><div data-yt></div></div>`;
  mini.classList.add("is-loading");
  try {
    const YT = await loadApi();
    player?.destroy();
    player = new YT.Player(host.querySelector<HTMLElement>("[data-yt]")!, {
      host: "https://www.youtube-nocookie.com",
      videoId: CLASS_SONG.id,
      playerVars: { autoplay: 1, playsinline: 1, rel: 0 },
      events: {
        onReady: (e) => {
          mini?.classList.remove("is-loading");
          e.target.setVolume(
            Number(mini?.querySelector<HTMLInputElement>("[data-sc-vol]")?.value ?? 80),
          );
          e.target.playVideo();
          expectPlayback();
        },
        // 1 = playing, 2 = paused, 0 = ended, 3 = buffering
        onStateChange: (e) => {
          setAudible(e.data === 1);
          if (e.data === 1 || e.data === 3) mini?.classList.remove("needs-tap");
        },
      },
    });
    clearInterval(ticker);
    ticker = window.setInterval(tick, 500);
  } catch {
    // API blocked: fall back to the plain embed (YouTube's own controls)
    host.innerHTML = `<div class="song-video">${iframe()}</div>`;
    mini.classList.remove("is-loading");
  }
}

/** A song session exists (playing or paused). */
const active = () => !!player || !!mini?.querySelector("[data-mini-video] iframe");

function openMini(autoplay: boolean) {
  mountSongMini();
  if (autoplay && !active()) void startMini();
  setState("open");
}

function stopMini() {
  if (!mini) return;
  clearInterval(ticker);
  player?.destroy();
  player = null;
  mini.querySelector("[data-mini-video]")!.innerHTML = songPlayerHtml();
  setAudible(false);
  tick();
  setState("closed");
}
