import path from "node:path";
import { defineConfig, type Plugin } from "vite-plus";
import { createApi } from "./server/api.ts";
import { createExtrasApi } from "./server/extras.ts";
import { ThemeError, scopeCss } from "./scripts/theme-css.ts";

/**
 * Mounts the class database API (/api/*, SQLite in data/602.sqlite) on both
 * `npm run dev` and `npm run preview`. Production: `npm start` (server/index.ts).
 */
function classApi(): Plugin {
  return {
    name: "class-api",
    configureServer(server) {
      server.middlewares.use(createExtrasApi()); // socials, privacy, characters
      server.middlewares.use(createApi());
    },
    configurePreviewServer(server) {
      server.middlewares.use(createExtrasApi());
      server.middlewares.use(createApi());
    },
  };
}

/**
 * Student CSS themes (themes/<no>/theme.css): validated and scoped to `.th-custom-<no>` before Vite sees them,
 * so a theme can only style its owner's own profile. A bad theme fails the build with a readable message.
 */
function studentThemes(): Plugin {
  return {
    name: "student-themes",
    enforce: "pre",
    transform(code, id) {
      const m = id
        .split("?")[0]
        .replaceAll("\\", "/")
        .match(/\/themes\/(\d{1,2})\/theme\.css$/);
      if (!m) return null;
      try {
        return { code: scopeCss(code, Number(m[1]), path.dirname(id.split("?")[0])), map: null };
      } catch (e) {
        if (e instanceof ThemeError) this.error(`themes/${m[1]}/theme.css: ${e.message}`);
        throw e;
      }
    },
  };
}

export default defineConfig({
  plugins: [studentThemes(), classApi()],
  server: {
    // the SQLite files change on every save; don't trigger page reloads for them
    watch: { ignored: ["**/data/**"] },
  },
  staged: {
    "*": "vp check --fix",
  },
  fmt: {},
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
});
