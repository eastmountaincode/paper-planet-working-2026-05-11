export const FONT_GLYPH_METRICS_VERSION = 1;

export type FontGlyphMetricAdjustment = {
  xOffset: number;
  yOffset: number;
  scale: number;
  advanceOffset: number;
};

export type FontGlyphDefinition = {
  char: string;
  fileStem: string;
  label: string;
  name: string;
};

export type FontGlyphMetricsManifest = {
  version: typeof FONT_GLYPH_METRICS_VERSION;
  updatedAt: string;
  glyphs: Record<string, FontGlyphMetricAdjustment>;
};

const glyphCharacters = `!"'(),.:;?ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890+-=/\\<>@#$`;

const glyphNameByChar: Record<string, string> = {
  "!": "exclamation",
  '"': "quote",
  "'": "apostrophe",
  "(": "paren-left",
  ")": "paren-right",
  ",": "comma",
  ".": "period",
  ":": "colon",
  ";": "semicolon",
  "?": "question",
  "+": "plus",
  "-": "hyphen",
  "=": "equals",
  "/": "slash",
  "\\": "backslash",
  "<": "less-than",
  ">": "greater-than",
  "@": "at",
  "#": "hash",
  "$": "dollar",
};

export const defaultFontGlyphMetricAdjustment: FontGlyphMetricAdjustment = {
  xOffset: 0,
  yOffset: 0,
  scale: 1,
  advanceOffset: 0,
};

export const fontGlyphDefinitions: FontGlyphDefinition[] = Array.from(
  glyphCharacters,
).map((char) => ({
  char,
  fileStem: getFontGlyphFileStem(char),
  label: getFontGlyphLabel(char),
  name: glyphNameByChar[char] ?? char,
}));

const fontGlyphNames = new Set(fontGlyphDefinitions.map((glyph) => glyph.name));

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNumber(value: unknown, defaultValue: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : defaultValue;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getFontGlyphLabel(char: string) {
  if (char === '"') {
    return "quote";
  }

  if (char === "'") {
    return "apostrophe";
  }

  if (char === "\\") {
    return "backslash";
  }

  return char;
}

function getFontGlyphFileStem(char: string) {
  const name = glyphNameByChar[char] ?? char;

  if (/^[a-z]$/.test(char)) {
    return `lower-${char}`;
  }

  if (/^[A-Z]$/.test(char)) {
    return `upper-${char}`;
  }

  if (/^[0-9]$/.test(char)) {
    return `digit-${char}`;
  }

  return `symbol-${name}`;
}

export function normalizeFontGlyphMetricAdjustment(
  value: unknown,
): FontGlyphMetricAdjustment {
  const record = isRecord(value) ? value : {};

  return {
    xOffset: Math.round(
      clamp(asNumber(record.xOffset, defaultFontGlyphMetricAdjustment.xOffset), -320, 320),
    ),
    yOffset: Math.round(
      clamp(asNumber(record.yOffset, defaultFontGlyphMetricAdjustment.yOffset), -420, 420),
    ),
    scale: Number(
      clamp(asNumber(record.scale, defaultFontGlyphMetricAdjustment.scale), 0.2, 2.4).toFixed(3),
    ),
    advanceOffset: Math.round(
      clamp(
        asNumber(
          record.advanceOffset,
          defaultFontGlyphMetricAdjustment.advanceOffset,
        ),
        -320,
        420,
      ),
    ),
  };
}

function hasNonDefaultMetric(metric: FontGlyphMetricAdjustment) {
  return (
    metric.xOffset !== defaultFontGlyphMetricAdjustment.xOffset ||
    metric.yOffset !== defaultFontGlyphMetricAdjustment.yOffset ||
    metric.scale !== defaultFontGlyphMetricAdjustment.scale ||
    metric.advanceOffset !== defaultFontGlyphMetricAdjustment.advanceOffset
  );
}

export function normalizeFontGlyphMetricsManifest(
  value: unknown,
): FontGlyphMetricsManifest {
  const record = isRecord(value) ? value : {};
  const inputGlyphs = isRecord(record.glyphs) ? record.glyphs : {};
  const glyphs: Record<string, FontGlyphMetricAdjustment> = {};

  for (const [name, metricValue] of Object.entries(inputGlyphs)) {
    if (!fontGlyphNames.has(name)) {
      continue;
    }

    const metric = normalizeFontGlyphMetricAdjustment(metricValue);

    if (hasNonDefaultMetric(metric)) {
      glyphs[name] = metric;
    }
  }

  return {
    version: FONT_GLYPH_METRICS_VERSION,
    updatedAt:
      typeof record.updatedAt === "string"
        ? record.updatedAt
        : new Date(0).toISOString(),
    glyphs,
  };
}
