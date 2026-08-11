import type { ElectrobunConfig } from "electrobun";
import { APP_VERSION } from "./src/shared/build-info";

export default {
  app: {
    name: "BulkImg Studio",
    identifier: "com.bulkimg.studio",
    version: APP_VERSION,
    description: "A local-first workspace for high-volume AI image generation.",
  },
  runtime: {
    // Closing the window keeps the local scheduler and tray controls available.
    exitOnLastWindowClosed: false,
  },
  build: {
    bun: {
      entrypoint: "src/bun/index.ts",
      // Sharp loads its Windows binary at runtime, so it must remain external
      // and travel with its native package instead of being folded into index.js.
      external: ["sharp"],
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
      "node_modules/sharp": "bun/node_modules/sharp",
      "node_modules/@img": "bun/node_modules/@img",
      "node_modules/detect-libc": "bun/node_modules/detect-libc",
      "node_modules/semver": "bun/node_modules/semver",
    },
    win: {
      bundleCEF: false,
      // The release finalizer embeds this icon into every Windows executable
      // after Electrobun assembles the installer. Keeping it there avoids the
      // bundled CLI's broken rcedit lookup during packaging.
    },
  },
} satisfies ElectrobunConfig;
