import { defineConfig, type Plugin } from "vite-plus";
import { createApi } from "./server/api.ts";
import { createExtrasApi } from "./server/extras.ts";

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

export default defineConfig({
  plugins: [classApi()],
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
