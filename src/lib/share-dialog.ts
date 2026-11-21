// Popup to pick a card layout + theme and preview it, then share it (native share sheet, e.g. IG / LINE)
// or save it as an image. The last choice is remembered on this device.
import {
  LAYOUTS,
  THEMES,
  drawShareCard,
  type ShareCardData,
  type ShareLayout,
  type ShareTheme,
} from "./share-card.ts";

const KEY = "share-card-style";

const toBlob = (c: HTMLCanvasElement) =>
  new Promise<Blob | null>((res) => c.toBlob((b) => res(b), "image/png"));

const fileName = (d: ShareCardData) =>
  `${d.brand.replace(/\s+/g, "-")}-${d.handle.replace(/\W+/g, "")}.png`;

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function saved(): { layout: ShareLayout; theme: ShareTheme } {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "{}");
    return {
      layout: LAYOUTS.some((l) => l.key === v.layout) ? v.layout : "pass",
      theme: v.theme in THEMES ? v.theme : "clean",
    };
  } catch {
    return { layout: "pass", theme: "clean" };
  }
}

/** Opens the popup. Returns a function that closes it. */
export function openShareDialog(d: ShareCardData, toast: (msg: string) => void): () => void {
  let { layout, theme } = saved();
  let current: HTMLCanvasElement | null = null;
  let seq = 0;
  const el = document.createElement("div");
  el.className = "sc-modal";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-label", "แชร์การ์ดโปรไฟล์");
  el.innerHTML = `
    <div class="sc-backdrop" data-sc-close></div>
    <div class="sc-card">
      <header><h2>แชร์การ์ดโปรไฟล์</h2><button type="button" class="sc-x" data-sc-close aria-label="ปิด">&times;</button></header>
      <div class="sc-preview" data-sc-preview><span class="sc-loading">กำลังสร้างการ์ด…</span></div>
      <div class="sc-side">
        <div class="sc-group">
          <h3>เลย์เอาต์</h3>
          <div class="sc-opts" role="radiogroup" aria-label="เลย์เอาต์">${LAYOUTS.map(
            (x) =>
              `<button type="button" role="radio" class="sc-opt" data-layout="${x.key}" aria-checked="${x.key === layout}">${x.name}</button>`,
          ).join("")}</div>
        </div>
        <div class="sc-group">
          <h3>ธีม</h3>
          <div class="sc-opts sc-themes" role="radiogroup" aria-label="ธีม">${(
            Object.keys(THEMES) as ShareTheme[]
          )
            .map(
              (k) =>
                `<button type="button" role="radio" class="sc-theme" data-theme="${k}" aria-checked="${k === theme}" aria-label="${THEMES[k].name}" title="${THEMES[k].name}"><i style="background:${THEMES[k].swatch}"></i><span>${THEMES[k].name}</span></button>`,
            )
            .join("")}</div>
        </div>
        <div class="sc-actions">
          <button type="button" class="sc-btn" data-sc-save>บันทึกรูป</button>
          <button type="button" class="sc-btn is-primary" data-sc-share>แชร์</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("is-open"));
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";

  const preview = el.querySelector<HTMLElement>("[data-sc-preview]")!;
  const actions = [...el.querySelectorAll<HTMLButtonElement>(".sc-actions button")];
  const render = async () => {
    const mine = ++seq;
    actions.forEach((b) => (b.disabled = true));
    try {
      const c = await drawShareCard(d, layout, theme);
      if (mine !== seq) return;
      current = c;
      c.className = "sc-canvas";
      c.setAttribute("aria-label", "ตัวอย่างการ์ด");
      preview.replaceChildren(c);
      actions.forEach((b) => (b.disabled = false));
    } catch {
      if (mine === seq) preview.innerHTML = `<span class="sc-loading">สร้างการ์ดไม่สำเร็จ</span>`;
    }
  };
  void render();

  let closed = false;
  const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKey);
    document.body.style.overflow = prevOverflow;
    el.classList.remove("is-open");
    setTimeout(() => el.remove(), 200);
  }
  document.addEventListener("keydown", onKey);

  const pick = (attr: "layout" | "theme", value: string, btn: HTMLElement) => {
    if (attr === "layout") layout = value as ShareLayout;
    else theme = value as ShareTheme;
    btn
      .parentElement!.querySelectorAll<HTMLElement>("[role=radio]")
      .forEach((b) => b.setAttribute("aria-checked", String(b === btn)));
    try {
      localStorage.setItem(KEY, JSON.stringify({ layout, theme }));
    } catch {
      /* private mode */
    }
    void render();
  };

  el.addEventListener("click", async (e) => {
    const t = e.target as Element;
    if (t.closest("[data-sc-close]")) return close();
    const l = t.closest<HTMLElement>("[data-layout]");
    if (l) return pick("layout", l.dataset.layout!, l);
    const th = t.closest<HTMLElement>("[data-theme]");
    if (th) return pick("theme", th.dataset.theme!, th);
    const share = !!t.closest("[data-sc-share]");
    if (!share && !t.closest("[data-sc-save]")) return;
    if (!current) return;
    const blob = await toBlob(current);
    if (!blob) return toast("สร้างการ์ดไม่สำเร็จ");
    const file = new File([blob], fileName(d), { type: "image/png" });
    if (share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: d.name,
          text: `${d.name} · ${d.brand}`,
          url: d.url,
        });
        return close();
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
      }
    }
    download(blob, file.name);
    toast(share ? "เครื่องนี้แชร์รูปตรง ๆ ไม่ได้ บันทึกรูปให้แล้ว" : "บันทึกรูปการ์ดแล้ว");
  });
  return close;
}
