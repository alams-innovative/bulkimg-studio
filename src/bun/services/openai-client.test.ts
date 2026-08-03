import { describe, expect, test } from "bun:test";
import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBatchJsonl, OpenAIClient, OpenAIError } from "./openai-client";

describe("OpenAI image payloads", () => {
  test.each([
    ["square", "1024x1024"], ["portrait", "1024x1280"],
    ["landscape", "1536x864"], ["story", "864x1536"],
  ] as const)("maps %s to %s", (format, size) => {
    const request = JSON.parse(createBatchJsonl({
      prompts: [{ promptText: "A glass city", week: "1", scheduleDate: "Wednesday", themeColumn: "Technology" }],
      model: "gpt-image-2", mode: "batch", format, quality: "high",
    })) as { url: string; body: { model: string; size: string } };
    expect(request.url).toBe("/v1/images/generations");
    expect(request.body).toMatchObject({ model: "gpt-image-2", size });
  });

  test("uses every file reference for batch edits", () => {
    const request = JSON.parse(createBatchJsonl({
      prompts: [{ promptText: "Change the background", week: "1", scheduleDate: "Monday", themeColumn: "Product" }],
      model: "gpt-image-2", mode: "batch", format: "square", quality: "medium",
      referenceImageFileIds: ["file-reference-123", "file-reference-456"],
    })) as { url: string; body: { images: Array<{ file_id: string }> } };
    expect(request.url).toBe("/v1/images/edits");
    expect(request.body.images).toEqual([{ file_id: "file-reference-123" }, { file_id: "file-reference-456" }]);
  });

  test("uses every file reference for direct edits", async () => {
    let received: { images?: Array<{ file_id: string }> } = {};
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        received = await request.json() as typeof received;
        return Response.json({ data: [{ b64_json: "image-data" }], usage: { input_tokens: 10, output_tokens: 20 } });
      },
    });
    try {
      const client = new OpenAIClient("sk-test-key-1234567890", `http://127.0.0.1:${server.port}`);
      await client.generateOne({
        prompts: [{ promptText: "Combine them", week: "", scheduleDate: "", themeColumn: "" }],
        model: "gpt-image-2", mode: "direct", format: "square", quality: "medium",
        referenceImageFileIds: ["file-one", "file-two"],
      }, 0);
      expect(received.images).toEqual([{ file_id: "file-one" }, { file_id: "file-two" }]);
    } finally { server.stop(true); }
  });
});

describe("OpenAI provider errors", () => {
  test("captures request ID and Retry-After without exposing a raw body", async () => {
    const server = Bun.serve({ port: 0, fetch: () => Response.json({ error: { message: "Rate limit reached", code: "rate_limit" }, secret: "discard-me" }, { status: 429, headers: { "x-request-id": "req_test", "retry-after": "2" } }) });
    try {
      const client = new OpenAIClient("sk-test-key-1234567890", `http://127.0.0.1:${server.port}`);
      const error = await client.getBatch("batch-1").catch((value: unknown) => value);
      expect(error).toBeInstanceOf(OpenAIError);
      expect((error as OpenAIError).toSafeError()).toMatchObject({
        message: "Rate limit reached", category: "rate_limit", httpStatus: 429, requestId: "req_test",
      });
      expect((error as Error).message).not.toContain("discard-me");
      expect(Date.parse((error as OpenAIError).retryAt!)).toBeGreaterThan(Date.now());
    } finally { server.stop(true); }
  });

  test("downloads batch output to disk within a long timeout", async () => {
    const payload = `${"x".repeat(50_000)}\nline-two\n`;
    const server = Bun.serve({
      port: 0,
      fetch: () => new Response(payload, { headers: { "content-type": "application/jsonl" } }),
    });
      const destination = join(tmpdir(), `bulkimg-download-${crypto.randomUUID()}.jsonl`);
    try {
      const client = new OpenAIClient("sk-test-key-1234567890", `http://127.0.0.1:${server.port}`);
      await client.downloadFileToPath("file-output", destination);
      expect(await Bun.file(destination).text()).toBe(payload);
    } finally {
      server.stop(true);
      try { unlinkSync(destination); } catch { /* ignore */ }
    }
  });
});
