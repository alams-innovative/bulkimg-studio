import { expect, test } from "bun:test";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AppDatabase } from "../database";
import { UpdateService, verifySignedUpdateManifest } from "./update-service";

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

test("a newly installed beta selects the beta update channel once", () => {
  const settings = new Map<string, string>();
  const database = {
    getSetting: (key: string, fallback = "") => settings.get(key) ?? fallback,
    setSetting: (key: string, value: string) => settings.set(key, value),
    schemaVersion: () => 7,
  } as unknown as AppDatabase;
  const directory = mkdtempSync(join(tmpdir(), "bulkimg-update-channel-test-"));
  try {
    const service = new UpdateService(database, directory, "1.1.0-beta.7", {
      repository: "alams-innovative/bulkimg-studio",
      publicKeyPem: "",
    }, "x64");
    expect(service.state().channel).toBe("beta");
    service.setChannel("stable");
    new UpdateService(database, directory, "1.1.0-beta.7", {
      repository: "alams-innovative/bulkimg-studio",
      publicKeyPem: "",
    }, "x64");
    expect(settings.get("update_channel")).toBe("stable");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("uses GitHub's ETag to keep repeated update checks lightweight", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const manifest = {
    version: "1.0.8", tag: "v1.0.8", channel: "stable", publishedAt: "2026-08-08T00:00:00.000Z",
    releaseNotesUrl: "https://github.com/alams-innovative/bulkimg-studio/releases/tag/v1.0.8",
    zipUrl: "https://github.com/alams-innovative/bulkimg-studio/releases/download/v1.0.8/BulkImgStudio-Setup.zip",
    zipSha256: "a".repeat(64), zipBytes: 100, minimumSupportedVersion: "1.0.0", architectures: ["x64"], schemaVersion: 7,
  };
  const manifestText = `${JSON.stringify(manifest)}\n`;
  const signatureText = `${sign(null, Buffer.from(manifestText), privateKey).toString("base64")}\n`;
  const settings = new Map<string, string>();
  const database = {
    getSetting: (key: string, fallback = "") => settings.get(key) ?? fallback,
    setSetting: (key: string, value: string) => settings.set(key, value),
    schemaVersion: () => 7,
  } as unknown as AppDatabase;
  const directory = mkdtempSync(join(tmpdir(), "bulkimg-update-etag-test-"));
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; ifNoneMatch: string | null }> = [];
  const fetchMock = Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const ifNoneMatch = new Headers(init?.headers).get("if-none-match");
    calls.push({ url, ifNoneMatch });
    if (url.includes("/releases?per_page=40")) {
      if (ifNoneMatch) return new Response(null, { status: 304 });
      return new Response(JSON.stringify([{
        tag_name: manifest.tag, prerelease: false, draft: false, published_at: manifest.publishedAt, html_url: manifest.releaseNotesUrl,
        assets: [
          { name: "bulkimg-update.json", browser_download_url: "https://example.test/manifest", size: manifestText.length },
          { name: "bulkimg-update.json.sig", browser_download_url: "https://example.test/signature", size: signatureText.length },
          { name: "BulkImgStudio-Setup.zip", browser_download_url: manifest.zipUrl, size: manifest.zipBytes },
        ],
      }]), { status: 200, headers: { etag: '"release-list-v1"' } });
    }
    if (url.endsWith("/manifest")) return new Response(manifestText, { status: 200 });
    if (url.endsWith("/signature")) return new Response(signatureText, { status: 200 });
    throw new Error(`Unexpected URL ${url}`);
  }, { preconnect: originalFetch.preconnect }) as typeof fetch;
  globalThis.fetch = fetchMock;

  try {
    const service = new UpdateService(database, directory, "1.0.7", {
      repository: "alams-innovative/bulkimg-studio",
      publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    }, "x64");
    expect((await service.check()).available?.version).toBe("1.0.8");
    expect(calls).toHaveLength(3);

    await service.check();
    expect(calls).toHaveLength(4);
    expect(calls[3]?.ifNoneMatch).toBe('"release-list-v1"');
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(directory, { recursive: true, force: true });
  }
});
