// Admin-only API calls. This file is only reachable from the admin chunk (src/pages/backend.ts),
// which the server sends to a logged-in admin and nobody else, so none of these endpoints are
// visible in the public JavaScript.
import type { Roster, StudentRecord, Teacher } from "../data.ts";
import type { Badge } from "./badges.ts";
import { call, type AdminAlbum, type Job, type WallItem } from "./api.ts";

export const adminApi = {
  adminRenumber: (from: number, to: number, mode: "all" | "photos") =>
    call<Roster>("POST", "/api/admin/renumber", { from, to, mode }),
  adminSetOwner: (photos: string[], owner: string) =>
    call<Roster>("POST", "/api/admin/owner", { photos, owner }),
  adminAddTeacher: () => call<Roster & { created: number }>("POST", "/api/admin/teachers", {}),
  adminUpdateTeacher: (id: number, patch: Partial<Teacher>) =>
    call<Roster>("PUT", `/api/admin/teachers/${id}`, patch),
  adminMoveTeacher: (id: number, dir: -1 | 1) =>
    call<Roster>("POST", `/api/admin/teachers/${id}/move`, { dir }),
  adminDeleteTeacher: (id: number) => call<Roster>("DELETE", `/api/admin/teachers/${id}`, {}),
  adminUpload: (body: { data: string; face: string; w: number; h: number; owner?: string }) =>
    call<Roster & { uploaded: string }>("POST", "/api/admin/upload", body),
  adminDeleteUpload: (id: string) => call<Roster>("DELETE", `/api/admin/upload/${id}`, {}),
  adminSaveBadges: (badges: Badge[]) =>
    call<{ badges: Badge[] }>("PUT", "/api/admin/badges", { badges }),
  adminAlbums: () =>
    call<{ albums: AdminAlbum[]; jobs: Record<string, Job> }>("GET", "/api/admin/albums"),
  adminJobs: () => call<{ jobs: Record<string, Job> }>("GET", "/api/admin/jobs"),
  adminAddAlbum: (body: { folder: string; title?: string; en?: string; tagline?: string }) =>
    call<{ slug: string; job: Job }>("POST", "/api/admin/albums", body),
  adminUpdateAlbum: (slug: string, patch: Record<string, unknown>) =>
    call<{ album: AdminAlbum }>("PUT", `/api/admin/albums/${slug}`, patch),
  adminSyncAlbum: (slug: string) =>
    call<{ job: Job }>("POST", `/api/admin/albums/${slug}/sync`, {}),
  adminAddFolder: (slug: string, folder: string) =>
    call<{ job: Job }>("POST", `/api/admin/albums/${slug}/folders`, { folder }),
  adminDeleteAlbum: (slug: string) => call<{ ok: true }>("DELETE", `/api/admin/albums/${slug}`, {}),
  adminRunFaces: () => call<{ job: Job }>("POST", "/api/admin/faces", {}),
  adminStudents: () =>
    call<{
      students: (StudentRecord & {
        account: { claimed: boolean; code: string | null; lastLogin: string | null };
      })[];
    }>("GET", "/api/admin/students"),
  adminUpdate: (no: number, patch: Partial<StudentRecord>) =>
    call<{ student: StudentRecord }>("PUT", `/api/admin/students/${no}`, patch),
  adminWall: () => call<{ posts: WallItem[] }>("GET", "/api/admin/wall"),
  adminReset: (no: number) =>
    call<{ ok: true; code: string }>("POST", `/api/admin/students/${no}/reset`, {}),
};
