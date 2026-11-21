import "./styles/base.css";
import "./styles/landing.css";
import "./styles/profile.css";
import "./styles/share-card.css";
import "./styles/memories.css";
import "./styles/me.css";
import "./styles/slug.css";
import "./styles/song.css";
import "./styles/viewer.css";
import "./styles/theme.css";
import "./styles/teachers.css";
import "./styles/chat.css";
import "./styles/extras.css";
import "./styles/theme-more.css";
import "./styles/theme-hobby.css";
import "./styles/badges.css";
import "./styles/me-editor.css";
import "./styles/album-viewer.css";
import "./styles/timeline.css";
import "./styles/album-page.css";
import "./styles/badge-decos.css";
import "./styles/signature.css";
import "./styles/responsive.css";
import {
  applyAlbums,
  applyEvents,
  applyPeople,
  applyPhotoData,
  applyRoster,
  applyStudentRecords,
  applyWall,
  studentBySlug,
  profileUrlByNo,
} from "./data.ts";
import { api, refreshSession } from "./lib/api.ts";
import { refreshChatBadge } from "./lib/chat-badge.ts";
import { mountSongMini } from "./lib/song.ts";
import { loadExtras, setNoindex, startFaceGuard } from "./lib/extras.ts";
import { bindLinks, setRouteHandler, type Cleanup } from "./lib/router.ts";
import { applyBadges } from "./lib/badges.ts";
import { renderLanding } from "./pages/landing.ts";

const app = document.querySelector<HTMLDivElement>("#app")!;
let cleanup: Cleanup | null = null;
let firstLoad = true;
let routeSeq = 0;

/* Fonts load without blocking the first paint (the boot screen is inline in index.html). */
function loadFonts() {
  const add = (href: string) => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    document.head.append(l);
  };
  add(
    "https://fonts.googleapis.com/css2?family=Google+Sans+Flex:wght@400..700&family=Inter:wght@400;500;600;700&family=Noto+Sans+Thai:wght@400..700&display=swap",
  );
  // handwriting fonts (hero word + sticky notes): after the page is interactive
  const later = () =>
    add(
      "https://fonts.googleapis.com/css2?family=Caveat:wght@600&family=Mali:wght@500&family=Ma+Shan+Zheng&family=Yomogi&family=Nanum+Pen+Script&family=Playpen+Sans:wght@400&family=Itim&family=Sriracha&family=Press+Start+2P&display=swap",
    );
  if ("requestIdleCallback" in window) requestIdleCallback(later, { timeout: 3000 });
  else setTimeout(later, 1500);
}

/** Pages other than the landing page are separate chunks, fetched when first visited. */
async function route() {
  const seq = ++routeSeq;
  cleanup?.();
  cleanup = null;
  setNoindex(false); // profile pages turn it back on for students who opted out
  const path = decodeURIComponent(location.pathname);
  const album = path.match(/^\/album\/([^/]+)\/?$/);
  // /student/:no is the old address; send it to /member/:no
  const oldStudent = path.match(/^\/student\/(\d+)\/?$/);
  if (oldStudent)
    history.replaceState(null, "", `/member/${oldStudent[1]}${location.search}${location.hash}`);
  const student = path.match(/^\/(?:member|student)\/(\d+)\/?$/);
  const meSlug = path.match(/^\/me\/([A-Za-z0-9._-]{1,60})\/?$/);
  // /member/<no> still works; if that student picked an address, show that address instead
  if (student) {
    const canonical = profileUrlByNo(Number(student[1]));
    if (canonical !== `/member/${student[1]}`)
      history.replaceState(null, "", `${canonical}${location.search}${location.hash}`);
  }
  const chat = path.match(/^\/chat(?:\/(public|\d+))?\/?$/);
  const wasFirst = firstLoad;
  firstLoad = false;
  let mount: (() => Cleanup) | null;
  try {
    if (/^\/backend\/?$/.test(path)) {
      const { renderLoginGate } = await import("./pages/login-gate.ts");
      mount = () => renderLoginGate(app);
    } else if (chat) {
      const { renderChat } = await import("./pages/chat.ts");
      mount = () => renderChat(app, chat[1] === "public" ? "public" : Number(chat[1]) || null);
    } else if (/^\/me\/?$/.test(path)) {
      const { renderMe } = await import("./pages/me.ts");
      mount = () => renderMe(app);
    } else if (meSlug) {
      // /me/<address>: someone's personal profile link
      const { renderStudent } = await import("./pages/student.ts");
      const owner = studentBySlug(meSlug[1]);
      mount = () => renderStudent(app, owner ? owner.no : -1);
    } else if (album) {
      const { renderAlbum } = await import("./pages/album.ts");
      mount = () => renderAlbum(app, album[1]);
    } else if (student) {
      const { renderStudent } = await import("./pages/student.ts");
      mount = () => renderStudent(app, Number(student[1]));
    } else if (/^\/teacher\/\d+\/?$/.test(path)) {
      const { renderTeacher } = await import("./pages/teacher.ts");
      mount = () => renderTeacher(app, Number(path.split("/")[2]));
    }
    // Anything else shows the landing page; the splash loader plays only on a fresh page load.
    else mount = () => renderLanding(app, { splash: wasFirst });
  } catch {
    // a chunk failed to load (offline, or a new deploy replaced the old files): reload once
    if (!sessionStorage.getItem("chunk-retry")) {
      sessionStorage.setItem("chunk-retry", "1");
      location.reload();
    }
    return;
  }
  if (seq !== routeSeq) return; // the user navigated again while this page was loading
  sessionStorage.removeItem("chunk-retry");
  cleanup = mount();
  if (!location.hash) window.scrollTo(0, 0);
  void refreshChatBadge();
}

/** Pull live profiles + login state from the database server (if one is running). */
async function loadLiveData() {
  const timeout = new Promise((r) => setTimeout(r, 2500));
  // every request starts at once; the results are applied in dependency order below
  const quiet = <T>(p: Promise<T>) => p.catch(() => null);
  const albums = quiet(api.albums());
  const people = quiet(api.people());
  const events = quiet(api.events());
  const badges = quiet(api.badges()); // no server: keep the built-in badge list
  const students = quiet(api.students()); // no server: keep the bundled students.json
  const roster = quiet(api.roster()); // who owns which photo + teachers
  const session = refreshSession();
  const photos = quiet(api.photos()); // captions + tag corrections
  const wall = quiet(api.wall()); // approved public messages
  const extras = loadExtras(); // socials, privacy + characters
  const live = (async () => {
    // albums (incl. Drive folders added in /backend) + face tags, then people/photo data on top
    const [a, p, e, b] = await Promise.all([albums, people, events, badges]);
    if (a) applyAlbums(a.albums);
    if (p) applyPeople(p);
    if (e) applyEvents(e.events);
    if (b) applyBadges(b.badges);
    const [s, r] = await Promise.all([students, roster, session]);
    if (s) applyStudentRecords(s.students);
    if (r) applyRoster(r);
    // after students, so memories rebuild on fresh records
    const [ph, w] = await Promise.all([photos, wall]);
    if (ph) applyPhotoData(ph);
    if (w) applyWall(w.posts);
    await extras; // needs students and face tags
  })();
  await Promise.race([live, timeout]);
}

if ("scrollRestoration" in history) history.scrollRestoration = "manual";
loadFonts();
setRouteHandler(() => void route());
bindLinks();
mountSongMini(); // เพลงห้อง: floating player that keeps playing across pages
startFaceGuard(); // swaps faces for characters for students who chose to hide theirs
void loadLiveData().then(async () => {
  await route();
  // fade out the boot screen from index.html; the landing splash picks up from the same spot
  const boot = document.getElementById("boot");
  if (!boot) return;
  boot.classList.add("is-out");
  setTimeout(() => boot.remove(), 600);
});
