// /teacher/:id — a teacher's page (same layout as a student's profile).
import {
  BRAND,
  CLASS,
  albums,
  getAlbum,
  getTeacher,
  large,
  ownedPhotos,
  portraitSrc,
  students,
  studentAvatar,
  teacherAvatar,
  teacherName,
  teacherPhotos,
  teacherUrl,
  teachers,
} from "../data.ts";
import { icon } from "../lib/icons.ts";
import { esc, type Cleanup } from "../lib/router.ts";
import { hobbyList } from "../lib/theme.ts";
import { albumCards, albumCover } from "./album.ts";
import { mountMasonry, renderProfilePage, type ProfileTab } from "./profile.ts";

export function renderTeacher(root: HTMLElement, id: number): Cleanup {
  const t = getTeacher(id);
  if (!t || !t.name || t.hidden) return renderProfilePage(root, null);
  const list = teachers.filter((x) => x.name && !x.hidden);
  const i = list.findIndex((x) => x.id === t.id);
  const prev = list[(i - 1 + list.length) % list.length];
  const next = list[(i + 1) % list.length];
  const name = teacherName(t);
  const theme = t.theme ?? {};
  const hobbies = hobbyList(theme);
  const photos = teacherPhotos(t);
  const own = ownedPhotos(`t${t.id}`);

  const gradAlbum = getAlbum("grad");
  const groupShot = gradAlbum ? albumCover(gradAlbum) : undefined;
  const chosen = own.find((p) => p.id === t.coverPhoto);
  const wide = own.filter((p) => p.w > p.h);
  const covers = [
    ...(chosen ? [portraitSrc(chosen)] : []),
    ...(wide.length ? wide : own)
      .filter((p) => p !== chosen)
      .slice(0, 5)
      .map(portraitSrc),
  ];
  if (!covers.length && groupShot) covers.push(large(groupShot));

  const tabs: ProfileTab[] = [];
  if (photos.length)
    tabs.push({
      key: "photos",
      label: "รูป",
      count: photos.length,
      render: () => `<div class="pf-portfolio is-wide"><div data-masonry></div></div>`,
      mount: (panel, api) =>
        mountMasonry(panel.querySelector<HTMLElement>("[data-masonry]")!, photos, api, () => name),
    });
  tabs.push(
    {
      key: "about",
      label: "เกี่ยวกับ",
      render: () => `<div class="pf-about">
        <div class="pf-about-main">
          <h2>${esc(name)}</h2>
          ${t.quote ? `<p>${esc(t.quote)}</p>` : ""}
          <h3>นักเรียน ${CLASS.name}</h3>
          <div class="pf-mate-strip">${students
            .slice(0, 10)
            .map(
              (m) =>
                `<a href="/member/${m.no}" data-link title="${esc(m.nickname)}"><img src="${studentAvatar(m)}" alt=""><span>${esc(m.nickname)}</span></a>`,
            )
            .join("")}</div>
        </div>
        <aside class="pf-about-card">
          <div><span>${icon("user", 18)} ชื่อ</span><b>${esc(t.name)}</b></div>
          ${t.role ? `<div><span>${icon("briefcase", 18)} ตำแหน่ง</span><b>${esc(t.role)}</b></div>` : ""}
          ${t.subject ? `<div><span>${icon("book", 18)} วิชา</span><b>${esc(t.subject)}</b></div>` : ""}
          ${theme.song ? `<div><span>${icon("music", 18)} เพลงโปรด</span><b>${esc(theme.song)}</b></div>` : ""}
          ${hobbies.length ? `<div><span>${icon("heart", 18)} สิ่งที่ชอบ</span><b>${hobbies.map(esc).join(" · ")}</b></div>` : ""}
        </aside>
      </div>`,
    },
    { key: "albums", label: "อัลบั้ม", count: albums.length, render: () => albumCards(albums) },
  );

  return renderProfilePage(root, {
    docTitle: `${name} · ${BRAND}`,
    crumbs: [{ label: "คุณครู", href: "/#teachers" }, { label: name }],
    topNav:
      list.length > 1
        ? `<nav class="pf-step-nav" aria-label="คุณครูท่านอื่น">
      <a href="${teacherUrl(prev)}" data-link aria-label="${esc(teacherName(prev))}">${icon("chevronLeft", 18)}</a>
      <span>${i + 1} / ${list.length}</span>
      <a href="${teacherUrl(next)}" data-link aria-label="${esc(teacherName(next))}">${icon("chevronRight", 18)}</a>
    </nav>`
        : "",
    avatar: teacherAvatar(t),
    avatarShape: theme.avatar === "square" ? "square" : "round",
    name,
    nameBadge: theme.emoji,
    theme,
    handle: t.role || "คุณครู",
    handleNote: `${CLASS.name} · ${CLASS.gen}`,
    bio: t.quote || `คุณครูของห้อง ${CLASS.name}`,
    lines: [
      ...(t.nickname && t.name !== t.nickname ? [{ icon: "user", html: esc(t.name) }] : []),
      ...(t.subject ? [{ icon: "book", html: `วิชา ${esc(t.subject)}` }] : []),
      { icon: "home", html: `${CLASS.name} · Class of ${CLASS.yearEn}` },
      ...(theme.song ? [{ icon: "music", html: `เพลงโปรด: ${esc(theme.song)}` }] : []),
    ],
    stack: {
      avatars: students.slice(0, 3).map((s) => studentAvatar(s)),
      more: students.length - 3,
    },
    stats: [
      { value: String(students.length), label: "นักเรียน" },
      { value: String(photos.length), label: "รูป" },
      { value: String(albums.length), label: "อัลบั้ม" },
    ],
    follow: ["ขอบคุณครับ/ค่ะ", "ขอบคุณแล้ว"],
    covers,
    tags: [
      { label: CLASS.name, icon: "home" },
      ...(t.role ? [{ label: t.role, icon: "briefcase" }] : []),
      ...hobbies.slice(0, 2).map((h) => ({ label: h, icon: "heart" })),
    ],
    moreTags: hobbies.slice(2),
    preload: [teacherAvatar(t), covers[0]].filter(Boolean),
    tabs,
  });
}
