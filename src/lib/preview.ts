// The picture area of an album / event card (a plain cover image).
import { esc } from "./router.ts";

export function previewHtml(srcs: string[], _opts: { videoFrom?: number } = {}) {
  return `<span class="pv"><img src="${esc(srcs[0] ?? "/favicon.svg")}" alt="" loading="lazy" decoding="async"></span>`;
}
