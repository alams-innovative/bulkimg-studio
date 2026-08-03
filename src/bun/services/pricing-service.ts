import { join } from "node:path";
import type { OutputFormatId, QualityTier, RunMode } from "../../shared/contracts";

type FormatRates = Record<OutputFormatId, Record<QualityTier, number>>;

type PricingConfig = {
  version: string;
  batchDiscount: number;
  imageEstimatesUsd: FormatRates;
  referenceInputEstimateUsd: number;
  inputTokenUsd: number;
  outputTokenUsd: number;
};

const FALLBACK: PricingConfig = {
  version: "gpt-image-2-2026-08-03",
  batchDiscount: 0.5,
  imageEstimatesUsd: {
    square: { low: 0.006, medium: 0.053, high: 0.211 },
    portrait: { low: 0.005, medium: 0.041, high: 0.165 },
    landscape: { low: 0.005, medium: 0.041, high: 0.165 },
    story: { low: 0.005, medium: 0.041, high: 0.165 },
  },
  referenceInputEstimateUsd: 0.002,
  inputTokenUsd: 0.00001,
  outputTokenUsd: 0.00004,
};

export class PricingService {
  private config: PricingConfig = FALLBACK;

  constructor(private readonly assetRoots: string[]) {}

  async load(): Promise<void> {
    for (const root of this.assetRoots) {
      try {
        const candidate = await Bun.file(join(root, "config", "pricing.json")).json() as Partial<PricingConfig>;
        if (candidate.version && candidate.imageEstimatesUsd) {
          this.config = { ...FALLBACK, ...candidate } as PricingConfig;
          return;
        }
      } catch {
        // Try the packaged asset root, then use the reviewed fallback table.
      }
    }
  }

  get version(): string { return this.config.version; }

  estimateUsd(params: {
    model: string;
    promptCount: number;
    mode: RunMode;
    quality: QualityTier;
    format: OutputFormatId;
    referenceCount: number;
  }): number {
    if (params.model !== "gpt-image-2") throw new Error("Only GPT Image 2 is supported.");
    const image = this.config.imageEstimatesUsd[params.format][params.quality];
    const reference = this.config.referenceInputEstimateUsd * Math.max(0, params.referenceCount);
    const subtotal = (image + reference) * params.promptCount;
    return params.mode === "batch" ? subtotal * this.config.batchDiscount : subtotal;
  }

  costFromUsage(params: {
    model: string;
    mode: RunMode;
    inputTokens: number;
    outputTokens: number;
  }): number {
    if (params.model !== "gpt-image-2") throw new Error("Only GPT Image 2 is supported.");
    const subtotal = params.inputTokens * this.config.inputTokenUsd + params.outputTokens * this.config.outputTokenUsd;
    return params.mode === "batch" ? subtotal * this.config.batchDiscount : subtotal;
  }
}
