import type { FailureCategory, RateLimitHeaderProbe, RateLimitSnapshot, SanitizedProviderError, SubmitRunInput } from "../../shared/contracts";
import { outputSize } from "../../shared/output-formats";

const DEFAULT_API_BASE = Bun.env["OPENAI_BASE_URL"] ?? "https://api.openai.com/v1";
const APP_VERSION = "1.0.2-beta";
const SHORT_TIMEOUT_MS = 15_000;
const IMAGE_TIMEOUT_MS = 180_000;
const FILE_DOWNLOAD_TIMEOUT_MS = 600_000;

export type BatchObject = {
  id: string;
  status: "validating" | "failed" | "in_progress" | "finalizing" | "completed" | "expired" | "cancelling" | "cancelled";
  request_counts?: { total: number; completed: number; failed: number };
  output_file_id?: string | null;
  errors?: { data?: Array<{ message?: string }> } | null;
};

export type DirectImageResult = {
  index: number;
  b64Json: string | null;
  url: string | null;
  inputTokens: number;
  outputTokens: number;
  requestId: string | null;
  rateHeaders?: RateLimitHeaderProbe;
};

export type ProjectRateLimitRow = {
  id: string;
  model: string;
  max_requests_per_1_minute?: number;
  max_tokens_per_1_minute?: number;
  max_images_per_1_minute?: number;
  batch_1_day_max_input_tokens?: number;
};

function retryAtFromHeader(value: string | null): string | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return new Date(Date.now() + Math.max(0, seconds) * 1000).toISOString();
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function categoryFor(status: number, code?: string): FailureCategory {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limit";
  if (status === 400 || status === 404 || status === 422 || code === "invalid_request_error") return "validation";
  return status >= 500 ? "provider" : "unknown";
}

function parseRateHeaders(headers: Headers): RateLimitHeaderProbe {
  const num = (name: string) => {
    const raw = headers.get(name);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };
  return {
    limitRequests: num("x-ratelimit-limit-requests"),
    remainingRequests: num("x-ratelimit-remaining-requests"),
    limitTokens: num("x-ratelimit-limit-tokens"),
    remainingTokens: num("x-ratelimit-remaining-tokens"),
    limitImages: num("x-ratelimit-limit-images"),
    remainingImages: num("x-ratelimit-remaining-images"),
    capturedAt: new Date().toISOString(),
  };
}

export class OpenAIError extends Error {
  readonly status: number | null;
  readonly requestId: string | null;
  readonly retryAt: string | null;
  readonly category: FailureCategory;

  constructor(params: SanitizedProviderError) {
    super(params.message);
    this.name = "OpenAIError";
    this.status = params.httpStatus;
    this.requestId = params.requestId;
    this.retryAt = params.retryAt;
    this.category = params.category;
  }

  toSafeError(): SanitizedProviderError {
    return {
      message: this.message,
      category: this.category,
      httpStatus: this.status,
      requestId: this.requestId,
      retryAt: this.retryAt,
    };
  }
}

export function sanitizedError(error: unknown): SanitizedProviderError {
  if (error instanceof OpenAIError) return error.toSafeError();
  if (error instanceof DOMException && error.name === "AbortError") {
    return { message: "Request cancelled.", category: "cancelled", httpStatus: null, requestId: null, retryAt: null };
  }
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return { message: "OpenAI did not respond before the request timeout.", category: "timeout", httpStatus: null, requestId: null, retryAt: null };
  }
  const message = error instanceof Error ? error.message.slice(0, 240) : "The provider request failed.";
  if (/ON CONFLICT|SQLITE|database/i.test(message)) {
    return { message: "A local database error occurred while saving results.", category: "unknown", httpStatus: null, requestId: null, retryAt: null };
  }
  return { message, category: "network", httpStatus: null, requestId: null, retryAt: null };
}

function generationBody(input: SubmitRunInput, promptText: string) {
  return {
    model: input.model,
    prompt: promptText,
    size: outputSize(input.format),
    quality: input.quality,
    output_format: "png" as const,
  };
}

function referenceImages(input: SubmitRunInput): Array<{ file_id: string }> {
  return (input.referenceImageFileIds ?? []).map((fileId) => ({ file_id: fileId }));
}

export function createBatchJsonl(input: SubmitRunInput): string {
  const images = referenceImages(input);
  const endpoint = images.length ? "/v1/images/edits" : "/v1/images/generations";
  return input.prompts.map((prompt, index) => JSON.stringify({
    custom_id: "prompt-" + String(index + 1).padStart(5, "0"),
    method: "POST",
    url: endpoint,
    body: images.length
      ? { ...generationBody(input, prompt.promptText), images }
      : generationBody(input, prompt.promptText),
  })).join("\n");
}

export function pickImageRateLimit(rows: ProjectRateLimitRow[]): RateLimitSnapshot | null {
  const preferred = rows.find((row) => row.model === "gpt-image-2")
    ?? rows.find((row) => row.model.startsWith("gpt-image"));
  if (!preferred) return null;
  return {
    model: preferred.model,
    maxImagesPerMinute: preferred.max_images_per_1_minute ?? null,
    maxTokensPerMinute: preferred.max_tokens_per_1_minute ?? null,
    maxRequestsPerMinute: preferred.max_requests_per_1_minute ?? null,
    batchDayMaxInputTokens: preferred.batch_1_day_max_input_tokens ?? null,
    fetchedAt: new Date().toISOString(),
  };
}

export class OpenAIClient {
  lastRateHeaders: RateLimitHeaderProbe | null = null;

  constructor(private readonly apiKey: string, private readonly apiBase = DEFAULT_API_BASE) {}

  private async request<T>(path: string, init: RequestInit = {}, timeoutMs = SHORT_TIMEOUT_MS): Promise<{ data: T; requestId: string | null; rateHeaders: RateLimitHeaderProbe }> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", "Bearer " + this.apiKey);
    if (!(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
    let response: Response;
    try {
      response = await fetch(this.apiBase + path, { ...init, headers, signal });
    } catch (error) {
      if (init.signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
      if (timeoutSignal.aborted) throw new DOMException("Request timed out", "TimeoutError");
      throw error;
    }
    const requestId = response.headers.get("x-request-id");
    const rateHeaders = parseRateHeaders(response.headers);
    this.lastRateHeaders = rateHeaders;
    if (!response.ok) {
      let providerMessage = "OpenAI could not complete the request.";
      let code: string | undefined;
      try {
        const payload = await response.json() as { error?: { message?: string; code?: string; type?: string } };
        providerMessage = payload.error?.message?.slice(0, 240) || providerMessage;
        code = payload.error?.code ?? payload.error?.type;
      } catch { /* discarded */ }
      throw new OpenAIError({
        message: providerMessage,
        category: categoryFor(response.status, code),
        httpStatus: response.status,
        requestId,
        retryAt: retryAtFromHeader(response.headers.get("retry-after")),
      });
    }
    if (response.status === 204) return { data: undefined as T, requestId, rateHeaders };
    const text = await response.text();
    return { data: text ? JSON.parse(text) as T : undefined as T, requestId, rateHeaders };
  }

  async validateKey(): Promise<void> {
    await this.request("/models/" + encodeURIComponent("gpt-image-2"), {}, SHORT_TIMEOUT_MS);
  }

  async validateAdminKey(): Promise<void> {
    await this.request("/organization/projects?limit=1", {}, SHORT_TIMEOUT_MS);
  }

  async listProjects(): Promise<Array<{ id: string; name: string }>> {
    const response = await this.request<{ data?: Array<{ id: string; name?: string; title?: string }> }>(
      "/organization/projects?limit=100", {}, SHORT_TIMEOUT_MS,
    );
    return (response.data.data ?? []).map((project) => ({
      id: project.id,
      name: project.name || project.title || project.id,
    }));
  }

  async listProjectRateLimits(projectId: string): Promise<RateLimitSnapshot | null> {
    const response = await this.request<{ data?: ProjectRateLimitRow[] }>(
      "/organization/projects/" + encodeURIComponent(projectId) + "/rate_limits?limit=100",
      {}, SHORT_TIMEOUT_MS,
    );
    return pickImageRateLimit(response.data.data ?? []);
  }

  async uploadReferenceImage(bytes: Uint8Array, filename: string, mimeType: string): Promise<string> {
    const form = new FormData();
    form.set("purpose", "vision");
    form.set("file", new File([Buffer.from(bytes)], filename, { type: mimeType }));
    return (await this.request<{ id: string }>("/files", { method: "POST", body: form })).data.id;
  }

  async deleteFile(fileId: string): Promise<void> {
    await this.request("/files/" + encodeURIComponent(fileId), { method: "DELETE" });
  }

  async submitBatch(input: SubmitRunInput): Promise<BatchObject> {
    const endpoint = referenceImages(input).length ? "/v1/images/edits" : "/v1/images/generations";
    const form = new FormData();
    form.set("purpose", "batch");
    form.set("file", new File([createBatchJsonl(input)], "bulkimg-batch.jsonl", { type: "application/jsonl" }));
    const uploaded = (await this.request<{ id: string }>("/files", { method: "POST", body: form })).data;
    return (await this.request<BatchObject>("/batches", {
      method: "POST",
      body: JSON.stringify({
        input_file_id: uploaded.id,
        endpoint,
        completion_window: "24h",
        metadata: { application: "bulkimg-studio", version: APP_VERSION },
      }),
    })).data;
  }

  async getBatch(batchId: string): Promise<BatchObject> {
    return (await this.request<BatchObject>("/batches/" + encodeURIComponent(batchId))).data;
  }

  async cancelBatch(batchId: string): Promise<BatchObject> {
    return (await this.request<BatchObject>("/batches/" + encodeURIComponent(batchId) + "/cancel", { method: "POST" })).data;
  }

  async downloadFileToPath(fileId: string, destinationPath: string): Promise<void> {
    const headers = { Authorization: "Bearer " + this.apiKey };
    let response: Response;
    try {
      response = await fetch(this.apiBase + "/files/" + encodeURIComponent(fileId) + "/content", {
        headers,
        signal: AbortSignal.timeout(FILE_DOWNLOAD_TIMEOUT_MS),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "TimeoutError") {
        throw new DOMException("OpenAI batch output download timed out.", "TimeoutError");
      }
      throw error;
    }
    this.lastRateHeaders = parseRateHeaders(response.headers);
    if (!response.ok) {
      throw new OpenAIError({
        message: "OpenAI batch output could not be downloaded.",
        category: categoryFor(response.status),
        httpStatus: response.status,
        requestId: response.headers.get("x-request-id"),
        retryAt: retryAtFromHeader(response.headers.get("retry-after")),
      });
    }
    const written = await Bun.write(destinationPath, response);
    if (written < 1) {
      throw new OpenAIError({
        message: "OpenAI batch output file was empty.",
        category: "provider",
        httpStatus: response.status,
        requestId: response.headers.get("x-request-id"),
        retryAt: null,
      });
    }
  }

  async generateOne(input: SubmitRunInput, index: number, signal?: AbortSignal): Promise<DirectImageResult> {
    const prompt = input.prompts[index];
    if (!prompt) throw new Error("Prompt " + (index + 1) + " was not found.");
    type ImageResponse = {
      data?: Array<{ b64_json?: string; url?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const images = referenceImages(input);
    const response = await this.request<ImageResponse>(
      images.length ? "/images/edits" : "/images/generations",
      {
        method: "POST",
        body: JSON.stringify(images.length
          ? { ...generationBody(input, prompt.promptText), images }
          : generationBody(input, prompt.promptText)),
        signal,
      },
      IMAGE_TIMEOUT_MS,
    );
    return {
      index,
      b64Json: response.data.data?.[0]?.b64_json ?? null,
      url: response.data.data?.[0]?.url ?? null,
      inputTokens: response.data.usage?.input_tokens ?? 0,
      outputTokens: response.data.usage?.output_tokens ?? 0,
      requestId: response.requestId,
      rateHeaders: response.rateHeaders,
    };
  }
}

