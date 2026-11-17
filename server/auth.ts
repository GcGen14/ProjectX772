// Passwords, one-time codes, sessions and login rate limiting.
import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

const SESSION_DAYS = 30;
// No 0/O/1/I/L so codes are easy to read out loud or copy from paper.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function newCode(len = 6): string {
  const bytes = crypto.randomBytes(len);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

/** scrypt hash stored as "salt:hash" (hex). */
export function hashSecret(secret: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(secret.normalize("NFKC"), salt, 32);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifySecret(secret: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(
    secret.normalize("NFKC"),
    Buffer.from(saltHex, "hex"),
    expected.length,
  );
  return crypto.timingSafeEqual(expected, actual);
}

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export function createSession(
  db: DatabaseSync,
  who: { no: number | null; isAdmin: boolean },
): { token: string; maxAge: number } {
  const token = crypto.randomBytes(32).toString("base64url");
  const maxAge = SESSION_DAYS * 86400;
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
  db.prepare("INSERT INTO sessions (token_hash, no, is_admin, expires_at) VALUES (?, ?, ?, ?)").run(
    sha(token),
    who.no,
    who.isAdmin ? 1 : 0,
    Date.now() + maxAge * 1000,
  );
  return { token, maxAge };
}

export function readSession(
  db: DatabaseSync,
  token: string | undefined,
): { no: number | null; isAdmin: boolean } | null {
  if (!token) return null;
  const row = db
    .prepare("SELECT no, is_admin, expires_at FROM sessions WHERE token_hash = ?")
    .get(sha(token)) as { no: number | null; is_admin: number; expires_at: number } | undefined;
  if (!row || row.expires_at < Date.now()) return null;
  return { no: row.no, isAdmin: row.is_admin === 1 };
}

export function deleteSession(db: DatabaseSync, token: string | undefined) {
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha(token));
}

export function deleteSessionsFor(db: DatabaseSync, no: number) {
  db.prepare("DELETE FROM sessions WHERE no = ?").run(no);
}

/* ---- rate limiting: max N failed logins per key per window ---- */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILS = 8;
const fails = new Map<string, { n: number; until: number }>();

export function isLocked(key: string): boolean {
  const f = fails.get(key);
  return !!f && f.until > Date.now() && f.n >= MAX_FAILS;
}
export function noteFail(key: string) {
  const f = fails.get(key);
  if (!f || f.until < Date.now()) fails.set(key, { n: 1, until: Date.now() + WINDOW_MS });
  else f.n++;
}
export function clearFails(key: string) {
  fails.delete(key);
}
