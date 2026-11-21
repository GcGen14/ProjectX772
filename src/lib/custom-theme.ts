// Student-written CSS themes (themes/<no>/theme.css, added through GitHub pull requests).
// The build validates each file and scopes it to `.th-custom-<no>` (scripts/theme-css.ts, vite.config.ts),
// so a theme can only ever style its owner's own profile. A theme's CSS is fetched lazily, only when
// that profile is shown.
import templateCss from "../../themes/_template/theme.css?raw";

export const REPO = "https://github.com/GcGen14/ProjectX772";

export type CustomThemeMeta = { name?: string; tagline?: string; author?: string };

const noOf = (path: string) => Number(path.match(/\/themes\/(\d+)\//)?.[1]);

const loaders = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>("../../themes/[0-9]*/theme.css", {
      query: "?inline",
      import: "default",
    }),
  ).map(([path, load]) => [noOf(path), load]),
) as Record<number, () => Promise<string>>;
const metas = Object.fromEntries(
  Object.entries(
    import.meta.glob<CustomThemeMeta>("../../themes/[0-9]*/theme.json", {
      eager: true,
      import: "default",
    }),
  ).map(([path, meta]) => [noOf(path), meta]),
) as Record<number, CustomThemeMeta>;

/** Does this student have a merged custom theme? */
export const hasCustomTheme = (no: number) => no in loaders;
export const customThemeMeta = (no: number): CustomThemeMeta => metas[no] ?? {};

const requested = new Set<number>();
/** Add the theme's stylesheet to the page (once). Safe to call on every render. */
export function loadCustomTheme(no: number) {
  if (requested.has(no) || !loaders[no]) return;
  requested.add(no);
  loaders[no]()
    .then((css) => {
      const el = document.createElement("style");
      el.dataset.customTheme = String(no);
      el.textContent = css;
      document.head.append(el);
    })
    .catch(() => requested.delete(no));
}

/** Where a student starts a theme: GitHub's "new file" editor pre-filled with the template (it forks + opens a PR). */
export const newThemeUrl = (no: number) =>
  `${REPO}/new/main?filename=${encodeURIComponent(`themes/${no}/theme.css`)}&value=${encodeURIComponent(
    templateCss.replaceAll("t<เลขที่>", `t${no}`),
  )}`;
export const editThemeUrl = (no: number) => `${REPO}/edit/main/themes/${no}/theme.css`;
export const themesGuideUrl = `${REPO}/blob/main/themes/README.md`;
