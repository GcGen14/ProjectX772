import "./styles/base.css";
import "./styles/landing.css";
import "./styles/profile.css";
import "./styles/memories.css";
import "./styles/backend.css";
import "./styles/backend-albums.css";
import "./styles/backend-people.css";
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
import "./styles/me-editor.css";
import "./styles/album-viewer.css";
import "./styles/timeline.css";
import "./styles/album-page.css";
import "./styles/responsive.css";
import {
  applyAlbums,
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
import { renderAlbum } from "./pages/album.ts";
import { renderBackend } from "./pages/backend.ts";
import { renderChat } from "./pages/chat.ts";
import { renderLanding } from "./pages/landing.ts";
import { renderMe } from "./pages/me.ts";
import { renderStudent } from "./pages/student.ts";
import { renderTeacher } from "./pages/teacher.ts";

const app = document.querySelector<HTMLDivElement>("#app")!;
let cleanup: Cleanup | null = null;
let firstLoad = true;

function route() {
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
  if (/^\/backend\/?$/.test(path)) cleanup = renderBackend(app);
  else if (chat)
    cleanup = renderChat(app, chat[1] === "public" ? "public" : Number(chat[1]) || null);
  else if (/^\/me\/?$/.test(path)) cleanup = renderMe(app);
  else if (meSlug) {
    // /me/<address>: someone's personal profile link
    const owner = studentBySlug(meSlug[1]);
    cleanup = renderStudent(app, owner ? owner.no : -1);
  } else if (album) cleanup = renderAlbum(app, album[1]);
  else if (student) cleanup = renderStudent(app, Number(student[1]));
  else if (/^\/teacher\/\d+\/?$/.test(path))
    cleanup = renderTeacher(app, Number(path.split("/")[2]));
  // Anything else shows the landing page; the splash loader plays only on a fresh page load.
  else cleanup = renderLanding(app, { splash: firstLoad });
  firstLoad = false;
  if (!location.hash) window.scrollTo(0, 0);
  void refreshChatBadge();
}

/** Pull live profiles + login state from the database server (if one is running). */
async function loadLiveData() {
  const timeout = new Promise((r) => setTimeout(r, 2500));
  const live = Promise.all([
    // albums (incl. Drive folders added in /backend) + face tags, then people/photo data on top
    api
      .albums()
      .then((r) => applyAlbums(r.albums))
      .catch(() => {}),
    api
      .people()
      .then(applyPeople)
      .catch(() => {}),
  ])
    .then(() =>
      Promise.all([
        api
          .students()
          .then((r) => applyStudentRecords(r.students))
          .catch(() => {}), // no server: keep the bundled students.json
        api
          .roster()
          .then(applyRoster)
          .catch(() => {}), // who owns which photo + teachers
        refreshSession(),
      ]),
    )
    .then(() =>
      // captions + tag corrections, and approved public messages (need the student list) (after students so memories rebuild on fresh records)
      Promise.all([
        api
          .photos()
          .then(applyPhotoData)
          .catch(() => {}),
        api
          .wall()
          .then((r) => applyWall(r.posts))
          .catch(() => {}),
      ]),
    )
    .then(() => loadExtras()); // socials, privacy + characters (needs students and face tags)
  await Promise.race([live, timeout]);
}

if ("scrollRestoration" in history) history.scrollRestoration = "manual";
setRouteHandler(route);
bindLinks();
mountSongMini(); // เพลงห้อง: floating player that keeps playing across pages
startFaceGuard(); // swaps faces for characters for students who chose to hide theirs
void loadLiveData().then(() => {
  route();
  // fade out the boot screen from index.html; the landing splash picks up from the same spot
  const boot = document.getElementById("boot");
  if (!boot) return;
  boot.classList.add("is-out");
  setTimeout(() => boot.remove(), 600);
});
