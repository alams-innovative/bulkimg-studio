import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "bulkimg-studio",
    identifier: "com.bulkimg.studio",
    version: "2.0.0",
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
      "assets": "assets",
    },
    win: {
      bundleCEF: false,
    },
  },
} satisfies ElectrobunConfig;
