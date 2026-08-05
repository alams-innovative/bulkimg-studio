import { describe, expect, test } from "bun:test";
import { PricingService } from "./pricing-service";

describe("pricing service", () => {
  test("uses format estimates and applies the batch discount", () => {
    const pricing = new PricingService([]);
    expect(pricing.estimateUsd({
      model: "gpt-image-2", promptCount: 2, mode: "batch", quality: "high",
      format: "square", referenceCount: 0,
    })).toBeCloseTo(0.211);
  });

  test("calculates actual cost from usage without a second flat image charge", () => {
    const pricing = new PricingService([]);
    expect(pricing.costFromUsage({
      model: "gpt-image-2", mode: "batch", inputTokens: 1_000, outputTokens: 500,
    })).toBeCloseTo(0.01, 6);
  });

  test("prices image input separately from text and image output tokens", () => {
    const pricing = new PricingService([]);
    expect(pricing.costFromUsage({
      model: "gpt-image-2",
      mode: "direct",
      inputTokens: 1_000,
      outputTokens: 500,
      inputTextTokens: 600,
      inputImageTokens: 400,
      outputImageTokens: 500,
    })).toBeCloseTo(0.0212, 6);
  });

  test("exposes token categories for the usage view", () => {
    const pricing = new PricingService([]);
    expect(pricing.getView()).toMatchObject({
      batchDiscount: 0.5,
      textInputTokenUsd: 0.000005,
      imageInputTokenUsd: 0.000008,
      imageOutputTokenUsd: 0.00003,
    });
  });

  test("adds the compact reference allowance to pre-run estimates", () => {
    const pricing = new PricingService([]);
    expect(pricing.estimateUsd({
      model: "gpt-image-2", promptCount: 3, mode: "direct", quality: "medium",
      format: "square", referenceCount: 1,
    })).toBeCloseTo(0.165);
  });

  test("scales the reference allowance by image count", () => {
    const pricing = new PricingService([]);
    const one = pricing.estimateUsd({ model: "gpt-image-2", promptCount: 1, mode: "direct", quality: "medium", format: "square", referenceCount: 1 });
    const four = pricing.estimateUsd({ model: "gpt-image-2", promptCount: 1, mode: "direct", quality: "medium", format: "square", referenceCount: 4 });
    expect(four - one).toBeCloseTo(0.006, 6);
  });

  test("supports up to 16 reference images in estimates", () => {
    const pricing = new PricingService([]);
    const zero = pricing.estimateUsd({ model: "gpt-image-2", promptCount: 1, mode: "batch", quality: "medium", format: "square", referenceCount: 0 });
    const sixteen = pricing.estimateUsd({ model: "gpt-image-2", promptCount: 1, mode: "batch", quality: "medium", format: "square", referenceCount: 16 });
    expect(sixteen).toBeGreaterThan(zero);
    const fifteen = pricing.estimateUsd({ model: "gpt-image-2", promptCount: 1, mode: "batch", quality: "medium", format: "square", referenceCount: 15 });
    expect(sixteen - fifteen).toBeCloseTo(fifteen - zero > 0 ? (fifteen - zero) / 15 : 0, 6);
  });
});
