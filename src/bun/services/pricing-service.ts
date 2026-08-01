import { join } from "node:path";

export type QualityTier = "low" | "medium" | "high";

type PricingConfig = {
  batchDiscount: number;
  defaults: {
    perImageUsd: Record<QualityTier, number>;
    inputTokenUsd: number;
    outputTokenUsd: number;
  };
  models: Record<string, {
    perImageUsd?: Partial<Record<QualityTier, number>>;
    inputTokenUsd?: number;
    outputTokenUsd?: number;
  }>;
};

const FALLBACK: PricingConfig = {
  batchDiscount: 0.5,
  defaults: {
    perImageUsd: { low: 0.01, medium: 0.04, high: 0.17 },
    inputTokenUsd: 0.00001,
    outputTokenUsd: 0.00004,
  },
  models: {},
};

export class PricingService {
  private config: PricingConfig = FALLBACK;

  constructor(private readonly assetRoots: string[]) {}

  async load(): Promise<void> {
    for (const root of this.assetRoots) {
      try {
        this.config = await Bun.file(join(root, "config", "pricing.json")).json() as PricingConfig;
        return;
      } catch {
        // Try next asset root.
      }
    }
  }

  private modelRates(model: string) {
    const entry = this.config.models[model] ?? {};
    return {
      perImageUsd: {
        low: entry.perImageUsd?.low ?? this.config.defaults.perImageUsd.low,
        medium: entry.perImageUsd?.medium ?? this.config.defaults.perImageUsd.medium,
        high: entry.perImageUsd?.high ?? this.config.defaults.perImageUsd.high,
      },
      inputTokenUsd: entry.inputTokenUsd ?? this.config.defaults.inputTokenUsd,
      outputTokenUsd: entry.outputTokenUsd ?? this.config.defaults.outputTokenUsd,
    };
  }

  estimateUsd(params: {
    model: string;
    promptCount: number;
    mode: "batch" | "direct";
    quality: QualityTier;
  }): number {
    const rates = this.modelRates(params.model);
    const perImage = rates.perImageUsd[params.quality];
    const subtotal = perImage * params.promptCount;
    return params.mode === "batch" ? subtotal * this.config.batchDiscount : subtotal;
  }

  costFromUsage(params: {
    model: string;
    mode: "batch" | "direct";
    quality: QualityTier;
    imageCount: number;
    inputTokens: number;
    outputTokens: number;
  }): number {
    const rates = this.modelRates(params.model);
    const imageCost = rates.perImageUsd[params.quality] * params.imageCount;
    const tokenCost =
      params.inputTokens * rates.inputTokenUsd +
      params.outputTokens * rates.outputTokenUsd;
    const subtotal = imageCost + tokenCost;
    return params.mode === "batch" ? subtotal * this.config.batchDiscount : subtotal;
  }
}
