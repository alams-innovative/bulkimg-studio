export const MAX_CONVERTER_QUEUE_ITEMS = 1_000;
export const MAX_CONVERTER_BATCH_ITEMS = 100;

/**
 * Keep each renderer request modest on lower-powered Windows PCs while still
 * using larger chunks on machines that can comfortably hold more source data.
 */
export function converterBatchSize(hardwareConcurrency: number | undefined): number {
  const cores = Number.isFinite(hardwareConcurrency) ? Math.max(1, Math.floor(hardwareConcurrency!)) : 4;
  if (cores <= 4) return 24;
  if (cores <= 8) return 48;
  return MAX_CONVERTER_BATCH_ITEMS;
}

export function splitConverterBatches<T>(items: readonly T[], batchSize: number): T[][] {
  const size = Math.max(1, Math.min(MAX_CONVERTER_BATCH_ITEMS, Math.floor(batchSize) || 1));
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) batches.push([...items.slice(index, index + size)]);
  return batches;
}
