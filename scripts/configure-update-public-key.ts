import { createPrivateKey, createPublicKey } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const signingKey = Bun.env["BULKIMG_UPDATE_SIGNING_PRIVATE_KEY"];
if (!signingKey) throw new Error("BULKIMG_UPDATE_SIGNING_PRIVATE_KEY is required to configure the packaged public key.");
const privateKey = createPrivateKey(signingKey.includes("BEGIN") ? signingKey : Buffer.from(signingKey, "base64").toString("utf8"));
const publicKeyPem = createPublicKey(privateKey).export({ type: "spki", format: "pem" }).toString();
const root = resolve(import.meta.dir, "..");
writeFileSync(join(root, "assets", "config", "update.json"), `${JSON.stringify({ repository: "alams-innovative/bulkimg-studio", publicKeyPem }, null, 2)}\n`);
console.log("Configured the packaged update verification key.");
