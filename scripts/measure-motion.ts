import { gzipSync } from "node:zlib";

const virtualEntry = {
  name: "motion-size-entry",
  setup(builder: Bun.PluginBuilder) {
    builder.onResolve({ filter: /^virtual:motion$/ }, () => ({ path: "motion-entry", namespace: "motion-size" }));
    builder.onLoad({ filter: /.*/, namespace: "motion-size" }, () => ({
      loader: "js",
      contents: `import { animate } from "motion/mini";
        export const run = (element) => animate(element, {
          opacity: [0, 1], transform: ["translateY(6px)", "translateY(0px)"]
        }, { duration: 0.18 });`,
    }));
  },
};

const result = await Bun.build({ entrypoints: ["virtual:motion"], target: "browser", write: false, minify: true, plugins: [virtualEntry] });
if (!result.success || !result.outputs[0]) throw new Error("Motion Mini size build failed.");
const bytes = Buffer.from(await result.outputs[0].arrayBuffer());
const gzipBytes = gzipSync(bytes).byteLength;
console.log(JSON.stringify({ bytes: bytes.byteLength, gzipBytes }));
if (gzipBytes >= 5 * 1024) process.exitCode = 1;
