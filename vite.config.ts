/// <reference types="vitest" />
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

import { parseChangelog } from "./src/lib/release";

const webDir = dirname(fileURLToPath(import.meta.url));
const localVersion =
  readFileSync(resolve(webDir, "VERSION"), "utf8").trim() || "dev";
const localChangelog = readFileSync(resolve(webDir, "CHANGELOG.md"), "utf8");

// 暴露 /plugins/index.json:列出 public/plugins 下的本地插件文件,
// 供前端自动发现并加入插件列表(默认关闭)。dev 下实时读目录,构建时产出静态清单。
function localPluginsManifest(): Plugin {
  const pluginsDir = resolve(webDir, "public/plugins");
  const listLocalPlugins = () => {
    try {
      return readdirSync(pluginsDir)
        .filter((file) => file.endsWith(".js"))
        .sort()
        .map((file) => `/plugins/${file}`);
    } catch {
      return [];
    }
  };
  return {
    name: "local-plugins-manifest",
    configureServer(server) {
      server.middlewares.use("/plugins/index.json", (_req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(listLocalPlugins()));
      });
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "plugins/index.json",
        source: JSON.stringify(listLocalPlugins()),
      });
    },
  };
}

export default defineConfig({
  base: process.env.VITE_BASE || "/",
  plugins: [react(), localPluginsManifest()],
  resolve: {
    alias: {
      "@": resolve(webDir, "src"),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(localVersion),
    __APP_RELEASES__: JSON.stringify(parseChangelog(localChangelog)),
  },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
      // 本地开发时把 /gateway 代理到内网 new-api（线上由 nginx 完成），否则登录/注册不可用
      "/gateway": {
        target: "http://127.0.0.1:32124",
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/gateway/, ""),
      },
    },
  },
  // @ts-ignore vitest test config augments Vite UserConfig
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}", "server/**/*.{test,spec}.{mjs,js,ts}"],
    css: true,
    testTimeout: 90000,
    hookTimeout: 90000,
  },
} as any);
