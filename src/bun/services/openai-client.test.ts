import { expect, test } from "bun:test";
import { createBatchJsonl } from "./openai-client";

test("creates valid image-generation JSONL for a one-item batch", () => {
  const jsonl = createBatchJsonl({
    prompts: [{ promptText: "A glass city", week: "1", scheduleDate: "Wednesday", themeColumn: "Technology" }],
    model: "gpt-image-2",
    mode: "batch",
    size: "1024x1024",
    quality: "high",
  });
  const request = JSON.parse(jsonl) as { url: string; body: { model: string } };
  expect(request.url).toBe("/v1/images/generations");
  expect(request.body.model).toBe("gpt-image-2");
});
