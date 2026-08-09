import type { AppDatabase } from "../database";

const FALLBACK_RATE = Number(Bun.env["USD_PKR_FALLBACK_RATE"] ?? 276.61);
export const FX_CACHE_TTL_SECONDS = 15 * 60;

export class FxService {
  private state: { source: "live" | "cache" | "fallback"; cacheAgeSeconds: number | null } = { source: "fallback", cacheAgeSeconds: null };
  constructor(private readonly database: AppDatabase) {}

  getState(): { source: "live" | "cache" | "fallback"; cacheAgeSeconds: number | null } { return { ...this.state }; }

  async getUsdPkrRate(): Promise<number> {
    const cached = this.database.getCachedFx();
    if (cached && cached.ageSeconds < FX_CACHE_TTL_SECONDS) {
      this.state = { source: "cache", cacheAgeSeconds: cached.ageSeconds };
      return cached.rate;
    }
    try {
      const response = await fetch("https://api.frankfurter.dev/v2/rate/USD/PKR?providers=SBP", { signal: AbortSignal.timeout(6000) });
      if (!response.ok) throw new Error(`FX API returned ${response.status}`);
      const payload = await response.json() as { rate?: number };
      const rate = payload.rate;
      if (!rate || !Number.isFinite(rate)) throw new Error("FX API response has no PKR rate");
      this.database.setCachedFx(rate);
      this.state = { source: "live", cacheAgeSeconds: 0 };
      return rate;
    } catch {
      this.state = cached ? { source: "cache", cacheAgeSeconds: cached.ageSeconds } : { source: "fallback", cacheAgeSeconds: null };
      return cached?.rate ?? FALLBACK_RATE;
    }
  }
}
