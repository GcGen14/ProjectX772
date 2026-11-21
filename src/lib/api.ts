// Client for the class database API (server/api.ts).
import type {
  AlbumData,
  EventRec,
  PhotoInfo,
  Roster,
  StudentRecord,
  TagFix,
  WallPost,
} from "../data.ts";
import type { Badge } from "./badges.ts";
import type { WrappedKey } from "./e2e.ts";

export type Job = {
  kind: "sync" | "faces";
  state: "running" | "done" | "error";
  done: number;
  total: number;
  message: string;
  startedAt: string;
  finishedAt?: string;
  added?: number;
};
export type AdminAlbum = Omit<AlbumData, "photos" | "videos"> & {
  hidden: boolean;
  sort: number;
  photoCount: number;
  videoCount: number;
  cover: { id: string; base?: "photos" | "media"; large?: boolean } | null;
};
type People = {
  sets: { set: number; portraits: { id: string; w: number; h: number }[]; photos: string[] }[];
  tags?: Record<string, number[][]>;
  students?: { no: number; photos: string[] }[];
  studentTags?: Record<string, number[][]>;
};

export type PhotoData = { info: Record<string, PhotoInfo>; tags: TagFix[] };

export type Me =
  | { user: null }
  | { user: { admin: true } }
  | { user: { no: number; needsPassword: boolean }; student: StudentRecord };

export type WallItem = WallPost & { status: "pending" | "approved" | "hidden" };
export type ChatMessage = {
  id: number;
  from: number;
  to: number;
  fromV: number;
  toV: number;
  iv: string;
  ct: string;
  at: string;
};
export type ChatThread = { peer: number; last: ChatMessage; unread: number };

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("application/json"))
    throw new ApiError(res.status, "ไม่มีเซิร์ฟเวอร์ฐานข้อมูล (เปิดด้วย npm run dev / preview / start)");
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? res.statusText);
  return data;
}

export const api = {
  /* photo owners + teachers (server/roster.ts) */
  roster: () => call<Roster>("GET", "/api/roster"),
  students: () => call<{ students: StudentRecord[] }>("GET", "/api/students"),
  badges: () => call<{ badges: Badge[] }>("GET", "/api/badges"),
  me: () => call<Me>("GET", "/api/me"),
  login: (no: number, password: string) =>
    call<{ ok: true; needsPassword: boolean }>("POST", "/api/login", { no, password }),
  logout: () => call<{ ok: true }>("POST", "/api/logout", {}),
  setPassword: (next: string, current?: string) =>
    call<{ ok: true }>("POST", "/api/me/password", { next, current }),
  updateMe: (patch: Partial<StudentRecord>) =>
    call<{ student: StudentRecord }>("PUT", "/api/me", patch),
  photos: () => call<PhotoData>("GET", "/api/photos"),
  savePhoto: (id: string, caption: string, location: string) =>
    call<PhotoData>("PUT", `/api/photos/${id}`, { caption, location }),
  tagPhoto: (id: string, no: number, action: "add" | "remove" | "auto") =>
    call<PhotoData>("POST", `/api/photos/${id}/tag`, { no, action }),
  albums: () => call<{ albums: AlbumData[] }>("GET", "/api/albums"),
  people: () => call<People>("GET", "/api/people"),
  events: () => call<{ events: EventRec[] }>("GET", "/api/events"),
  adminLogin: (password: string) => call<{ ok: true }>("POST", "/api/admin/login", { password }),
  /* public messages */
  wall: () => call<{ posts: WallPost[] }>("GET", "/api/wall"),
  wallMine: () => call<{ inbox: WallItem[]; sent: WallItem[] }>("GET", "/api/wall/mine"),
  wallPost: (to: number, text: string) =>
    call<{ post: WallItem }>("POST", "/api/wall", { to, text }),
  wallAction: (id: number, action: "approve" | "hide" | "delete") =>
    call<{ post?: WallItem; ok?: true }>("POST", `/api/wall/${id}`, { action }),
  /* private chat (ciphertext only) */
  chatKeys: () => call<{ keys: { no: number; v: number; pub: string }[] }>("GET", "/api/chat/keys"),
  chatMyKey: () => call<{ keys: WrappedKey[] }>("GET", "/api/chat/mykey"),
  chatSaveKey: (
    body: { mode: "new"; pub: string } | { mode: "repin"; v: number },
    w: { wrapped: string; salt: string; iv: string; iter: number },
  ) => call<{ v: number }>("POST", "/api/chat/mykey", { ...body, ...w }),
  chatThreads: () =>
    call<{ threads: ChatThread[]; reads: Record<string, number> }>("GET", "/api/chat/threads"),
  chatMessages: (peer: number, before?: number) =>
    call<{ messages: ChatMessage[]; more: boolean }>(
      "GET",
      `/api/chat/messages/${peer}${before ? `?before=${before}` : ""}`,
    ),
  chatSend: (peer: number, body: { iv: string; ct: string; fromV: number; toV: number }) =>
    call<{ message: ChatMessage }>("POST", `/api/chat/messages/${peer}`, body),
  chatRead: (peer: number, upTo: number) =>
    call<{ ok: true }>("POST", `/api/chat/read/${peer}`, { upTo }),
  chatPoll: (after: number) =>
    call<{ messages: ChatMessage[]; reads: Record<string, number>; pending: number }>(
      "GET",
      `/api/chat/poll?after=${after}`,
    ),
  chatUnread: () => call<{ private: number; pending: number }>("GET", "/api/chat/unread"),
};

/** Logged-in state shared across pages (refreshed on load and after login/logout). */
export let session: Me = { user: null };
export async function refreshSession(): Promise<Me> {
  try {
    session = await api.me();
  } catch {
    session = { user: null };
  }
  return session;
}
export const myNo = () => (session.user && "no" in session.user ? session.user.no : null);
