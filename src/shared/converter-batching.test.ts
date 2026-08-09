import { expect, test } from "bun:test";
import { converterBatchSize, MAX_CONVERTER_QUEUE_ITEMS, splitConverterBatches } from "./converter-batching";

test("converter splits a thousand images into bounded PC-aware batches", () => {
  const items = Array.from({ length: MAX_CONVERTER_QUEUE_ITEMS }, (_, index) => index + 1);
  const batches = splitConverterBatches(items, converterBatchSize(4));
  expect(batches.flat()).toEqual(items);
  expect(batches.every((batch) => batch.length <= 24)).toBe(true);
  expect(batches).toHaveLength(42);
});

test("converter never makes a renderer batch larger than one hundred images", () => {
  expect(converterBatchSize(32)).toBe(100);
  expect(splitConverterBatches(Array.from({ length: 201 }), 999).map((batch) => batch.length)).toEqual([100, 100, 1]);
});
