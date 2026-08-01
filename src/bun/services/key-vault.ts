import { join } from "node:path";
import type { AppDatabase, ApiKeyRecord } from "../database";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export class KeyVault {
  private readonly keyPath: string;

  constructor(private readonly database: AppDatabase, dataDirectory: string) {
    this.keyPath = join(dataDirectory, ".key-vault.bin");
  }

  private async getDeviceKey(): Promise<CryptoKey> {
    const file = Bun.file(this.keyPath);
    let material: Uint8Array;
    if (await file.exists()) {
      material = new Uint8Array(await file.arrayBuffer());
    } else {
      material = crypto.getRandomValues(new Uint8Array(32));
      await Bun.write(this.keyPath, material);
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
}
