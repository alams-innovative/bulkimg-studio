import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "BulkImg Studio",
    identifier: "com.bulkimg.studio",
    version: "1.0.0-beta",
    description: "A local-first workspace for high-volume AI image generation.",
  },
  runtime: {
    exitOnLastWindowClosed: true,
  },
  build: {
    bun: {
      entrypoint: "src/bun/index.ts",
    },
    views: {
      mainview: {
        entrypoint: "src/mainview/index.ts",
      },
    },
    copy: {
      "src/mainview/index.html": "views/mainview/index.html",
      "src/mainview/index.css": "views/mainview/index.css",
      "assets": "views/assets",
    },
    win: {
      bundleCEF: false,
      icon: "assets/brand/app_icon.ico",
    },
  },
} satisfies ElectrobunConfig;
