import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { AppDatabase, ApiKeyRecord } from "../database";
import { protectWithDpapi, unprotectWithDpapi } from "./windows-native";
import { OpenAIClient } from "./openai-client";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export class KeyVault {
  private readonly legacyKeyPath: string;
  private readonly dpapiKeyPath: string;

  constructor(private readonly database: AppDatabase, dataDirectory: string) {
    this.legacyKeyPath = join(dataDirectory, ".key-vault.bin");
    this.dpapiKeyPath = join(dataDirectory, ".key-vault.dpapi");
  }

  private async getDeviceKey(): Promise<CryptoKey> {
    let material: Uint8Array;
    if (existsSync(this.dpapiKeyPath)) {
      const protectedBytes = new Uint8Array(await Bun.file(this.dpapiKeyPath).arrayBuffer());
      material = await unprotectWithDpapi(protectedBytes);
    } else if (existsSync(this.legacyKeyPath)) {
      material = new Uint8Array(await Bun.file(this.legacyKeyPath).arrayBuffer());
      const protectedBytes = await protectWithDpapi(material);
      await Bun.write(this.dpapiKeyPath, protectedBytes);
      try { unlinkSync(this.legacyKeyPath); } catch { /* keep legacy if delete fails */ }
    } else {
      material = crypto.getRandomValues(new Uint8Array(32));
      const protectedBytes = await protectWithDpapi(material);
      await Bun.write(this.dpapiKeyPath, protectedBytes);
    }
    return crypto.subtle.importKey("raw", asArrayBuffer(material), "AES-GCM", false, ["encrypt", "decrypt"]);
  }

  private async encrypt(plainText: string): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: asArrayBuffer(iv) },
      await this.getDeviceKey(),
      asArrayBuffer(encoder.encode(plainText)),
    );
    return `${Buffer.from(iv).toString("base64")}.${Buffer.from(cipher).toString("base64")}`;
  }

  private async decrypt(payload: string): Promise<string> {
    const [ivPart, cipherPart] = payload.split(".");
    if (!ivPart || !cipherPart) throw new Error("Invalid encrypted key payload");
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: asArrayBuffer(Buffer.from(ivPart, "base64")) },
      await this.getDeviceKey(),
      asArrayBuffer(Buffer.from(cipherPart, "base64")),
    );
    return decoder.decode(plain);
  }

  async add(label: string, key: string): Promise<{ id: string; label: string; isActive: boolean }> {
    if (!key.startsWith("sk-") || key.length < 20) throw new Error("Enter a valid OpenAI API key");
    await new OpenAIClient(key).validateKey();
    const id = crypto.randomUUID();
    this.database.insertKey({
      id,
      encryptedKey: await this.encrypt(key),
      label: label.trim() || "OpenAI key",
      keyHint: `••••${key.slice(-4)}`,
    });
    return { id, label: label.trim() || "OpenAI key", isActive: true };
  }

  listSafe() {
    return this.database.listKeyStats();
  }

  async activeKeys(): Promise<Array<{ id: string; key: string }>> {
    const now = Date.now();
    const active = this.database.listKeys().filter((record: ApiKeyRecord) => {
      return record.is_active === 1 && (!record.rate_limited_until || Date.parse(record.rate_limited_until) <= now);
    });
    return Promise.all(active.map(async (record) => ({ id: record.id, key: await this.decrypt(record.key_value) })));
  }

  async keyById(id: string): Promise<string | null> {
    const record = this.database.listKeys().find((item) => item.id === id);
    return record ? this.decrypt(record.key_value) : null;
  }
}
