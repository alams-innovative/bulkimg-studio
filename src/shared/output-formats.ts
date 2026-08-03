export type OutputFormatId = "square" | "portrait" | "landscape" | "story";

export type OutputFormatDefinition = {
  id: OutputFormatId;
  label: string;
  ratio: string;
  size: `${number}x${number}`;
};

export const OUTPUT_FORMATS: Record<OutputFormatId, OutputFormatDefinition> = {
  square: { id: "square", label: "Square", ratio: "1:1", size: "1024x1024" },
  portrait: { id: "portrait", label: "Portrait", ratio: "4:5", size: "1024x1280" },
  landscape: { id: "landscape", label: "Landscape", ratio: "16:9", size: "1536x864" },
  story: { id: "story", label: "Story", ratio: "9:16", size: "864x1536" },
};

export function isOutputFormatId(value: unknown): value is OutputFormatId {
  return typeof value === "string" && Object.hasOwn(OUTPUT_FORMATS, value);
}

export function outputSize(format: OutputFormatId): OutputFormatDefinition["size"] {
  return OUTPUT_FORMATS[format].size;
}

export function legacySizeToFormat(size: string | null | undefined): OutputFormatId {
  switch (size) {
    case "1024x1280": return "portrait";
    case "1536x864": return "landscape";
    case "864x1536": return "story";
    case "1024x1536": return "portrait";
    case "1536x1024": return "landscape";
    default: return "square";
  }
}
