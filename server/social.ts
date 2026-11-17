// Chat between classmates.
//
// PRIVATE chat is end-to-end encrypted in the browser (src/lib/e2e.ts). The server only stores
//   - each student's ECDH public key, and their private key wrapped with a chat PIN the server
//     never sees (so the key can be unlocked on another device),
//   - message ciphertext (AES-GCM) + which key versions were used.
// It can't read private messages.
//
// PUBLIC messages ("ข้อความถึงเพื่อน") are plain text addressed to a friend. They stay pending
// until that friend approves them (or the admin does), then show on the landing page and on the
// friend's profile.
//
//   GET  /api/wall                    approved public messages
//   GET  /api/wall/mine               messages to me (incl. pending) + ones I sent
//   POST /api/wall                    { to, text }           -> pending
//   POST /api/wall/:id                { action: approve | hide | delete }
//   GET  /api/admin/wall              everything (admin)
//
//   GET  /api/chat/keys               everyone's public keys (all versions)
//   GET  /api/chat/mykey              my wrapped private keys
//   POST /api/chat/mykey              { mode: "new" | "repin", ... }
//   GET  /api/chat/threads            my conversations (last message ciphertext + unread)
//   GET  /api/chat/messages/:no       ?before=id   page of a conversation
//   POST /api/chat/messages/:no       { iv, ct, fromV, toV }
//   POST /api/chat/read/:no           { upTo }
//   GET  /api/chat/poll               ?after=id    new messages + read receipts
//   GET  /api/chat/unread             badge counts
import type { DatabaseSync } from "node:sqlite";
import { HttpError, readJson, type Req } from "./http.ts";
import { clean, getDb, getStudentRow } from "./db.ts";

type Session = { no: number | null; isAdmin: boolean } | null;
type Raw = Record<string, unknown>;

const WALL_MAX = 300;
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
const now = () => new Date().toISOString();

let tablesReady = false;
export function ensureSocialTables(d: DatabaseSync = getDb()) {
  if (tablesReady) return;
  d.exec(`
    CREATE TABLE IF NOT EXISTS wall_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      author INTEGER NOT NULL REFERENCES students(no) ON DELETE CASCADE,
      recipient INTEGER NOT NULL REFERENCES students(no) ON DELETE CASCADE,
      text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'hidden')),
      created_at TEXT NOT NULL,
      reviewed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS wall_by_recipient ON wall_posts (recipient, status);
    CREATE TABLE IF NOT EXISTS chat_keys (
      no INTEGER NOT NULL REFERENCES students(no) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      pub TEXT NOT NULL,         -- raw P-256 public key, base64
      wrapped TEXT NOT NULL,     -- pkcs8 private key encrypted with the PIN-derived key, base64
      salt TEXT NOT NULL,
      iv TEXT NOT NULL,
      iter INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (no, version)
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender INTEGER NOT NULL REFERENCES students(no) ON DELETE CASCADE,
      recipient INTEGER NOT NULL REFERENCES students(no) ON DELETE CASCADE,
      sender_v INTEGER NOT NULL,
      recipient_v INTEGER NOT NULL,
      iv TEXT NOT NULL,
      ct TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS chat_by_sender ON chat_messages (sender, recipient, id);
    CREATE INDEX IF NOT EXISTS chat_by_recipient ON chat_messages (recipient, sender, id);
    CREATE TABLE IF NOT EXISTS chat_reads (
      reader INTEGER NOT NULL,
      peer INTEGER NOT NULL,
      last_id INTEGER NOT NULL,
      PRIMARY KEY (reader, peer)
    );
  `);
  tablesReady = true;
}

/* ---------------- tiny per-user rate limit ---------------- */
const hits = new Map<string, number[]>();
function limit(key: string, max: number, windowMs: number, msg: string) {
  const t = Date.now();
  const list = (hits.get(key) ?? []).filter((x) => x > t - windowMs);
  if (list.length >= max) throw new HttpError(429, msg);
  list.push(t);
  hits.set(key, list);
}

/* ---------------- helpers ---------------- */
const wallRow = (r: Raw) => ({
  id: Number(r.id),
  from: Number(r.author),
  to: Number(r.recipient),
  text: String(r.text),
  status: String(r.status) as "pending" | "approved" | "hidden",
  at: String(r.created_at),
});

const msgRow = (r: Raw) => ({
  id: Number(r.id),
  from: Number(r.sender),
  to: Number(r.recipient),
  fromV: Number(r.sender_v),
  toV: Number(r.recipient_v),
  iv: String(r.iv),
  ct: String(r.ct),
  at: String(r.created_at),
});

function b64(v: unknown, max: number, name: string): string {
  const s = typeof v === "string" ? v : "";
  if (!s || s.length > max || !B64.test(s)) throw new HttpError(400, `${name} ไม่ถูกต้อง`);
  return s;
}

function student(no: unknown): number {
  const n = Number(no);
  if (!Number.isInteger(n) || !getStudentRow(n)) throw new HttpError(404, "ไม่พบเพื่อนคนนี้");
  return n;
}

const currentKey = (d: DatabaseSync, no: number) =>
  d
    .prepare("SELECT version, pub FROM chat_keys WHERE no = ? ORDER BY version DESC LIMIT 1")
    .get(no) as { version: number; pub: string } | undefined;

function unreadCounts(d: DatabaseSync, me: number) {
  const rows = d
    .prepare(
      `SELECT m.sender AS peer, COUNT(*) AS n FROM chat_messages m
       LEFT JOIN chat_reads r ON r.reader = ? AND r.peer = m.sender
       WHERE m.recipient = ? AND m.id > COALESCE(r.last_id, 0)
       GROUP BY m.sender`,
    )
    .all(me, me) as { peer: number; n: number }[];
  return Object.fromEntries(rows.map((r) => [r.peer, Number(r.n)]));
}

/** How far each peer has read the messages I sent them. */
function peerReads(d: DatabaseSync, me: number) {
  const rows = d.prepare("SELECT reader, last_id FROM chat_reads WHERE peer = ?").all(me) as {
    reader: number;
    last_id: number;
  }[];
  return Object.fromEntries(rows.map((r) => [r.reader, Number(r.last_id)]));
}

const pendingCount = (d: DatabaseSync, me: number) =>
  Number(
    (
      d
        .prepare("SELECT COUNT(*) AS c FROM wall_posts WHERE recipient = ? AND status = 'pending'")
        .get(me) as { c: number }
    ).c,
  );

/**
 * Handles /api/wall*, /api/chat/* and /api/admin/wall. Returns the JSON body to send,
 * or undefined when the path isn't one of ours.
 */
export async function handleSocial(
  req: Req,
  path: string,
  url: URL,
  session: Session,
): Promise<unknown> {
  const isWall = path === "/api/wall" || path.startsWith("/api/wall/");
  const isChat = path.startsWith("/api/chat/");
  if (!isWall && !isChat && path !== "/api/admin/wall") return undefined;
  const d = getDb();
  ensureSocialTables(d);
  const m = req.method;

  /* ---------------- public wall ---------------- */
  if (path === "/api/wall" && m === "GET") {
    const rows = d
      .prepare("SELECT * FROM wall_posts WHERE status = 'approved' ORDER BY id DESC LIMIT 300")
      .all() as Raw[];
    // public view doesn't need the status field
    return { posts: rows.map(wallRow).map(({ status: _s, ...p }) => p) };
  }

  if (path === "/api/admin/wall" && m === "GET") {
    if (!session?.isAdmin) throw new HttpError(401, "ต้องเข้าสู่ระบบผู้ดูแล");
    const rows = d.prepare("SELECT * FROM wall_posts ORDER BY id DESC LIMIT 1000").all() as Raw[];
    return { posts: rows.map(wallRow) };
  }

  if (!session) throw new HttpError(401, "กรุณาเข้าสู่ระบบก่อน");

  const wm = path.match(/^\/api\/wall\/(\d+)$/);
  if (wm && m === "POST") {
    const id = Number(wm[1]);
    const row = d.prepare("SELECT * FROM wall_posts WHERE id = ?").get(id) as Raw | undefined;
    if (!row) throw new HttpError(404, "ไม่พบข้อความนี้");
    const post = wallRow(row);
    const body = await readJson(req);
    const action = body.action;
    const isRecipient = session.no === post.to;
    const isAuthor = session.no === post.from;
    if (action === "approve" || action === "hide") {
      // the friend it's written to reviews it (the admin can too)
      if (!isRecipient && !session.isAdmin) throw new HttpError(403, "เฉพาะเจ้าของโปรไฟล์ที่อนุมัติได้");
      d.prepare("UPDATE wall_posts SET status = ?, reviewed_at = ? WHERE id = ?").run(
        action === "approve" ? "approved" : "hidden",
        now(),
        id,
      );
      return { post: wallRow(d.prepare("SELECT * FROM wall_posts WHERE id = ?").get(id) as Raw) };
    }
    if (action === "delete") {
      if (!isRecipient && !isAuthor && !session.isAdmin) throw new HttpError(403, "ไม่อนุญาต");
      d.prepare("DELETE FROM wall_posts WHERE id = ?").run(id);
      return { ok: true };
    }
    throw new HttpError(400, "action ไม่ถูกต้อง");
  }

  // everything below needs a student (the admin account has no classmates to chat with)
  if (session.isAdmin || session.no == null)
    throw new HttpError(403, "บัญชีผู้ดูแลใช้แชทไม่ได้ เข้าสู่ระบบด้วยบัญชีนักเรียน");
  const me = session.no;

  if (path === "/api/wall/mine" && m === "GET") {
    const inbox = d
      .prepare("SELECT * FROM wall_posts WHERE recipient = ? ORDER BY id DESC LIMIT 300")
      .all(me) as Raw[];
    const sent = d
      .prepare("SELECT * FROM wall_posts WHERE author = ? ORDER BY id DESC LIMIT 300")
      .all(me) as Raw[];
    return { inbox: inbox.map(wallRow), sent: sent.map(wallRow) };
  }

  if (path === "/api/wall" && m === "POST") {
    const body = await readJson(req);
    const to = student(body.to);
    if (to === me) throw new HttpError(400, "เขียนถึงตัวเองไม่ได้นะ");
    const text = clean(body.text, WALL_MAX + 1);
    if (!text) throw new HttpError(400, "พิมพ์ข้อความก่อนนะ");
    if (text.length > WALL_MAX) throw new HttpError(400, `ข้อความยาวได้ไม่เกิน ${WALL_MAX} ตัว`);
    limit(`wall:${me}`, 20, 60 * 60 * 1000, "ส่งข้อความสาธารณะเยอะเกินไป ลองใหม่ในอีกสักพัก");
    const r = d
      .prepare(
        "INSERT INTO wall_posts (author, recipient, text, status, created_at) VALUES (?, ?, ?, 'pending', ?)",
      )
      .run(me, to, text, now());
    return {
      post: wallRow(
        d.prepare("SELECT * FROM wall_posts WHERE id = ?").get(Number(r.lastInsertRowid)) as Raw,
      ),
    };
  }

  /* ---------------- private chat: keys ---------------- */
  if (path === "/api/chat/keys" && m === "GET") {
    const rows = d.prepare("SELECT no, version, pub FROM chat_keys ORDER BY no, version").all() as {
      no: number;
      version: number;
      pub: string;
    }[];
    return { keys: rows.map((r) => ({ no: r.no, v: r.version, pub: r.pub })) };
  }

  if (path === "/api/chat/mykey" && m === "GET") {
    const rows = d
      .prepare(
        "SELECT version, pub, wrapped, salt, iv, iter FROM chat_keys WHERE no = ? ORDER BY version DESC",
      )
      .all(me) as Raw[];
    return {
      keys: rows.map((r) => ({
        v: Number(r.version),
        pub: String(r.pub),
        wrapped: String(r.wrapped),
        salt: String(r.salt),
        iv: String(r.iv),
        iter: Number(r.iter),
      })),
    };
  }

  if (path === "/api/chat/mykey" && m === "POST") {
    const body = await readJson(req);
    limit(`key:${me}`, 10, 60 * 60 * 1000, "เปลี่ยนกุญแจบ่อยเกินไป ลองใหม่ภายหลัง");
    const wrapped = b64(body.wrapped, 1000, "wrapped");
    const salt = b64(body.salt, 64, "salt");
    const iv = b64(body.iv, 32, "iv");
    const iter = Number(body.iter);
    if (!Number.isInteger(iter) || iter < 100_000 || iter > 5_000_000)
      throw new HttpError(400, "iter ไม่ถูกต้อง");
    const cur = currentKey(d, me);
    if (body.mode === "repin") {
      // same key pair, new PIN: only re-wraps the current private key
      if (!cur || Number(body.v) !== cur.version)
        throw new HttpError(409, "กุญแจเปลี่ยนไปแล้ว รีเฟรชหน้า");
      d.prepare(
        "UPDATE chat_keys SET wrapped = ?, salt = ?, iv = ?, iter = ? WHERE no = ? AND version = ?",
      ).run(wrapped, salt, iv, iter, me, cur.version);
      return { v: cur.version };
    }
    if (body.mode === "new") {
      const pub = b64(body.pub, 200, "pub");
      const v = (cur?.version ?? 0) + 1;
      d.prepare(
        "INSERT INTO chat_keys (no, version, pub, wrapped, salt, iv, iter, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(me, v, pub, wrapped, salt, iv, iter, now());
      return { v };
    }
    throw new HttpError(400, "mode ไม่ถูกต้อง");
  }

  /* ---------------- private chat: messages ---------------- */
  if (path === "/api/chat/threads" && m === "GET") {
    const last = d
      .prepare(
        `SELECT peer, MAX(id) AS last_id FROM (
           SELECT recipient AS peer, id FROM chat_messages WHERE sender = ?
           UNION ALL
           SELECT sender AS peer, id FROM chat_messages WHERE recipient = ?
         ) GROUP BY peer ORDER BY last_id DESC`,
      )
      .all(me, me) as { peer: number; last_id: number }[];
    const get = d.prepare("SELECT * FROM chat_messages WHERE id = ?");
    const unread = unreadCounts(d, me);
    return {
      threads: last.map((t) => ({
        peer: Number(t.peer),
        last: msgRow(get.get(t.last_id) as Raw),
        unread: unread[t.peer] ?? 0,
      })),
      reads: peerReads(d, me),
    };
  }

  const cm = path.match(/^\/api\/chat\/(messages|read)\/(\d+)$/);
  if (cm) {
    const peer = student(cm[2]);
    if (peer === me) throw new HttpError(400, "แชทกับตัวเองไม่ได้");
    if (cm[1] === "messages" && m === "GET") {
      const before = Number(url.searchParams.get("before")) || Number.MAX_SAFE_INTEGER;
      const rows = d
        .prepare(
          `SELECT * FROM chat_messages
           WHERE ((sender = ? AND recipient = ?) OR (sender = ? AND recipient = ?)) AND id < ?
           ORDER BY id DESC LIMIT 60`,
        )
        .all(me, peer, peer, me, before) as Raw[];
      return { messages: rows.map(msgRow).reverse(), more: rows.length === 60 };
    }
    if (cm[1] === "messages" && m === "POST") {
      const body = await readJson(req);
      limit(`chat:${me}`, 40, 60 * 1000, "ส่งเร็วเกินไป รอสักครู่นะ");
      const iv = b64(body.iv, 32, "iv");
      const ct = b64(body.ct, 12_000, "ข้อความ");
      const mine = currentKey(d, me);
      const theirs = currentKey(d, peer);
      if (!mine) throw new HttpError(409, "ตั้ง PIN แชทก่อนนะ");
      if (!theirs) throw new HttpError(409, "เพื่อนยังไม่ได้เปิดใช้แชทส่วนตัว");
      // the client must have encrypted for the *current* keys, otherwise one side can't read it
      if (Number(body.fromV) !== mine.version || Number(body.toV) !== theirs.version)
        throw new HttpError(409, "กุญแจของเพื่อนเปลี่ยนแล้ว ส่งใหม่อีกครั้ง");
      const r = d
        .prepare(
          "INSERT INTO chat_messages (sender, recipient, sender_v, recipient_v, iv, ct, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .run(me, peer, mine.version, theirs.version, iv, ct, now());
      return {
        message: msgRow(
          d
            .prepare("SELECT * FROM chat_messages WHERE id = ?")
            .get(Number(r.lastInsertRowid)) as Raw,
        ),
      };
    }
    if (cm[1] === "read" && m === "POST") {
      const body = await readJson(req);
      const upTo = Math.max(0, Number(body.upTo) | 0);
      d.prepare(
        `INSERT INTO chat_reads (reader, peer, last_id) VALUES (?, ?, ?)
         ON CONFLICT(reader, peer) DO UPDATE SET last_id = MAX(last_id, excluded.last_id)`,
      ).run(me, peer, upTo);
      return { ok: true };
    }
  }

  if (path === "/api/chat/poll" && m === "GET") {
    const after = Math.max(0, Number(url.searchParams.get("after")) | 0);
    const rows = d
      .prepare(
        "SELECT * FROM chat_messages WHERE (sender = ? OR recipient = ?) AND id > ? ORDER BY id LIMIT 200",
      )
      .all(me, me, after) as Raw[];
    return { messages: rows.map(msgRow), reads: peerReads(d, me), pending: pendingCount(d, me) };
  }

  if (path === "/api/chat/unread" && m === "GET") {
    const unread = unreadCounts(d, me);
    return {
      private: Object.values(unread).reduce((a, b) => a + b, 0),
      pending: pendingCount(d, me),
    };
  }

  throw new HttpError(404, "ไม่พบ");
}
