// End-to-end encryption for private chat. Everything here runs in the browser only.
//
//   key pair   ECDH P-256, made on the student's device
//   backup     the private key (pkcs8) is encrypted with AES-GCM using a key derived from the chat
//              PIN (PBKDF2-SHA256) and uploaded, so the same key can be unlocked on another device.
//              The PIN itself never leaves the browser.
//   on device  the unlocked private key is kept in IndexedDB as a non-extractable CryptoKey
//   messages   ECDH(my private, their public) -> HKDF-SHA256 -> AES-GCM-256, random 96-bit IV,
//              sender/recipient + key versions bound in as additional data
//
// The server only ever sees public keys, wrapped (PIN-encrypted) private keys and ciphertext.

export type WrappedKey = {
  v: number;
  pub: string;
  wrapped: string;
  salt: string;
  iv: string;
  iter: number;
};
export type Cipher = { iv: string; ct: string };

const PBKDF2_ITER = 310_000;
const enc = new TextEncoder();
const dec = new TextDecoder();
const EC = { name: "ECDH", namedCurve: "P-256" } as const;

export const e2eSupported = () => !!globalThis.crypto?.subtle && "indexedDB" in globalThis;

function subtle(): SubtleCrypto {
  if (!globalThis.crypto?.subtle)
    throw new Error("เบราว์เซอร์นี้เข้ารหัสไม่ได้ (ต้องเปิดเว็บผ่าน https หรือ localhost)");
  return crypto.subtle;
}

export const toB64 = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
};
export const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n));

/* ---------------- IndexedDB key store ---------------- */
const DB_NAME = "602-chat";
const STORE = "keys";
let dbp: Promise<IDBDatabase> | null = null;
function idb(): Promise<IDBDatabase> {
  dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function tx<T>(
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await idb();
  return new Promise((res, rej) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
const keyId = (no: number, v: number) => `${no}:${v}`;
const memKeys = new Map<string, CryptoKey>();

async function localKey(no: number, v: number): Promise<CryptoKey | null> {
  const id = keyId(no, v);
  if (memKeys.has(id)) return memKeys.get(id)!;
  try {
    const k = (await tx("readonly", (s) => s.get(id))) as CryptoKey | undefined;
    if (k) memKeys.set(id, k);
    return k ?? null;
  } catch {
    return null;
  }
}

async function storeKey(no: number, v: number, key: CryptoKey) {
  memKeys.set(keyId(no, v), key);
  try {
    await tx("readwrite", (s) => s.put(key, keyId(no, v)));
  } catch {
    /* private mode etc.: key stays in memory for this tab only */
  }
}

/** Which of my key versions are unlocked on this device. */
export async function unlockedVersions(no: number, versions: number[]): Promise<number[]> {
  const out: number[] = [];
  for (const v of versions) if (await localKey(no, v)) out.push(v);
  return out;
}

/** Remove every unlocked key from this device (on logout). */
export async function forgetKeys() {
  memKeys.clear();
  sharedCache.clear();
  try {
    await tx("readwrite", (s) => s.clear());
  } catch {
    /* nothing stored */
  }
}

/* ---------------- PIN wrapping ---------------- */
async function pinKey(pin: string, salt: Uint8Array, iter: number) {
  const base = await subtle().importKey("raw", enc.encode(pin.normalize("NFKC")), "PBKDF2", false, [
    "deriveKey",
  ]);
  return subtle().deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: iter },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function wrap(pkcs8: ArrayBuffer, pin: string) {
  const salt = rand(16);
  const iv = rand(12);
  const k = await pinKey(pin, salt, PBKDF2_ITER);
  const wrapped = await subtle().encrypt({ name: "AES-GCM", iv: iv as BufferSource }, k, pkcs8);
  return { wrapped: toB64(wrapped), salt: toB64(salt), iv: toB64(iv), iter: PBKDF2_ITER };
}

async function unwrapPkcs8(w: WrappedKey, pin: string): Promise<ArrayBuffer> {
  const k = await pinKey(pin, fromB64(w.salt), w.iter);
  return subtle().decrypt(
    { name: "AES-GCM", iv: fromB64(w.iv) as BufferSource },
    k,
    fromB64(w.wrapped) as BufferSource,
  );
}

const importPrivate = (pkcs8: ArrayBuffer) =>
  subtle().importKey("pkcs8", pkcs8, EC, false, ["deriveBits"]);

/**
 * Make a new key pair protected by `pin`. Upload `pub` + the wrapped fields, then call
 * `keep(version)` with the version the server gave it to keep the key on this device.
 */
export async function createKey(no: number, pin: string) {
  const kp = (await subtle().generateKey(EC, true, ["deriveBits"])) as CryptoKeyPair;
  const pkcs8 = await subtle().exportKey("pkcs8", kp.privateKey);
  const pub = toB64(await subtle().exportKey("raw", kp.publicKey));
  const w = await wrap(pkcs8, pin);
  const priv = await importPrivate(pkcs8);
  return { pub, ...w, keep: (v: number) => storeKey(no, v, priv) };
}

/** Unlock my uploaded keys with the PIN. Returns the versions that opened (wrong PIN -> []). */
export async function unlockKeys(no: number, keys: WrappedKey[], pin: string): Promise<number[]> {
  const ok: number[] = [];
  for (const k of keys) {
    try {
      await storeKey(no, k.v, await importPrivate(await unwrapPkcs8(k, pin)));
      ok.push(k.v);
    } catch {
      /* wrong PIN for this version */
    }
  }
  return ok;
}

/** Re-wrap a key with a new PIN (needs the old PIN). */
export async function rewrapKey(k: WrappedKey, oldPin: string, newPin: string) {
  let pkcs8: ArrayBuffer;
  try {
    pkcs8 = await unwrapPkcs8(k, oldPin);
  } catch {
    throw new Error("PIN เดิมไม่ถูกต้อง");
  }
  return wrap(pkcs8, newPin);
}

/* ---------------- messages ---------------- */
const sharedCache = new Map<string, Promise<CryptoKey>>();

/** The AES key for one pair of (student, key version). Same on both sides. */
function sharedKey(me: number, myV: number, peer: number, peerV: number, peerPub: string) {
  const id = `${me}.${myV}|${peer}.${peerV}|${peerPub}`;
  let p = sharedCache.get(id);
  if (!p) {
    p = (async () => {
      const priv = await localKey(me, myV);
      if (!priv) throw new LockedError();
      const pub = await subtle().importKey("raw", fromB64(peerPub) as BufferSource, EC, false, []);
      const bits = await subtle().deriveBits({ name: "ECDH", public: pub }, priv, 256);
      const hk = await subtle().importKey("raw", bits, "HKDF", false, ["deriveKey"]);
      const [a, b] =
        me < peer ? [`${me}.${myV}`, `${peer}.${peerV}`] : [`${peer}.${peerV}`, `${me}.${myV}`];
      return subtle().deriveKey(
        {
          name: "HKDF",
          hash: "SHA-256",
          salt: enc.encode("602-chat/v1"),
          info: enc.encode(`${a}|${b}`),
        },
        hk,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
      );
    })();
    p.catch(() => sharedCache.delete(id));
    sharedCache.set(id, p);
  }
  return p;
}

export class LockedError extends Error {
  constructor() {
    super("locked");
  }
}

const aad = (from: number, fromV: number, to: number, toV: number) =>
  enc.encode(`602-chat|${from}.${fromV}>${to}.${toV}`);

export async function encryptText(
  text: string,
  p: { me: number; myV: number; peer: number; peerV: number; peerPub: string },
): Promise<Cipher> {
  const key = await sharedKey(p.me, p.myV, p.peer, p.peerV, p.peerPub);
  const iv = rand(12);
  const body = enc.encode(JSON.stringify({ t: text }));
  const ct = await subtle().encrypt(
    {
      name: "AES-GCM",
      iv: iv as BufferSource,
      additionalData: aad(p.me, p.myV, p.peer, p.peerV) as BufferSource,
    },
    key,
    body,
  );
  return { iv: toB64(iv), ct: toB64(ct) };
}

/** Decrypt a stored message. `pubOf(no, v)` returns that student's public key version. */
export async function decryptText(
  me: number,
  m: { from: number; to: number; fromV: number; toV: number; iv: string; ct: string },
  pubOf: (no: number, v: number) => string | undefined,
): Promise<string> {
  const mine = m.from === me;
  const peer = mine ? m.to : m.from;
  const myV = mine ? m.fromV : m.toV;
  const peerV = mine ? m.toV : m.fromV;
  const peerPub = pubOf(peer, peerV);
  if (!peerPub) throw new Error("no key");
  const key = await sharedKey(me, myV, peer, peerV, peerPub);
  const plain = await subtle().decrypt(
    {
      name: "AES-GCM",
      iv: fromB64(m.iv) as BufferSource,
      additionalData: aad(m.from, m.fromV, m.to, m.toV) as BufferSource,
    },
    key,
    fromB64(m.ct) as BufferSource,
  );
  const v = JSON.parse(dec.decode(plain)) as { t?: unknown };
  return typeof v.t === "string" ? v.t : "";
}

/** 12-digit "safety number" from both public keys, to check in person that nobody swapped a key. */
export async function safetyNumber(a: { no: number; pub: string }, b: { no: number; pub: string }) {
  const [x, y] = a.no < b.no ? [a, b] : [b, a];
  const h = new Uint8Array(
    await subtle().digest("SHA-256", enc.encode(`${x.no}:${x.pub}|${y.no}:${y.pub}`)),
  );
  const digits = Array.from(h.slice(0, 12), (n) => String(n % 10)).join("");
  return digits.match(/.{4}/g)!.join(" ");
}
