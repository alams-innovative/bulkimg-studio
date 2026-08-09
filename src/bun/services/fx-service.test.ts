import { describe, expect, test } from "bun:test";
import type { AppDatabase } from "../database";
import { FX_CACHE_TTL_SECONDS, FxService } from "./fx-service";

describe("FX service", () => {
  test("rechecks the USD to PKR provider after fifteen minutes", async () => {
    let cacheAgeSeconds = FX_CACHE_TTL_SECONDS - 1;
    let fetched = 0;
    const database = {
      getCachedFx: () => ({ rate: 280, ageSeconds: cacheAgeSeconds }),
      setCachedFx: () => undefined,
    } as unknown as AppDatabase;
    const originalFetch = globalThis.fetch;
    const fetchMock = Object.assign(async () => {
      fetched += 1;
      return new Response(JSON.stringify({ rate: 281 }), { status: 200 });
    }, { preconnect: originalFetch.preconnect }) as typeof fetch;
    globalThis.fetch = fetchMock;

    try {
      const service = new FxService(database);
      expect(await service.getUsdPkrRate()).toBe(280);
      expect(fetched).toBe(0);

      cacheAgeSeconds = FX_CACHE_TTL_SECONDS;
      expect(await service.getUsdPkrRate()).toBe(281);
      expect(fetched).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
