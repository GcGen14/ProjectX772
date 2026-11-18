import {
  BRAND,
  CLASS,
  albums,
  getAlbum,
  getStudent,
  large,
  portraitPhotos,
  portraitSrc,
  students,
  studentAvatar,
  type Photo,
  profileUrl,
  profileUrlByNo,
  wall,
} from "../data.ts";
import { icon } from "../lib/icons.ts";
import { api, myNo } from "../lib/api.ts";
import { effectiveTheme } from "../lib/signature.ts";
import { hobbyList } from "../lib/theme.ts";
import { extrasOf, setNoindex, socialLinksHtml } from "../lib/extras.ts";
import { esc, type Cleanup } from "../lib/router.ts";
import { albumCards, albumCover } from "./album.ts";
import { mountMasonry, renderProfilePage, type ProfileTab } from "./profile.ts";
import { bindWallComposer, wallCard, wallComposer } from "./wall.ts";

export function renderStudent(root: HTMLElement, no: number): Cleanup {
  const s = getStudent(no);
  if (!s) return renderProfilePage(root, null);
  const n = students.length;
  const prev = s.no > 1 ? s.no - 1 : n;
  const next = s.no < n ? s.no + 1 : 1;
  const mates = students.filter((x) => x.no !== s.no);
  const portraits = portraitPhotos(s);
  const caption = (p: Photo) => `${s.nickname}${p.group ? ` · ${p.group}` : ""}`;
  const field = (v: string, fallback: string) =>
    v ? esc(v) : `<span class="pf-ph">${fallback}</span>`;

  // Cover: landscape studio portraits, else the class photos they appear in, else a class group shot.
  const wide = s.portraits.filter((p) => p.w > p.h);
  const gradAlbum = getAlbum("grad");
  const groupShot = gradAlbum ? albumCover(gradAlbum) : undefined;
  const autoCovers = wide.length
    ? wide.slice(0, 6).map(portraitSrc)
    : s.memories.length
      ? s.memories.slice(0, 4).map(large)
      : groupShot
        ? [large(groupShot)]
        : [];
  // a cover the student picked on /me goes first
  const picked = s.coverPhoto
    ? (s.portraits.find((p) => p.id === s.coverPhoto) &&
        portraitSrc(s.portraits.find((p) => p.id === s.coverPhoto)!)) ||
      (s.memories.find((p) => p.id === s.coverPhoto) &&
        large(s.memories.find((p) => p.id === s.coverPhoto)!))
    : "";
  const shownCovers = picked ? [picked, ...autoCovers.filter((c) => c !== picked)] : autoCovers;
  const isMe = myNo() === s.no;
  const theme = effectiveTheme(s.no, s.theme, s.avatar);
  // privacy choices from /me
  const privacy = extrasOf(s.no).privacy;
  const hidePics = !!privacy.hidePhotos;
  setNoindex(!!privacy.noindex);
  const socials = socialLinksHtml(s.no, s.ig);
  const hobbies = hobbyList(theme);
  const covers = hidePics
    ? []
    : privacy.hideFace
      ? shownCovers.filter((c) => !c.includes("/photos/people/"))
      : shownCovers;

  const tabs: ProfileTab[] = [
    {
      key: "memories",
      label: "ความทรงจำ",
      count: hidePics ? 0 : s.memories.length,
      render: () =>
        hidePics
          ? `<p class="pf-empty">${icon("eyeOff", 18)} ${esc(s.nickname)} ซ่อนรูปในหน้าโปรไฟล์ไว้</p>`
          : s.memories.length
            ? `<p class="pf-note">${icon("sparkle", 16)} รูปที่ระบบหาใบหน้าของ ${esc(s.nickname)} เจอในอัลบั้มของห้อง (อาจพลาดบ้างในรูปหมู่ไกล ๆ)</p><div class="pf-portfolio is-wide"><div data-masonry></div></div>`
            : `<p class="pf-empty">${s.portraits.length ? "ยังหาใบหน้าไม่เจอในรูปของห้อง" : "ยังไม่มีรูปของเพื่อนคนนี้"}</p>`,
      mount: (panel, api) => {
        const host = panel.querySelector<HTMLElement>("[data-masonry]");
        if (host) mountMasonry(host, s.memories, api, caption);
      },
    },
  ];
  if (portraits.length && !hidePics && !privacy.hideFace)
    tabs.push({
      key: "portraits",
      label: "รูปเดี่ยว",
      count: portraits.length,
      render: () => `<div class="pf-portfolio is-wide"><div data-masonry></div></div>`,
      mount: (panel, api) =>
        mountMasonry(
          panel.querySelector<HTMLElement>("[data-masonry]")!,
          portraits,
          api,
          () => `${s.nickname} · รูปเดี่ยว`,
        ),
    });
  const me = myNo();
  const posts = wall.filter((p) => p.to === s.no);
  tabs.push(
    {
      key: "messages",
      label: "ข้อความ",
      count: posts.length,
      render: () => `<div class="pf-wall">
        ${
          isMe
            ? `<p class="pf-note">${icon("heart", 16)} ข้อความที่เพื่อนเขียนถึงคุณ จะขึ้นที่นี่หลังคุณกดอนุมัติ <a href="/chat/public" data-link>ตรวจข้อความที่รออนุมัติ</a></p>`
            : me
              ? `<div class="me-card pf-wall-compose">${wallComposer({ me, to: s.no, fixedTo: true })}</div>`
              : `<p class="pf-note">${icon("heart", 16)} <a href="/me" data-link>เข้าสู่ระบบ</a> เพื่อเขียนข้อความถึง ${esc(s.nickname)}</p>`
        }
        ${
          posts.length
            ? `<div class="wall-grid">${posts.map((p) => wallCard(p, { hideTo: true })).join("")}</div>`
            : `<p class="pf-empty">ยังไม่มีข้อความถึง ${esc(s.nickname)}</p>`
        }
      </div>`,
      mount: (panel, pageApi) =>
        bindWallComposer(
          panel,
          (to, text) => api.wallPost(to, text).then((r) => r.post),
          () => pageApi.toast(`ส่งแล้ว รอ ${s.nickname} อนุมัติก่อนขึ้นโปรไฟล์`),
        ),
    },
    { key: "albums", label: "อัลบั้ม", count: albums.length, render: () => albumCards(albums) },
    {
      key: "about",
      label: "เกี่ยวกับ",
      render: () => `<div class="pf-about">
        <div class="pf-about-main">
          <h2>${esc(s.nickname)}${s.nicknameEn ? ` <span class="muted">· ${esc(s.nicknameEn)}</span>` : ""}</h2>
          <p>${esc(s.quote)}</p>
          <h3>เพื่อนในห้อง</h3>
          <div class="pf-mate-strip">${mates
            .slice(Math.max(0, s.no - 5), Math.max(0, s.no - 5) + 8)
            .map(
              (m) =>
                `<a href="${profileUrl(m)}" data-link title="${esc(m.nickname)}"><img src="${studentAvatar(m)}" alt=""><span>${esc(m.nickname)}</span></a>`,
            )
            .join("")}</div>
        </div>
        <aside class="pf-about-card">
          <div><span>${icon("user", 18)} ชื่อจริง</span><b>${field(s.fullName, "รอเพิ่ม")}</b></div>
          <div><span>${icon("home", 18)} เลขที่</span><b>${s.no}</b></div>
          ${s.studentId ? `<div><span>${icon("book", 18)} รหัสนักเรียน</span><b>${esc(s.studentId)}</b></div>` : ""}
          ${s.group ? `<div><span>${icon("users", 18)} กลุ่ม</span><b>${esc(s.group)}</b></div>` : ""}
          <div><span>${icon("cake", 18)} วันเกิด</span><b>${field(s.birthday, "รอเพิ่ม")}</b></div>
          <div><span>${icon("sparkle", 18)} ความฝัน</span><b>${field(s.dream.startsWith("ความฝัน: รอ") ? "" : s.dream, "รอเพิ่ม")}</b></div>
          <div class="pf-about-socials"><span>${icon("globe", 18)} โซเชียล</span><b>${socials || `<span class="pf-ph">รอเพิ่ม</span>`}</b></div>
          ${theme.song ? `<div><span>${icon("music", 18)} เพลงโปรด</span><b>${esc(theme.song)}</b></div>` : ""}
          ${hobbies.length ? `<div><span>${icon("heart", 18)} สิ่งที่ชอบ</span><b>${hobbies.map(esc).join(" · ")}</b></div>` : ""}
          ${s.photoNote ? `<div><span>${icon("image", 18)} หมายเหตุ</span><b>${esc(s.photoNote)}</b></div>` : ""}
        </aside>
      </div>`,
    },
  );

  return renderProfilePage(root, {
    docTitle: `${s.nickname} · ${BRAND}`,
    crumbs: [{ label: "เพื่อน", href: "/#classmates" }, { label: `เลขที่ ${s.no}` }],
    topNav: `${isMe ? `<a class="pf-edit" href="/me" data-link>${icon("pen", 15)} แก้ไขโปรไฟล์</a>` : me ? `<a class="pf-edit" href="/chat/${s.no}" data-link>${icon("chat", 15)} แชท</a>` : ""}<nav class="pf-step-nav" aria-label="เพื่อนคนอื่น">
      <a href="${profileUrlByNo(prev)}" data-link aria-label="เลขที่ ${prev}">${icon("chevronLeft", 18)}</a>
      <span>${s.no} / ${n}</span>
      <a href="${profileUrlByNo(next)}" data-link aria-label="เลขที่ ${next}">${icon("chevronRight", 18)}</a>
    </nav>`,
    avatar: studentAvatar(s),
    avatarShape: theme.avatar === "square" ? "square" : "round",
    name: s.nickname,
    nameBadge: theme.emoji,
    theme,
    badges: s.badges,
    handle: `@602.${String(s.no).padStart(2, "0")}`,
    handleNote: `<b>เลขที่ ${s.no}</b>${s.studentId ? ` · ID ${esc(s.studentId)}` : ` ${CLASS.name}`}`,
    bio: s.quote,
    lines: [
      { icon: "sparkle", html: esc(s.dream) },
      s.studentId
        ? { icon: "book", html: `รหัสนักเรียน (ID) <b>${esc(s.studentId)}</b>` }
        : { icon: "home", html: `${CLASS.name} · ${CLASS.gen} · Class of ${CLASS.yearEn}` },
      ...(s.fullName ? [{ icon: "user", html: esc(s.fullName) }] : []),
      ...(theme.song ? [{ icon: "music", html: `เพลงโปรด: ${esc(theme.song)}` }] : []),
      ...(socials ? [{ icon: "globe", html: socials }] : []),
    ],
    stack: { avatars: mates.slice(0, 3).map(studentAvatar), more: mates.length - 3 },
    covers,
    tags: [
      s.studentId
        ? { label: `ID ${s.studentId}`, icon: "book" }
        : { label: CLASS.name, icon: "home" },
      ...(s.group ? [{ label: s.group, icon: "users" as const }] : []),
      { label: `Class of ${CLASS.yearEn}`, icon: "sparkle" },
      ...hobbies.slice(0, 2).map((h) => ({ label: h, icon: "heart" })),
    ],
    moreTags: hobbies.slice(2),
    preload: [studentAvatar(s), covers[0]].filter(Boolean),
    tabs,
  });
}
