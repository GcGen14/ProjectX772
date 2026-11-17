// Photo uploads from /me: resize in the browser, optional square crop for the profile picture,
// then POST /api/me/upload (server/roster.ts). The server keeps a full image + a 240px face crop.
import { ApiError } from "./api.ts";
import { applyRoster, type Roster } from "../data.ts";
import { icon } from "./icons.ts";

export type UploadBody = { data: string; face: string; w: number; h: number };
const FACE = 240;

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
  if (!file.type.startsWith("image/")) throw new Error("เลือกไฟล์รูปภาพนะ");
  if (file.size > 25_000_000) throw new Error("ไฟล์ใหญ่เกิน 25MB");
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return canvas;
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
export async function uploadMine(body: UploadBody): Promise<string> {
  const r = await send<Roster & { uploaded: string }>("POST", "/api/me/upload", body);
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
