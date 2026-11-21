// Photo uploads from /me: resize in the browser, optional square crop for the profile picture,
// then POST /api/me/upload (server/roster.ts). The server keeps a full image + a 240px face crop.
import { ApiError } from "./api.ts";
import { applyRoster, type Roster } from "../data.ts";
import { icon } from "./icons.ts";

export type UploadBody = { data: string; face: string; w: number; h: number };
const FACE = 240;

/** Where an upload is at: "uploading" has a 0–100 `pct`; "processing" = bytes sent, server is saving. */
export type UploadProgress = {
  phase: "uploading" | "processing";
  pct: number;
  sent: number;
  total: number;
};

/** POST JSON with upload progress (fetch can't report it, XHR can). */
function sendWithProgress<T>(
  url: string,
  body: unknown,
  onProgress: (p: UploadProgress) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const payload = JSON.stringify(body);
    xhr.open("POST", url);
    xhr.withCredentials = true;
    xhr.setRequestHeader("content-type", "application/json");
    xhr.timeout = 120_000;
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const pct = Math.min(100, Math.round((e.loaded / e.total) * 100));
      onProgress({ phase: "uploading", pct, sent: e.loaded, total: e.total });
    };
    xhr.upload.onload = () =>
      onProgress({ phase: "processing", pct: 100, sent: payload.length, total: payload.length });
    xhr.onerror = () => reject(new ApiError(0, "อินเทอร์เน็ตมีปัญหา อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง"));
    xhr.ontimeout = () => reject(new ApiError(0, "อัปโหลดนานเกินไป ลองใหม่อีกครั้ง"));
    xhr.onabort = () => reject(new ApiError(0, "ยกเลิกการอัปโหลด"));
    xhr.onload = () => {
      let out: { error?: string } = {};
      try {
        out = JSON.parse(xhr.responseText || "{}");
      } catch {
        /* non-JSON error page */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(out as T);
      else reject(new ApiError(xhr.status, out.error ?? "อัปโหลดไม่สำเร็จ"));
    };
    xhr.send(payload);
  });
}

const sizeText = (n: number) =>
  n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`;

/** A progress bar inside `host` that follows UploadProgress. */
export function progressBar(host: HTMLElement) {
  host.innerHTML = `<span class="up-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i></i></span><span class="up-text"></span>`;
  host.classList.add("has-progress");
  const bar = host.querySelector<HTMLElement>(".up-bar")!;
  const fill = bar.querySelector<HTMLElement>("i")!;
  const text = host.querySelector<HTMLElement>(".up-text")!;
  const set = (pct: number, msg: string, cls = "") => {
    bar.setAttribute("aria-valuenow", String(Math.round(pct)));
    fill.style.width = `${pct}%`;
    host.classList.remove("is-processing", "is-done", "is-fail");
    if (cls) host.classList.add(cls);
    text.textContent = msg;
  };
  set(2, "กำลังเตรียมรูป…");
  return {
    prepare: (msg: string) => set(2, msg),
    update(p: UploadProgress) {
      if (p.phase === "uploading")
        set(
          Math.max(4, p.pct * 0.92),
          `กำลังอัปโหลด ${p.pct}% · ${sizeText(p.sent)} / ${sizeText(p.total)}`,
        );
      else set(96, "กำลังบันทึกรูปบนเซิร์ฟเวอร์…", "is-processing");
    },
    done: (msg: string) => set(100, msg, "is-done"),
    fail: (msg: string) => set(100, msg, "is-fail"),
  };
}

async function send<T>(method: string, url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const out = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new ApiError(r.status, out.error ?? "อัปโหลดไม่สำเร็จ");
  return out;
}

/** Decode + shrink to max 1600px. */
export async function loadImage(file: File) {
  // some phone galleries hand over files without a type; trust the extension then
  const looksImage =
    file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|heic|heif|avif|bmp)$/i.test(file.name);
  if (!looksImage) throw new Error("เลือกไฟล์รูปภาพนะ");
  if (file.size > 25_000_000) throw new Error("ไฟล์ใหญ่เกิน 25MB");
  const src = await decode(file);
  const scale = Math.min(1, 1600 / Math.max(src.width, src.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(src.width * scale));
  canvas.height = Math.max(1, Math.round(src.height * scale));
  canvas.getContext("2d")!.drawImage(src.image, 0, 0, canvas.width, canvas.height);
  src.done();
  return canvas;
}

/**
 * Decode a photo with its camera rotation applied. createImageBitmap(file, options) is missing or
 * throws on older iPhone Safari, so fall back to an <img> (browsers rotate those by EXIF already).
 */
async function decode(
  file: File,
): Promise<{ image: CanvasImageSource; width: number; height: number; done: () => void }> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { image: bmp, width: bmp.width, height: bmp.height, done: () => bmp.close() };
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode();
      return {
        image: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        done: () => URL.revokeObjectURL(url),
      };
    } catch {
      URL.revokeObjectURL(url);
      throw new Error("เปิดรูปนี้ไม่ได้ ลองเลือกรูปแบบ JPG หรือ PNG ดูนะ");
    }
  }
}

/** Square crop → 240px JPEG. Without a box, guess where a face usually is (upper middle). */
function faceCrop(full: HTMLCanvasElement, box?: { x: number; y: number; side: number }) {
  const { width: w, height: h } = full;
  let b = box;
  if (!b) {
    const side = Math.min(w, h) * (h > w ? 0.8 : 0.62);
    const cy = h > w ? h * 0.32 : h * 0.4;
    b = {
      side,
      x: Math.max(0, Math.min(w - side, w / 2 - side / 2)),
      y: Math.max(0, Math.min(h - side, cy - side / 2)),
    };
  }
  const c = document.createElement("canvas");
  c.width = c.height = FACE;
  c.getContext("2d")!.drawImage(full, b.x, b.y, b.side, b.side, 0, 0, FACE, FACE);
  return c.toDataURL("image/jpeg", 0.88);
}

export const toBody = (full: HTMLCanvasElement, box?: { x: number; y: number; side: number }) => ({
  data: full.toDataURL("image/jpeg", 0.86),
  face: faceCrop(full, box),
  w: full.width,
  h: full.height,
});

/** Upload one of my photos; refreshes the photo roster so it shows up as mine right away. */
export async function uploadMine(
  body: UploadBody,
  onProgress?: (p: UploadProgress) => void,
): Promise<string> {
  const r = onProgress
    ? await sendWithProgress<Roster & { uploaded: string }>("/api/me/upload", body, onProgress)
    : await send<Roster & { uploaded: string }>("POST", "/api/me/upload", body);
  applyRoster(r);
  return r.uploaded;
}

export async function deleteMine(id: string) {
  applyRoster(await send<Roster>("DELETE", `/api/me/upload/${encodeURIComponent(id)}`));
}

/**
 * Drag + zoom square cropper in a modal. Resolves with the crop box (in canvas pixels),
 * or null when cancelled.
 */
export function cropSquare(
  full: HTMLCanvasElement,
): Promise<{ x: number; y: number; side: number } | null> {
  return new Promise((resolve) => {
    const F = Math.min(300, window.innerWidth - 72); // frame size on screen
    const min = F / Math.min(full.width, full.height);
    let scale = min;
    let x = (F - full.width * scale) / 2;
    let y = (F - full.height * scale) / 2;
    const wrap = document.createElement("div");
    wrap.className = "up-modal";
    wrap.innerHTML = `
      <div class="up-backdrop" data-up-cancel></div>
      <div class="up-card" role="dialog" aria-modal="true" aria-label="ครอปรูปโปรไฟล์">
        <h2>จัดรูปโปรไฟล์</h2>
        <p>ลากเพื่อเลื่อน · เลื่อนแถบเพื่อซูม</p>
        <div class="up-frame" style="width:${F}px;height:${F}px"><img alt="" draggable="false"></div>
        <label class="up-zoom">${icon("search", 16)}<input type="range" min="1" max="4" step="0.01" value="1" aria-label="ซูม"></label>
        <div class="up-actions">
          <button type="button" class="btn-outline" data-up-cancel>ยกเลิก</button>
          <button type="button" class="me-btn" data-up-ok>${icon("check", 16)} ใช้รูปนี้</button>
        </div>
      </div>`;
    const img = wrap.querySelector("img")!;
    img.src = full.toDataURL("image/jpeg", 0.9);
    const frame = wrap.querySelector<HTMLElement>(".up-frame")!;
    const zoom = wrap.querySelector<HTMLInputElement>('input[type="range"]')!;
    const clamp = () => {
      x = Math.min(0, Math.max(F - full.width * scale, x));
      y = Math.min(0, Math.max(F - full.height * scale, y));
    };
    const draw = () => {
      clamp();
      img.style.width = `${full.width * scale}px`;
      img.style.transform = `translate(${x}px, ${y}px)`;
    };
    draw();
    let drag: { px: number; py: number; x: number; y: number } | null = null;
    frame.addEventListener("pointerdown", (e) => {
      drag = { px: e.clientX, py: e.clientY, x, y };
      frame.setPointerCapture(e.pointerId);
    });
    frame.addEventListener("pointermove", (e) => {
      if (!drag) return;
      x = drag.x + e.clientX - drag.px;
      y = drag.y + e.clientY - drag.py;
      draw();
    });
    frame.addEventListener("pointerup", () => (drag = null));
    zoom.addEventListener("input", () => {
      const next = min * Number(zoom.value);
      // zoom around the middle of the frame
      x = F / 2 - ((F / 2 - x) * next) / scale;
      y = F / 2 - ((F / 2 - y) * next) / scale;
      scale = next;
      draw();
    });
    const close = (out: { x: number; y: number; side: number } | null) => {
      wrap.remove();
      document.removeEventListener("keydown", onKey);
      resolve(out);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(null);
    document.addEventListener("keydown", onKey);
    wrap.addEventListener("click", (e) => {
      const t = e.target as Element;
      if (t.closest("[data-up-cancel]")) close(null);
      else if (t.closest("[data-up-ok]")) close({ x: -x / scale, y: -y / scale, side: F / scale });
    });
    document.body.appendChild(wrap);
    wrap.querySelector<HTMLElement>("[data-up-ok]")!.focus();
  });
}
