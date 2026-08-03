import Papa from "papaparse";
import type { PromptCell, PromptGroup, PromptMatrix } from "../../shared/contracts";

const WEEK_COLUMN = /^week(?:\s*#)?$/i;
const WEEK_START_COLUMN = /^week\s*start\s*date$/i;
const DATE_COLUMN = /^(?:date|schedule(?:d)?\s*date)$/i;
const METADATA_COLUMN = /^(week(?:\s*#)?|week\s*start\s*date|date|schedule(?:d)?\s*date|day|notes?)$/i;
const DISABLED_PROMPT = /^(?:no\s+image\b|n\/a\b|none\b)|outside\s+period/i;
const PROMPT_DATE = /^(\d{1,2}\s+[a-z]{3,9}\s+\d{4})\s*(?:\u2014|-)/i;
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS = new Map(MONTH_NAMES.map((month, index) => [month.toLowerCase(), index]));
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function clean(value: unknown): string {
  return String(value ?? "").replace(/\u00a0/g, " ").trim();
}

function cellId(row: number, column: number): string {
  return `cell-${row + 1}-${column + 1}`;
}

function splitDayTheme(column: string): { dayLabel: string; themeLabel: string } {
  const [day, ...theme] = column.split("|").map(clean);
  return { dayLabel: day || column, themeLabel: theme.join(" | ") || column };
}

function parseDate(value: string): Date | null {
  const match = /^(\d{1,2})\s+([a-z]{3,9})\s+(\d{4})$/i.exec(clean(value));
  if (!match) return null;
  const month = MONTHS.get(match[2]!.slice(0, 3).toLowerCase());
  if (month === undefined) return null;
  const day = Number(match[1]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) return null;
  return date;
}

function formatDate(date: Date): string {
  return `${String(date.getUTCDate()).padStart(2, "0")} ${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function resolveScheduleDate(promptText: string, weekStartDate: string, dayLabel: string): string {
  const promptDate = PROMPT_DATE.exec(promptText)?.[1];
  const parsedPromptDate = promptDate ? parseDate(promptDate) : null;
  if (parsedPromptDate) return formatDate(parsedPromptDate);

  const start = parseDate(weekStartDate);
  const targetDay = WEEKDAYS.findIndex((day) => day.toLowerCase() === dayLabel.toLowerCase());
  if (!start || targetDay < 0) return weekStartDate;
  const offset = (targetDay - start.getUTCDay() + 7) % 7;
  start.setUTCDate(start.getUTCDate() + offset);
  return formatDate(start);
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
  const groups: PromptGroup[] = [];
  result.data.forEach((row, rowIndex) => {
    const weekField = fields.find((field) => WEEK_COLUMN.test(field));
    const weekStartField = fields.find((field) => WEEK_START_COLUMN.test(field));
    const dateField = fields.find((field) => DATE_COLUMN.test(field));
    const week = clean(weekField ? row[weekField] : String(rowIndex + 1));
    const weekStartDate = clean(weekStartField ? row[weekStartField] : dateField ? row[dateField] : "");
    const groupCellIds: string[] = [];

    promptColumns.forEach((column, columnIndex) => {
      const promptText = clean(row[column]);
      if (!promptText) return;
      const disabled = DISABLED_PROMPT.test(promptText);
      const id = cellId(rowIndex, columnIndex);
      const { dayLabel, themeLabel } = splitDayTheme(column);
      groupCellIds.push(id);
      cells.push({
        id,
        week,
        weekStartDate,
        dayLabel,
        scheduleDate: resolveScheduleDate(promptText, weekStartDate, dayLabel),
        themeColumn: themeLabel,
        promptText,
        disabled,
        ...(disabled ? { disabledReason: "Outside the approved planning period" } : {}),
      });
    });

    if (groupCellIds.length) {
      groups.push({
        id: `week-${rowIndex + 1}`,
        label: week || `Week ${rowIndex + 1}`,
        startDate: weekStartDate,
        cellIds: groupCellIds,
      });
    }
  });

  return { sourceName, columns: promptColumns, cells, groups, warnings };
}

export function parseManualPrompts(text: string): PromptMatrix {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  const blocks = normalized.includes("\n\n")
    ? normalized.split(/\n\s*\n/)
    : normalized.split("\n");
  const prompts = blocks.map(clean).filter(Boolean);
  const cells: PromptCell[] = prompts.map((promptText, index) => ({
    id: cellId(index, 0),
    week: "Manual",
    weekStartDate: "",
    dayLabel: "Manual",
    scheduleDate: "",
    themeColumn: "Manual",
    promptText,
    disabled: DISABLED_PROMPT.test(promptText),
    ...(DISABLED_PROMPT.test(promptText) ? { disabledReason: "Non-prompt entry" } : {}),
  }));
  return {
    sourceName: "Manual prompt pad",
    columns: ["Manual"],
    cells,
    groups: cells.length ? [{ id: "manual", label: "Manual prompts", startDate: "", cellIds: cells.map((cell) => cell.id) }] : [],
    warnings: prompts.length === 0 ? ["No prompts were found."] : [],
  };
}
