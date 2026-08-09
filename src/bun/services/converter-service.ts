import bmp from "bmp-js";
import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { availableParallelism } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import sharp from "sharp";
import type {
  ConverterFormat, ConverterImageProperties, ConverterInput, ConverterJob, ConverterOptions, ConverterRule,
} from "../../shared/contracts";
import type { AppDatabase } from "../database";
import { copyFilesToClipboard, copyImageToClipboard, pickFolder } from "./windows-native";

const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
const MAX_CONVERTER_WORKERS = 4;

function safeName(value: string): string {
  const stem = basename(value, extname(value)).replace(/[<>:"/\\|?*\x00-\x1F]+/g, "-").trim();
  return stem.slice(0, 90) || "image";
}

function extension(format: ConverterFormat): string {
  return format === "jpg" ? "jpg" : format;
}

function mimeType(format: string): string {
  return ({ jpg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif", tiff: "image/tiff", bmp: "image/bmp" } as Record<string, string>)[format] ?? "application/octet-stream";
}

function qualityFor(options: ConverterOptions): number {
  return options.quality === "smallest" ? 55 : options.quality === "best" ? 92 : 80;
}

function formatFor(input: ConverterInput, ordinal: number, options: ConverterOptions): ConverterFormat {
  const manual = options.overrides[input.clientId];
  if (manual) return manual;
  let matched: ConverterFormat | null = null;
  for (const rule of options.rules) {
    if (ruleMatches(rule, ordinal)) matched = ruleFormat(rule, ordinal);
  }
  return matched ?? options.defaultFormat;
}

function ruleMatches(rule: ConverterRule, ordinal: number): boolean {
  if (rule.type === "nth") return ordinal % Math.max(1, rule.every) === 0;
  if (rule.type === "odd") return ordinal % 2 === 1;
  if (rule.type === "even") return ordinal % 2 === 0;
  if (rule.type === "range") return ordinal >= rule.start && ordinal <= rule.end;
  if (rule.type === "cycle") return rule.formats.length > 0;
  return false;
}

function ruleFormat(rule: ConverterRule, ordinal: number): ConverterFormat | null {
  if (rule.type === "cycle") return rule.formats[(ordinal - 1) % rule.formats.length] ?? null;
  return rule.format;
}

function uniqueDestination(directory: string, filename: string): string {
  const parsed = safeName(filename);
  const suffix = extname(filename);
  let candidate = join(directory, `${parsed}${suffix}`);
  let ordinal = 2;
  while (existsSync(candidate)) candidate = join(directory, `${parsed}-${ordinal++}${suffix}`);
  return candidate;
}

export class ConverterService {
  private readonly root: string;

  constructor(private readonly database: AppDatabase, dataDirectory: string) {
    this.root = join(dataDirectory, "converter");
    mkdirSync(this.root, { recursive: true });
  }

  async convert(inputs: ConverterInput[], options: ConverterOptions): Promise<ConverterJob> {
    if (!inputs.length) throw new Error("Add at least one image before converting.");
    if (inputs.length > 100) throw new Error("Convert up to 100 images at a time.");
    const jobId = crypto.randomUUID();
    const jobDirectory = join(this.root, jobId);
    const sourceDirectory = join(jobDirectory, "source");
    const outputDirectory = join(jobDirectory, "output");
    mkdirSync(sourceDirectory, { recursive: true });
    mkdirSync(outputDirectory, { recursive: true });
    const prepared: Array<{ id: string; ordinal: number; input: ConverterInput; sourcePath: string; format: ConverterFormat }> = [];
    try {
      for (const [index, input] of inputs.entries()) {
        const ordinal = index + 1;
        const sourcePath = await this.storeSource(input, sourceDirectory, ordinal);
        prepared.push({ id: crypto.randomUUID(), ordinal, input, sourcePath, format: formatFor(input, ordinal, options) });
      }
      this.database.createConverterJob({
        id: jobId,
        options,
        items: prepared.map((item) => ({
          id: item.id, ordinal: item.ordinal, sourceKind: item.input.sourceKind, sourceName: item.input.name,
          sourcePath: item.sourcePath, format: item.format,
        })),
      });
      const workers = Math.min(prepared.length, MAX_CONVERTER_WORKERS, Math.max(1, Math.floor(availableParallelism() / 2)));
      let nextItem = 0;
      await Promise.all(Array.from({ length: workers }, async () => {
        while (nextItem < prepared.length) {
          const item = prepared[nextItem++];
          if (!item) break;
          try {
            const outputName = `${options.prefix ? `${safeName(options.prefix)}-` : ""}${String(item.ordinal).padStart(3, "0")}-${safeName(item.input.name)}.${extension(item.format)}`;
            const outputPath = join(outputDirectory, outputName);
            await this.convertOne(item.sourcePath, outputPath, item.format, options);
            this.database.completeConverterItem(item.id, {
              outputName,
              outputPath,
              properties: await this.properties(outputPath, outputName),
            });
          } catch (error) {
            this.database.failConverterItem(item.id, error instanceof Error ? error.message : "Could not convert this image.");
          }
        }
      }));
      this.database.finishConverterJob(jobId);
      const job = this.database.listConverterJobs().find((candidate) => candidate.id === jobId);
      if (!job) throw new Error("Converter job was not saved.");
      return job;
    } catch (error) {
      if (!prepared.length) rmSync(jobDirectory, { recursive: true, force: true });
      throw error;
    }
  }

  listJobs(): ConverterJob[] { return this.database.listConverterJobs(); }
  listSessionImages() { return this.database.listConverterSessionImages(); }

  async outputDataUrl(jobId: string, itemId: string): Promise<string> {
    const path = this.requireOutput(jobId, itemId);
    const bytes = new Uint8Array(await Bun.file(path).arrayBuffer());
    const item = this.database.getConverterItem(jobId, itemId);
    return `data:${mimeType(item?.format ?? "png")};base64,${Buffer.from(bytes).toString("base64")}`;
  }

  async outputProperties(jobId: string, itemId: string): Promise<ConverterImageProperties> {
    const item = this.database.getConverterItem(jobId, itemId);
    if (!item?.properties) throw new Error("Image properties are unavailable.");
    return item.properties;
  }

  async sourceProperties(input: ConverterInput): Promise<ConverterImageProperties> {
    if (input.sourceKind === "session") {
      const asset = this.database.getAsset(input.assetId);
      if (!asset || !existsSync(asset.file_path)) throw new Error("This session image is no longer available.");
      return this.properties(asset.file_path, input.name);
    }
    const bytes = Buffer.from(input.dataBase64, "base64");
    if (!bytes.length) throw new Error("This image has no data.");
    const metadata = await sharp(bytes, { animated: true }).metadata();
    return {
      name: input.name, format: metadata.format ?? "unknown", mimeType: mimeType(metadata.format ?? ""), sizeBytes: bytes.length,
      width: metadata.width ?? 0, height: metadata.height ?? 0, channels: metadata.channels ?? null,
      bitDepth: metadata.depth ?? null, colorSpace: metadata.space ?? null, hasAlpha: Boolean(metadata.hasAlpha),
      density: metadata.density ?? null, orientation: metadata.orientation ?? null, pages: metadata.pages ?? null,
      hasExif: Boolean(metadata.exif), hasIcc: Boolean(metadata.icc),
    };
  }

  async copyOutput(jobId: string, itemId: string): Promise<void> {
    const source = this.requireOutput(jobId, itemId);
    const clipboardPng = join(this.root, `clipboard-${crypto.randomUUID()}.png`);
    try {
      await sharp(source).rotate().png().toFile(clipboardPng);
      await copyImageToClipboard(clipboardPng);
    } finally {
      rmSync(clipboardPng, { force: true });
    }
  }

  async copyFiles(jobId: string, itemIds: string[]): Promise<void> {
    const paths = itemIds.map((itemId) => this.requireOutput(jobId, itemId));
    await copyFilesToClipboard(paths);
  }

  async saveOutputs(jobId: string, itemIds: string[]): Promise<{ directory: string | null; saved: number }> {
    const directory = await pickFolder("Choose a folder for converted images");
    if (!directory) return { directory: null, saved: 0 };
    let saved = 0;
    for (const itemId of itemIds) {
      const source = this.requireOutput(jobId, itemId);
      copyFileSync(source, uniqueDestination(directory, basename(source)));
      saved += 1;
    }
    return { directory, saved };
  }

  deleteJob(jobId: string): void {
    const directory = resolve(join(this.root, jobId));
    const root = resolve(this.root);
    if (!directory.startsWith(`${root}\\`)) throw new Error("Converter job path is invalid.");
    this.database.deleteConverterJob(jobId);
    rmSync(directory, { recursive: true, force: true });
  }

  private async storeSource(input: ConverterInput, sourceDirectory: string, ordinal: number): Promise<string> {
    const target = join(sourceDirectory, `${String(ordinal).padStart(3, "0")}-${safeName(input.name)}${extname(input.name) || ".png"}`);
    if (input.sourceKind === "session") {
      const asset = this.database.getAsset(input.assetId);
      if (!asset || !existsSync(asset.file_path)) throw new Error(`${input.name} is no longer available from its session.`);
      copyFileSync(asset.file_path, target);
      return target;
    }
    const bytes = Buffer.from(input.dataBase64, "base64");
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error(`${input.name} is empty or exceeds 50 MB.`);
    await Bun.write(target, bytes);
    return target;
  }

  private async convertOne(source: string, target: string, format: ConverterFormat, options: ConverterOptions): Promise<void> {
    const instance = sharp(source, { failOn: "warning" }).rotate();
    if (options.width || options.height) instance.resize({ width: options.width ?? undefined, height: options.height ?? undefined, fit: options.fit });
    if (format === "bmp") {
      const { data, info } = await instance.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const encoded = bmp.encode({ data, width: info.width, height: info.height });
      await Bun.write(target, encoded.data);
      return;
    }
    const quality = qualityFor(options);
    if (format === "jpg") instance.flatten({ background: options.background }).jpeg({ quality, mozjpeg: true });
    if (format === "png") instance.png({ compressionLevel: options.quality === "smallest" ? 9 : 6 });
    if (format === "webp") instance.webp({ quality, effort: options.quality === "best" ? 6 : 4 });
    if (format === "avif") instance.avif({ quality: options.quality === "smallest" ? 40 : options.quality === "best" ? 70 : 55, effort: options.quality === "best" ? 6 : 4 });
    if (format === "tiff") instance.tiff({ quality, compression: "lzw" });
    if (!options.stripMetadata) instance.withMetadata();
    const temporary = `${target}.tmp-${crypto.randomUUID()}`;
    await instance.toFile(temporary);
    renameSync(temporary, target);
  }

  private async properties(path: string, name: string): Promise<ConverterImageProperties> {
    const metadata = await sharp(path, { animated: true }).metadata();
    return {
      name, format: metadata.format ?? (extname(path).slice(1) || "unknown"), mimeType: mimeType(metadata.format ?? ""),
      sizeBytes: statSync(path).size, width: metadata.width ?? 0, height: metadata.height ?? 0,
      channels: metadata.channels ?? null, bitDepth: metadata.depth ?? null, colorSpace: metadata.space ?? null,
      hasAlpha: Boolean(metadata.hasAlpha), density: metadata.density ?? null, orientation: metadata.orientation ?? null,
      pages: metadata.pages ?? null, hasExif: Boolean(metadata.exif), hasIcc: Boolean(metadata.icc),
    };
  }

  private requireOutput(jobId: string, itemId: string): string {
    const path = this.database.getConverterOutputPath(jobId, itemId);
    if (!path || !existsSync(path)) throw new Error("This converted image is no longer available.");
    return path;
  }
}
