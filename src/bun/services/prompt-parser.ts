import Papa from "papaparse";
import type { PromptCell, PromptMatrix } from "../../shared/contracts";

const METADATA_COLUMN = /^(week(?:\s*#)?|date|schedule(?:d)?\s*date|day|notes?)$/i;
const DISABLED_PROMPT = /^(?:no\s+image\b|n\/a\b|none\b)|outside\s+period/i;

function clean(value: unknown): string {
  return String(value ?? "").replace(/\u00a0/g, " ").trim();
}

function cellId(row: number, column: number): string {
  return `cell-${row + 1}-${column + 1}`;
}

export function parseCSV(csvText: string, sourceName: string): PromptMatrix {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => clean(header),
  });
  const fields = result.meta.fields?.filter(Boolean) ?? [];
  const promptColumns = fields.filter((field) => !METADATA_COLUMN.test(field));
  const warnings = result.errors.map((error) => `Row ${error.row ?? "?"}: ${error.message}`);
  if (promptColumns.length === 0) warnings.push("No prompt columns were detected.");

  const cells: PromptCell[] = [];
  result.data.forEach((row, rowIndex) => {
    const weekField = fields.find((field) => /^week(?:\s*#)?$/i.test(field));
    const dateField = fields.find((field) => /^(?:date|schedule(?:d)?\s*date)$/i.test(field));
    promptColumns.forEach((column, columnIndex) => {
      const promptText = clean(row[column]);
      if (!promptText) return;
      const disabled = DISABLED_PROMPT.test(promptText);
      cells.push({
        id: cellId(rowIndex, columnIndex),
        week: clean(weekField ? row[weekField] : String(rowIndex + 1)),
        scheduleDate: clean(dateField ? row[dateField] : column.split("|")[0]),
        themeColumn: column,
        promptText,
        disabled,
        ...(disabled ? { disabledReason: "Non-prompt schedule cell" } : {}),
      });
    });
  });

  return { sourceName, columns: promptColumns, cells, warnings };
}

export function parseManualPrompts(text: string): PromptMatrix {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  const blocks = normalized.includes("\n\n")
    ? normalized.split(/\n\s*\n/)
    : normalized.split("\n");
  const prompts = blocks.map(clean).filter(Boolean);
  return {
    sourceName: "Manual prompt pad",
    columns: ["Manual"],
    cells: prompts.map((promptText, index) => ({
      id: cellId(index, 0),
      week: "Manual",
      scheduleDate: "",
      themeColumn: "Manual",
      promptText,
      disabled: DISABLED_PROMPT.test(promptText),
      ...(DISABLED_PROMPT.test(promptText) ? { disabledReason: "Non-prompt entry" } : {}),
    })),
    warnings: prompts.length === 0 ? ["No prompts were found."] : [],
  };
}
