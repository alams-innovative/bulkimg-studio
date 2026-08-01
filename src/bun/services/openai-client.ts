import type { SubmitRunInput } from "../../shared/contracts";

const API_BASE = Bun.env["OPENAI_BASE_URL"] ?? "https://api.openai.com/v1";

type BatchObject = {
  id: string;
  status: "validating" | "failed" | "in_progress" | "finalizing" | "completed" | "expired" | "cancelling" | "cancelled";
  request_counts?: { total: number; completed: number; failed: number };
  usage?: { input_tokens?: number; output_tokens?: number };
  errors?: { data?: Array<{ message?: string }> } | null;
};

export function createBatchJsonl(input: SubmitRunInput): string {
  return input.prompts.map((prompt, index) => JSON.stringify({
    custom_id: `prompt-${String(index + 1).padStart(5, "0")}`,
    method: "POST",
    url: "/v1/images/generations",
    body: {
      model: input.model,
      prompt: prompt.promptText,
      size: input.size,
      quality: input.quality,
      output_format: "png",
    },
  })).join("\n");
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
    return response.json() as Promise<T>;
  }

  async submitBatch(input: SubmitRunInput): Promise<BatchObject> {
    const form = new FormData();
    form.set("purpose", "batch");
    form.set("file", new File([createBatchJsonl(input)], "bulkimg-batch.jsonl", { type: "application/jsonl" }));
    const uploaded = await this.request<{ id: string }>("/files", { method: "POST", body: form });
    return this.request<BatchObject>("/batches", {
      method: "POST",
      body: JSON.stringify({
        input_file_id: uploaded.id,
        endpoint: "/v1/images/generations",
        completion_window: "24h",
        metadata: { application: "bulkimg-studio", version: "2.0.0" },
      }),
    });
  }

  async getBatch(batchId: string): Promise<BatchObject> {
    return this.request<BatchObject>(`/batches/${encodeURIComponent(batchId)}`);
  }

  async generateDirect(input: SubmitRunInput): Promise<{ completed: number }> {
    let completed = 0;
    for (const prompt of input.prompts) {
      await this.request("/images/generations", {
        method: "POST",
        body: JSON.stringify({
          model: input.model,
          prompt: prompt.promptText,
          size: input.size,
          quality: input.quality,
          output_format: "png",
        }),
      });
      completed += 1;
    }
    return { completed };
  }
}
