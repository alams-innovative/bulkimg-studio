import { createHash, createPrivateKey, sign } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { APP_VERSION } from "../src/shared/build-info";

const channel = Bun.argv[2] ?? "stable";
const tag = Bun.argv[3];
if (channel !== "stable" && channel !== "beta") throw new Error("Channel must be stable or beta.");
if (!tag?.match(/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/)) throw new Error("Pass a semantic release tag such as v1.0.7.");

const signingKey = Bun.env["BULKIMG_UPDATE_SIGNING_PRIVATE_KEY"];
if (!signingKey) throw new Error("BULKIMG_UPDATE_SIGNING_PRIVATE_KEY is required to sign a release manifest.");
const root = resolve(import.meta.dir, "..");
const version = tag.slice(1);
if (version !== APP_VERSION) throw new Error(`Release tag ${tag} does not match ${APP_VERSION}.`);
const artifacts = join(root, "artifacts");
const sourceZip = join(artifacts, `${channel}-win-x64-BulkImgStudio-Setup.zip`);
if (!existsSync(sourceZip)) throw new Error(`Missing ${sourceZip}. Build the ${channel} package first.`);
const releaseDirectory = join(artifacts, "release");
const assetName = "BulkImgStudio-Setup.zip";
const zipPath = join(releaseDirectory, assetName);
mkdirSync(releaseDirectory, { recursive: true });
copyFileSync(sourceZip, zipPath);
const zip = readFileSync(zipPath);
const manifest = {
  version,
  tag,
  channel,
  publishedAt: new Date().toISOString(),
  releaseNotesUrl: `https://github.com/alams-innovative/bulkimg-studio/releases/tag/${tag}`,
  zipUrl: `https://github.com/alams-innovative/bulkimg-studio/releases/download/${tag}/${assetName}`,
  zipSha256: createHash("sha256").update(zip).digest("hex"),
  zipBytes: zip.byteLength,
  minimumSupportedVersion: "1.0.0",
  architectures: ["x64"],
  schemaVersion: 7,
};
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
const privateKey = createPrivateKey(signingKey.includes("BEGIN") ? signingKey : Buffer.from(signingKey, "base64").toString("utf8"));
const signature = sign(null, Buffer.from(manifestText), privateKey).toString("base64");
writeFileSync(join(releaseDirectory, "bulkimg-update.json"), manifestText);
writeFileSync(join(releaseDirectory, "bulkimg-update.json.sig"), `${signature}\n`);
console.log(`Signed update manifest for ${tag}: ${basename(zipPath)}`);
