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
  private deviceKeyPromise: Promise<CryptoKey> | null = null;
  private readonly decryptedKeyCache = new Map<string, string>();

  constructor(private readonly database: AppDatabase, dataDirectory: string) {
    this.legacyKeyPath = join(dataDirectory, ".key-vault.bin");
    this.dpapiKeyPath = join(dataDirectory, ".key-vault.dpapi");
  }

  private async loadDeviceKey(): Promise<CryptoKey> {
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

  private async getDeviceKey(): Promise<CryptoKey> {
    if (!this.deviceKeyPromise) {
      this.deviceKeyPromise = this.loadDeviceKey().catch((error) => {
        this.deviceKeyPromise = null;
        throw error;
      });
    }
    return this.deviceKeyPromise;
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

  invalidateKey(id: string): void {
    this.decryptedKeyCache.delete(id);
  }

  clearDecryptedKeys(): void {
    this.decryptedKeyCache.clear();
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
    this.decryptedKeyCache.set(id, key);
    return { id, label: label.trim() || "OpenAI key", isActive: true };
  }

  async setAdminKey(key: string, projectId?: string): Promise<void> {
    const trimmed = key.trim();
    const existing = await this.getAdminKey();

    // Project-only update when a key is already saved and the form key field is blank.
    if (!trimmed) {
      if (!existing) throw new Error("Enter a valid OpenAI Admin API key.");
      if (projectId !== undefined) {
        this.database.setAdminProjectId(projectId.trim() || null);
      }
      return;
    }

    if (trimmed.length < 20) throw new Error("Enter a valid OpenAI Admin API key.");
    const client = new OpenAIClient(trimmed);
    try {
      await client.validateAdminKey();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "OpenAI rejected this key.";
      throw new Error(
        `That Admin API key could not access organization projects (${detail}). Use an Admin key from OpenAI → Organization → Admin keys.`,
      );
    }
    this.database.setAdminEncryptedKey(await this.encrypt(trimmed), `••••${trimmed.slice(-4)}`);
    if (projectId !== undefined) this.database.setAdminProjectId(projectId.trim() || null);
    this.decryptedKeyCache.set("admin", trimmed);
  }

  clearAdminKey(): void {
    this.database.setAdminEncryptedKey(null, null);
    this.database.setAdminProjectId(null);
    this.database.setAdminRateLimits(null, null);
    this.decryptedKeyCache.delete("admin");
  }

  async getAdminKey(): Promise<string | null> {
    const cached = this.decryptedKeyCache.get("admin");
    if (cached) return cached;
    const row = this.database.getAdminConfigRow();
    if (!row.encrypted_key) return null;
    const key = await this.decrypt(row.encrypted_key);
    this.decryptedKeyCache.set("admin", key);
    return key;
  }

  async refreshAdminRateLimits(): Promise<void> {
    const key = await this.getAdminKey();
    if (!key) {
      this.database.setAdminRateLimits(null, "No Admin API key — org rate limits (images/min, TPM) won’t show. Generation still works.");
      return;
    }
    const projectId = this.database.getAdminConfigRow().project_id;
    if (!projectId) {
      this.database.setAdminRateLimits(null, "Add a Project ID so rate limits can be loaded.");
      return;
    }
    try {
      const snapshot = await new OpenAIClient(key).listProjectRateLimits(projectId);
      if (!snapshot) {
        this.database.setAdminRateLimits(null, "No gpt-image rate limits found for this project.");
        return;
      }
      this.database.setAdminRateLimits(snapshot, null);
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 200) : "Could not load rate limits.";
      this.database.setAdminRateLimits(null, message);
    }
  }

  async listAdminProjects(): Promise<Array<{ id: string; name: string }>> {
    const key = await this.getAdminKey();
    if (!key) throw new Error("Add an Admin API key first.");
    return new OpenAIClient(key).listProjects();
  }

  listSafe() {
    return this.database.listKeyStats();
  }

  async activeKeys(): Promise<Array<{ id: string; key: string }>> {
    const now = Date.now();
    const active = this.database.listKeys().filter((record: ApiKeyRecord) => {
      return record.is_active === 1 && (!record.rate_limited_until || Date.parse(record.rate_limited_until) <= now);
    });
    return Promise.all(active.map(async (record) => {
      let key = this.decryptedKeyCache.get(record.id);
      if (!key) {
        key = await this.decrypt(record.key_value);
        this.decryptedKeyCache.set(record.id, key);
      }
      return { id: record.id, key };
    }));
  }

  async keyById(id: string): Promise<string | null> {
    const cached = this.decryptedKeyCache.get(id);
    if (cached) return cached;
    const record = this.database.listKeys().find((item) => item.id === id);
    if (!record) return null;
    const key = await this.decrypt(record.key_value);
    this.decryptedKeyCache.set(id, key);
    return key;
  }
}
