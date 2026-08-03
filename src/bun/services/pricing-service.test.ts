import { describe, expect, test } from "bun:test";
import { PricingService } from "./pricing-service";

describe("pricing service", () => {
  test("applies the batch discount to image and token costs", () => {
    const pricing = new PricingService([]);

    expect(pricing.estimateUsd({
      model: "gpt-image-2",
      promptCount: 2,
      mode: "batch",
      quality: "high",
    })).toBeCloseTo(0.17);

    expect(pricing.costFromUsage({
      model: "gpt-image-2",
      mode: "batch",
      quality: "medium",
      imageCount: 3,
      inputTokens: 1_000,
      outputTokens: 500,
    })).toBeCloseTo(0.075);
  });

  test("keeps direct estimates undiscounted", () => {
    const pricing = new PricingService([]);
    expect(pricing.estimateUsd({
      model: "gpt-image-2",
      promptCount: 3,
      mode: "direct",
      quality: "medium",
    })).toBeCloseTo(0.12);
  });
});
