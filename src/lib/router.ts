export type Cleanup = () => void;
type Handler = () => void;

let onChange: Handler = () => {};

export function setRouteHandler(fn: Handler) {
  onChange = fn;
}

export function navigate(url: string) {
  if (url === location.pathname + location.search + location.hash) return;
  history.pushState({}, "", url);
  onChange();
}

/** Intercept clicks on <a data-link> so they route client-side. */
export function bindLinks() {
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
      return;
    const a = (e.target as Element | null)?.closest<HTMLAnchorElement>("a[data-link]");
    if (!a || a.target === "_blank") return;
    const url = new URL(a.href);
    if (url.origin !== location.origin) return;
    e.preventDefault();
    navigate(url.pathname + url.search + url.hash);
  });
  window.addEventListener("popstate", () => onChange());
}

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
export const prefersReducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
export const fmtBaht = (n: number) => "฿" + n.toLocaleString("en-US");
