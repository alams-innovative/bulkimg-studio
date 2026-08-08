import { expect, test } from "bun:test";
import { generateKeyPairSync, sign } from "node:crypto";
import { verifySignedUpdateManifest } from "./update-service";

test("accepts only a signed GitHub update manifest", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const manifestText = `${JSON.stringify({
    version: "1.0.7", tag: "v1.0.7", channel: "stable", publishedAt: "2026-08-08T00:00:00.000Z",
    releaseNotesUrl: "https://github.com/alams-innovative/bulkimg-studio/releases/tag/v1.0.7",
    zipUrl: "https://github.com/alams-innovative/bulkimg-studio/releases/download/v1.0.7/BulkImgStudio-Setup.zip",
    zipSha256: "a".repeat(64), zipBytes: 100, minimumSupportedVersion: "1.0.0", architectures: ["x64"], schemaVersion: 7,
  })}\n`;
  const signature = sign(null, Buffer.from(manifestText), privateKey).toString("base64");
  const config = { repository: "alams-innovative/bulkimg-studio" as const, publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString() };
  expect(verifySignedUpdateManifest(manifestText, signature, config).version).toBe("1.0.7");
  expect(() => verifySignedUpdateManifest(manifestText, "invalid", config)).toThrow("signature");
});
