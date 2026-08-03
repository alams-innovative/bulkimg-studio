import type { SubmitRunInput } from "../../shared/contracts";

const API_BASE = Bun.env["OPENAI_BASE_URL"] ?? "https://api.openai.com/v1";
const APP_VERSION = "1.0.0-beta";

type BatchObject = {
  id: string;
  status: "validating" | "failed" | "in_progress" | "finalizing" | "completed" | "expired" | "cancelling" | "cancelled";
  request_counts?: { total: number; completed: number; failed: number };
  usage?: { input_tokens?: number; output_tokens?: number };
  output_file_id?: string | null;
  errors?: { data?: Array<{ message?: string }> } | null;
};

export type DirectImageResult = {
  index: number;
  b64Json: string | null;
  url: string | null;
  inputTokens: number;
  outputTokens: number;
};

function generationBody(input: SubmitRunInput, promptText: string) {
  return {
    model: input.model,
    prompt: promptText,
    size: input.size,
    quality: input.quality,
    output_format: "png" as const,
  };
}

export function createBatchJsonl(input: SubmitRunInput): string {
  const endpoint = input.referenceImageFileId ? "/v1/images/edits" : "/v1/images/generations";
  return input.prompts.map((prompt, index) => {
    const body = input.referenceImageFileId
      ? {
          model: input.model,
          prompt: prompt.promptText,
          images: [{ file_id: input.referenceImageFileId }],
          size: input.size,
          quality: input.quality,
          output_format: "png",
        }
      : generationBody(input, prompt.promptText);
    return JSON.stringify({
      custom_id: `prompt-${String(index + 1).padStart(5, "0")}`,
      method: "POST",
      url: endpoint,
      body,
    });
  }).join("\n");
}

export class OpenAIClient {
  constructor(private readonly apiKey: string) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.apiKey}`);
    if (!(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
    const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
    if (!response.ok) {
      const body = await response.text();
      const error = new Error(`OpenAI ${response.status}: ${body.slice(0, 500)}`);
      Object.assign(error, { status: response.status });
      throw error;
    }
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return text ? JSON.parse(text) as T : undefined as T;
  }

  async uploadReferenceImage(bytes: Uint8Array, filename: string, mimeType: string): Promise<string> {
    const form = new FormData();
    form.set("purpose", "vision");
    form.set("file", new File([Buffer.from(bytes)], filename, { type: mimeType }));
    const uploaded = await this.request<{ id: string }>("/files", { method: "POST", body: form });
    return uploaded.id;
  }

  async submitBatch(input: SubmitRunInput): Promise<BatchObject> {
    const endpoint = input.referenceImageFileId ? "/v1/images/edits" : "/v1/images/generations";
    const form = new FormData();
    form.set("purpose", "batch");
    form.set("file", new File([createBatchJsonl(input)], "bulkimg-batch.jsonl", { type: "application/jsonl" }));
    const uploaded = await this.request<{ id: string }>("/files", { method: "POST", body: form });
    return this.request<BatchObject>("/batches", {
      method: "POST",
      body: JSON.stringify({
        input_file_id: uploaded.id,
        endpoint,
        completion_window: "24h",
        metadata: { application: "bulkimg-studio", version: APP_VERSION },
      }),
    });
  }

  async getBatch(batchId: string): Promise<BatchObject> {
    return this.request<BatchObject>(`/batches/${encodeURIComponent(batchId)}`);
  }

  async cancelBatch(batchId: string): Promise<BatchObject> {
    return this.request<BatchObject>(`/batches/${encodeURIComponent(batchId)}/cancel`, { method: "POST" });
  }

  async getFileContent(fileId: string): Promise<string> {
    const response = await fetch(`${API_BASE}/files/${encodeURIComponent(fileId)}/content`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!response.ok) throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
    return response.text();
  }

  async generateDirect(
    input: SubmitRunInput,
    options?: { signal?: AbortSignal; onPromptDone?: (completed: number) => void },
  ): Promise<{
    completed: number; inputTokens: number; outputTokens: number; images: DirectImageResult[];
  }> {
    let completed = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    const images: DirectImageResult[] = [];
    for (const [index, prompt] of input.prompts.entries()) {
      if (options?.signal?.aborted) throw new Error("Run cancelled.");
      let response: {
        data?: Array<{ b64_json?: string; url?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      if (input.referenceImageFileId) {
        response = await this.request("/images/edits", {
          method: "POST",
          body: JSON.stringify({
            model: input.model,
            prompt: prompt.promptText,
            images: [{ file_id: input.referenceImageFileId }],
            size: input.size,
            quality: input.quality,
            output_format: "png",
          }),
          signal: options?.signal,
        });
      } else {
        response = await this.request("/images/generations", {
          method: "POST",
          body: JSON.stringify(generationBody(input, prompt.promptText)),
          signal: options?.signal,
        });
      }
      completed += 1;
      const requestInputTokens = response.usage?.input_tokens ?? 0;
      const requestOutputTokens = response.usage?.output_tokens ?? 0;
      inputTokens += requestInputTokens;
      outputTokens += requestOutputTokens;
      images.push({
        index,
        b64Json: response.data?.[0]?.b64_json ?? null,
        url: response.data?.[0]?.url ?? null,
        inputTokens: requestInputTokens,
        outputTokens: requestOutputTokens,
      });
      options?.onPromptDone?.(completed);
    }
    return { completed, inputTokens, outputTokens, images };
  }
}
