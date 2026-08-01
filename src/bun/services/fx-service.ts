import type { AppDatabase } from "../database";

const FALLBACK_RATE = Number(Bun.env["USD_PKR_FALLBACK_RATE"] ?? 276.61);

export class FxService {
  constructor(private readonly database: AppDatabase) {}

  async getUsdPkrRate(): Promise<number> {
    const cached = this.database.getCachedFx();
    if (cached && cached.ageSeconds < 3600) return cached.rate;
    try {
      const response = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(6000) });
      if (!response.ok) throw new Error(`FX API returned ${response.status}`);
      const payload = await response.json() as { rates?: { PKR?: number } };
      const rate = payload.rates?.PKR;
      if (!rate || !Number.isFinite(rate)) throw new Error("FX API response has no PKR rate");
      this.database.setCachedFx(rate);
      return rate;
    } catch {
      return cached?.rate ?? FALLBACK_RATE;
    }
  }
}
