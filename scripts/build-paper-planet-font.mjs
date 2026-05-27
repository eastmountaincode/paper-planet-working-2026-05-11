import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import potrace from "potrace";
import sharp from "sharp";
import svg2ttf from "svg2ttf";
import { SVGIcons2SVGFontStream } from "svgicons2svgfont";
import ttf2woff from "ttf2woff";
import ttf2woff2Module from "ttf2woff2";

const trace = promisify(potrace.trace);
const execFileAsync = promisify(execFile);
const ttf2woff2 = ttf2woff2Module.default ?? ttf2woff2Module;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, "..");
const repoDir = path.resolve(appDir, "..");
const sourceDir = path.join(repoDir, "assets", "font_letters");
const generatedDir = path.join(sourceDir, "generated");
const glyphPngDir = path.join(generatedDir, "glyphs");
const tracePngDir = path.join(generatedDir, "trace-png");
const glyphSvgDir = path.join(generatedDir, "svg");
const fontDir = path.join(appDir, "public", "fonts");

const FONT_FAMILY = "Paper Planet Hand";
const FONT_FILE_BASENAME = "paper-planet-hand";
const ALPHA_THRESHOLD = 12;
const CROP_PADDING = 42;
const DEFAULT_LEFT_BEARING = 42;
const DEFAULT_RIGHT_BEARING = 38;
const specimenText = [
  "Paper Planet Records",
  "The quick brown fox jumps over the lazy dog.",
  "Pack my box with five dozen liquor jugs.",
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  "abcdefghijklmnopqrstuvwxyz",
  "1234567890 ! ? . , : ; ' \" ( ) + - = / \\ < > @ # $",
].join("\n");

const nameByChar = {
  " ": "space",
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

const sheets = [
  {
    file: "Font Letters.png",
    rows: [
      { y: 342, glyphs: at([225, 365, 546, 730, 999, 1153], `!"'(),`) },
      { y: 585, glyphs: at([225, 408, 586, 770, 962, 1147], ".:;?AB") },
      { y: 825, glyphs: at([216, 412, 588, 775, 953, 1133, 1328, 1499], "CDEFGHIJ") },
      { y: 1060, glyphs: at([213, 396, 574, 755, 950, 1152, 1327, 1509], "KLMNOPQR") },
      { y: 1306, glyphs: at([214, 405, 586, 773, 959, 1146, 1333, 1506], "STUVWXYZ") },
      { y: 1550, glyphs: at([213, 401, 584, 773, 960, 1139, 1329, 1495], "abcdefgh") },
      { y: 1790, glyphs: at([207, 396, 596, 777, 956, 1138, 1324, 1513], "ijklmnop") },
      { y: 2035, glyphs: at([216, 395, 577, 755, 952, 1132, 1317, 1506, 1685, 1808], "qrstuvwxyz") },
    ],
  },
  {
    file: "Font numbers symbols.png",
    rows: [
      { y: 347, glyphs: at([214, 407, 586, 763, 941, 1134], "123456") },
      { y: 590, glyphs: at([211, 407, 592, 773, 951, 1139], "7890+-") },
      { y: 825, glyphs: at([215, 409, 592, 771, 965, 1143, 1330, 1511], "=/\\<>@#$") },
    ],
  },
];

function at(xs, chars) {
  return [...chars].map((char, index) => ({ char, x: xs[index] }));
}

function getGlyphName(char) {
  return nameByChar[char] ?? char;
}

function getFileStem(char) {
  const name = getGlyphName(char);
  if (/^[a-z]$/.test(char)) return `lower-${char}`;
  if (/^[A-Z]$/.test(char)) return `upper-${char}`;
  if (/^[0-9]$/.test(char)) return `digit-${char}`;
  return `symbol-${name}`;
}

function getBounds(center, previousCenter, nextCenter, min, max) {
  const start = previousCenter == null ? min : Math.floor((previousCenter + center) / 2);
  const end = nextCenter == null ? max : Math.ceil((center + nextCenter) / 2);
  return { start: Math.max(min, start), end: Math.min(max, end) };
}

function findAlphaBox(data, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha <= ALPHA_THRESHOLD) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < 0 || maxY < 0) return null;
  return { minX, minY, maxX, maxY };
}

function makeTraceBitmap(data, width, height) {
  const output = Buffer.alloc(width * height * 4);

  for (let index = 0; index < width * height; index += 1) {
    const alpha = data[index * 4 + 3];
    const isInk = alpha > ALPHA_THRESHOLD;
    const value = isInk ? 0 : 255;
    output[index * 4] = value;
    output[index * 4 + 1] = value;
    output[index * 4 + 2] = value;
    output[index * 4 + 3] = 255;
  }

  return output;
}

async function resetOutputDirs() {
  for (const dir of [generatedDir, fontDir]) {
    await fs.promises.mkdir(dir, { recursive: true });
  }

  for (const dir of [glyphPngDir, tracePngDir, glyphSvgDir]) {
    await fs.promises.rm(dir, { recursive: true, force: true });
    await fs.promises.mkdir(dir, { recursive: true });
  }

  await removeAppleDoubleFiles(fontDir);
}

async function extractGlyphs() {
  const glyphs = [];
  const seenChars = new Set();

  for (const sheet of sheets) {
    const sourcePath = path.join(sourceDir, sheet.file);
    const image = sharp(sourcePath).ensureAlpha();
    const metadata = await image.metadata();
    const { data } = await image.raw().toBuffer({ resolveWithObject: true });

    const rowCenters = sheet.rows.map((row) => row.y);

    for (const [rowIndex, row] of sheet.rows.entries()) {
      const yBounds = getBounds(
        row.y,
        rowCenters[rowIndex - 1],
        rowCenters[rowIndex + 1],
        0,
        metadata.height,
      );
      const xCenters = row.glyphs.map((glyph) => glyph.x);

      for (const [glyphIndex, glyph] of row.glyphs.entries()) {
        if (seenChars.has(glyph.char)) continue;
        seenChars.add(glyph.char);

        const xBounds = getBounds(
          glyph.x,
          xCenters[glyphIndex - 1],
          xCenters[glyphIndex + 1],
          0,
          metadata.width,
        );
        const cellLeft = xBounds.start;
        const cellTop = yBounds.start;
        const cellWidth = xBounds.end - xBounds.start;
        const cellHeight = yBounds.end - yBounds.start;

        const cellRaw = Buffer.alloc(cellWidth * cellHeight * 4);
        for (let y = 0; y < cellHeight; y += 1) {
          const sourceStart = ((cellTop + y) * metadata.width + cellLeft) * 4;
          const targetStart = y * cellWidth * 4;
          data.copy(cellRaw, targetStart, sourceStart, sourceStart + cellWidth * 4);
        }

        const alphaBox = findAlphaBox(cellRaw, cellWidth, cellHeight);
        if (!alphaBox) {
          throw new Error(`No ink found for glyph "${glyph.char}" in ${sheet.file}`);
        }

        const left = Math.max(0, cellLeft + alphaBox.minX - CROP_PADDING);
        const top = Math.max(0, cellTop + alphaBox.minY - CROP_PADDING);
        const right = Math.min(metadata.width, cellLeft + alphaBox.maxX + CROP_PADDING);
        const bottom = Math.min(metadata.height, cellTop + alphaBox.maxY + CROP_PADDING);
        const width = right - left + 1;
        const height = bottom - top + 1;
        const stem = getFileStem(glyph.char);
        const glyphPngPath = path.join(glyphPngDir, `${stem}.png`);
        const tracePngPath = path.join(tracePngDir, `${stem}.png`);

        const crop = sharp(sourcePath)
          .ensureAlpha()
          .extract({ left, top, width, height });
        const { data: cropData, info } = await crop.raw().toBuffer({ resolveWithObject: true });
        await sharp(cropData, {
          raw: { width: info.width, height: info.height, channels: info.channels },
        }).png().toFile(glyphPngPath);

        const traceBitmap = makeTraceBitmap(cropData, info.width, info.height);
        await sharp(traceBitmap, {
          raw: { width: info.width, height: info.height, channels: 4 },
        }).png().toFile(tracePngPath);

        glyphs.push({
          char: glyph.char,
          name: getGlyphName(glyph.char),
          stem,
          pngPath: glyphPngPath,
          tracePngPath,
          svgPath: path.join(glyphSvgDir, `${stem}.svg`),
          width,
          height,
        });
      }
    }
  }

  return glyphs;
}

async function traceGlyphs(glyphs) {
  for (const glyph of glyphs) {
    const svg = await trace(glyph.tracePngPath, {
      background: potrace.Potrace.COLOR_TRANSPARENT,
      color: "#000000",
      threshold: 128,
      turdSize: 2,
      alphaMax: 1,
      optTolerance: 0.2,
    });
    await fs.promises.writeFile(glyph.svgPath, normalizeSvgForFont(svg));
  }
}

function normalizeSvgForFont(svg) {
  const pathMatch = svg.match(/<path\b([^>]*)\bd="([^"]+)"([^>]*)\/>/);
  if (!pathMatch) return svg;

  const normalizedPath = normalizePathWinding(pathMatch[2]);
  return svg.replace(pathMatch[0], `<path${pathMatch[1]}d="${normalizedPath}"${pathMatch[3]}/>`);
}

function normalizePathWinding(pathData) {
  const contours = parseContours(pathData);
  if (contours.length < 2) return pathData;

  const sampledContours = contours.map((contour) => ({
    ...contour,
    samples: sampleContour(contour),
  }));
  const topLevel = sampledContours.find((contour) => contour.area !== 0);
  if (!topLevel) return pathData;

  const topLevelSign = Math.sign(topLevel.area);
  const normalizedContours = sampledContours.map((contour, index) => {
    const depth = sampledContours.reduce((count, other, otherIndex) => {
      if (index === otherIndex) return count;
      return isBoxInside(contour.box, other.box) ? count + 1 : count;
    }, 0);
    const targetSign = depth % 2 === 0 ? topLevelSign : -topLevelSign;
    const shouldReverse = contour.area !== 0 && Math.sign(contour.area) !== targetSign;
    return shouldReverse ? reverseContour(contour) : contour;
  });

  return normalizedContours.map(contourToPath).join(" ");
}

function parseContours(pathData) {
  const tokens = pathData.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?/g) ?? [];
  const contours = [];
  let index = 0;
  let command = null;
  let contour = null;
  let current = null;

  const isCommand = (token) => /^[a-zA-Z]$/.test(token);
  const nextNumber = () => Number(tokens[index++]);
  const hasNumber = () => index < tokens.length && !isCommand(tokens[index]);
  const ensureContour = (point) => {
    if (contour) contours.push(finalizeContour(contour));
    contour = { start: point, segments: [] };
    current = point;
  };

  while (index < tokens.length) {
    if (isCommand(tokens[index])) {
      command = tokens[index++];
    }

    if (!command) break;

    switch (command) {
      case "M": {
        const firstPoint = { x: nextNumber(), y: nextNumber() };
        ensureContour(firstPoint);
        command = "L";
        while (hasNumber()) {
          const to = { x: nextNumber(), y: nextNumber() };
          contour.segments.push({ type: "L", from: current, to });
          current = to;
        }
        break;
      }
      case "L": {
        while (hasNumber()) {
          const to = { x: nextNumber(), y: nextNumber() };
          contour.segments.push({ type: "L", from: current, to });
          current = to;
        }
        break;
      }
      case "H": {
        while (hasNumber()) {
          const to = { x: nextNumber(), y: current.y };
          contour.segments.push({ type: "L", from: current, to });
          current = to;
        }
        break;
      }
      case "V": {
        while (hasNumber()) {
          const to = { x: current.x, y: nextNumber() };
          contour.segments.push({ type: "L", from: current, to });
          current = to;
        }
        break;
      }
      case "C": {
        while (hasNumber()) {
          const c1 = { x: nextNumber(), y: nextNumber() };
          const c2 = { x: nextNumber(), y: nextNumber() };
          const to = { x: nextNumber(), y: nextNumber() };
          contour.segments.push({ type: "C", from: current, c1, c2, to });
          current = to;
        }
        break;
      }
      case "Q": {
        while (hasNumber()) {
          const c = { x: nextNumber(), y: nextNumber() };
          const to = { x: nextNumber(), y: nextNumber() };
          contour.segments.push({ type: "Q", from: current, c, to });
          current = to;
        }
        break;
      }
      case "Z":
      case "z": {
        if (contour && !samePoint(current, contour.start)) {
          contour.segments.push({ type: "L", from: current, to: contour.start });
          current = contour.start;
        }
        command = null;
        break;
      }
      default:
        throw new Error(`Unsupported SVG path command "${command}" in traced font glyph.`);
    }
  }

  if (contour) contours.push(finalizeContour(contour));
  return contours;
}

function finalizeContour(contour) {
  const samples = sampleContour(contour);
  const area = polygonArea(samples);
  const xs = samples.map((point) => point.x);
  const ys = samples.map((point) => point.y);
  const box = {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
  return {
    ...contour,
    area,
    box,
    center: {
      x: (box.minX + box.maxX) / 2,
      y: (box.minY + box.maxY) / 2,
    },
  };
}

function sampleContour(contour) {
  const points = [contour.start];

  for (const segment of contour.segments) {
    if (segment.type === "L") {
      points.push(segment.to);
    } else if (segment.type === "C") {
      for (let step = 1; step <= 12; step += 1) {
        points.push(cubicPoint(segment.from, segment.c1, segment.c2, segment.to, step / 12));
      }
    } else if (segment.type === "Q") {
      for (let step = 1; step <= 12; step += 1) {
        points.push(quadraticPoint(segment.from, segment.c, segment.to, step / 12));
      }
    }
  }

  return points;
}

function cubicPoint(from, c1, c2, to, t) {
  const mt = 1 - t;
  return {
    x: mt ** 3 * from.x + 3 * mt ** 2 * t * c1.x + 3 * mt * t ** 2 * c2.x + t ** 3 * to.x,
    y: mt ** 3 * from.y + 3 * mt ** 2 * t * c1.y + 3 * mt * t ** 2 * c2.y + t ** 3 * to.y,
  };
}

function quadraticPoint(from, c, to, t) {
  const mt = 1 - t;
  return {
    x: mt ** 2 * from.x + 2 * mt * t * c.x + t ** 2 * to.x,
    y: mt ** 2 * from.y + 2 * mt * t * c.y + t ** 2 * to.y,
  };
}

function polygonArea(points) {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2;
}

function isBoxInside(inner, outer) {
  const tolerance = 0.5;
  return (
    inner.minX >= outer.minX - tolerance &&
    inner.maxX <= outer.maxX + tolerance &&
    inner.minY >= outer.minY - tolerance &&
    inner.maxY <= outer.maxY + tolerance &&
    (inner.minX > outer.minX + tolerance ||
      inner.maxX < outer.maxX - tolerance ||
      inner.minY > outer.minY + tolerance ||
      inner.maxY < outer.maxY - tolerance)
  );
}

function reverseContour(contour) {
  const reversedSegments = contour.segments
    .map((segment) => {
      if (segment.type === "L") {
        return { type: "L", from: segment.to, to: segment.from };
      }
      if (segment.type === "C") {
        return { type: "C", from: segment.to, c1: segment.c2, c2: segment.c1, to: segment.from };
      }
      return { type: "Q", from: segment.to, c: segment.c, to: segment.from };
    })
    .reverse();

  const reversed = {
    start: reversedSegments[0]?.from ?? contour.start,
    segments: reversedSegments,
  };

  return finalizeContour(reversed);
}

function contourToPath(contour) {
  const pieces = [`M ${formatNumber(contour.start.x)} ${formatNumber(contour.start.y)}`];
  for (const segment of contour.segments) {
    if (segment.type === "L") {
      pieces.push(`L ${formatNumber(segment.to.x)} ${formatNumber(segment.to.y)}`);
    } else if (segment.type === "C") {
      pieces.push(
        `C ${formatNumber(segment.c1.x)} ${formatNumber(segment.c1.y)} ${formatNumber(segment.c2.x)} ${formatNumber(segment.c2.y)} ${formatNumber(segment.to.x)} ${formatNumber(segment.to.y)}`,
      );
    } else if (segment.type === "Q") {
      pieces.push(
        `Q ${formatNumber(segment.c.x)} ${formatNumber(segment.c.y)} ${formatNumber(segment.to.x)} ${formatNumber(segment.to.y)}`,
      );
    }
  }
  pieces.push("Z");
  return pieces.join(" ");
}

function formatNumber(value) {
  return Number(value.toFixed(3)).toString();
}

function samePoint(first, second) {
  return Math.abs(first.x - second.x) < 0.001 && Math.abs(first.y - second.y) < 0.001;
}

async function buildSvgFont(glyphs) {
  const svgFontPath = path.join(generatedDir, `${FONT_FILE_BASENAME}.svg`);
  const fontStream = new SVGIcons2SVGFontStream({
    fontName: FONT_FILE_BASENAME,
    fontHeight: 1000,
    normalize: true,
    centerHorizontally: true,
    fixedWidth: false,
    descent: 150,
    metadata: "Generated from Paper Planet hand-drawn PNG glyph sheets.",
  });

  const chunks = [];
  fontStream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));

  const fontDone = new Promise((resolve, reject) => {
    fontStream.on("finish", resolve);
    fontStream.on("error", reject);
  });

  for (const glyph of glyphs) {
    const stream = fs.createReadStream(glyph.svgPath);
    stream.metadata = {
      unicode: [glyph.char],
      name: glyph.name,
    };
    fontStream.write(stream);
  }

  fontStream.end();
  await fontDone;

  let svgFont = Buffer.concat(chunks).toString("utf8");
  svgFont = tuneSvgFontMetrics(svgFont);
  svgFont = svgFont.replace(
    "</font>",
    '<glyph glyph-name="space" unicode=" " horiz-adv-x="250" d="" />\n</font>',
  );
  await fs.promises.writeFile(svgFontPath, svgFont);

  return svgFontPath;
}

function tuneSvgFontMetrics(svgFont) {
  return svgFont.replace(
    /<glyph glyph-name="([^"]+)"\s+unicode="([^"]+)"\s+horiz-adv-x="([^"]+)" d="([^"]*)" \/>/g,
    (tag, glyphName, unicode, _advanceWidth, pathData) => {
      if (!pathData) return tag;

      const contours = parseContours(pathData);
      const glyphBox = getContoursBox(contours);
      if (!glyphBox) return tag;

      const metrics = getGlyphMetrics(glyphName);
      const scaledWidth = (glyphBox.maxX - glyphBox.minX) * metrics.scale;
      const advanceWidth = Math.max(
        metrics.minAdvance,
        Math.round(metrics.left + scaledWidth + metrics.right),
      );
      const transformed = contours.map((contour) =>
        transformContour(contour, (point) => ({
          x: metrics.left + (point.x - glyphBox.minX) * metrics.scale,
          y: glyphBox.minY + (point.y - glyphBox.minY) * metrics.scale + metrics.yOffset,
        })),
      );

      return `<glyph glyph-name="${glyphName}"\n      unicode="${unicode}"\n      horiz-adv-x="${advanceWidth}" d="${transformed.map(contourToPath).join(" ")}" />`;
    },
  );
}

function getGlyphMetrics(glyphName) {
  if (glyphName === "apostrophe") {
    return {
      left: 28,
      right: 34,
      scale: 0.46,
      yOffset: 300,
      minAdvance: 120,
    };
  }

  if (glyphName === "quote") {
    return {
      left: 28,
      right: 36,
      scale: 0.52,
      yOffset: 275,
      minAdvance: 185,
    };
  }

  if (glyphName === "period") {
    return {
      left: 34,
      right: 40,
      scale: 0.42,
      yOffset: -85,
      minAdvance: 125,
    };
  }

  if (glyphName === "comma") {
    return {
      left: 34,
      right: 40,
      scale: 0.48,
      yOffset: -80,
      minAdvance: 130,
    };
  }

  if (["colon", "semicolon"].includes(glyphName)) {
    return {
      left: 34,
      right: 30,
      scale: 0.68,
      yOffset: -40,
      minAdvance: 150,
    };
  }

  if (
    [
      "exclamation",
      "paren-left",
      "paren-right",
      "hyphen",
      "slash",
      "backslash",
    ].includes(glyphName)
  ) {
    return {
      left: 32,
      right: 30,
      scale: 1,
      yOffset: 0,
      minAdvance: 140,
    };
  }

  return {
    left: DEFAULT_LEFT_BEARING,
    right: DEFAULT_RIGHT_BEARING,
    scale: 1,
    yOffset: 0,
    minAdvance: 175,
  };
}

function getContoursBox(contours) {
  const samples = contours.flatMap((contour) => sampleContour(contour));
  if (!samples.length) return null;

  return {
    minX: Math.min(...samples.map((point) => point.x)),
    maxX: Math.max(...samples.map((point) => point.x)),
    minY: Math.min(...samples.map((point) => point.y)),
    maxY: Math.max(...samples.map((point) => point.y)),
  };
}

function transformContour(contour, transform) {
  const transformed = {
    start: transform(contour.start),
    segments: contour.segments.map((segment) => {
      if (segment.type === "L") {
        return {
          type: "L",
          from: transform(segment.from),
          to: transform(segment.to),
        };
      }
      if (segment.type === "C") {
        return {
          type: "C",
          from: transform(segment.from),
          c1: transform(segment.c1),
          c2: transform(segment.c2),
          to: transform(segment.to),
        };
      }
      return {
        type: "Q",
        from: transform(segment.from),
        c: transform(segment.c),
        to: transform(segment.to),
      };
    }),
  };

  return finalizeContour(transformed);
}

async function buildWebFonts(svgFontPath) {
  const svgFont = await fs.promises.readFile(svgFontPath, "utf8");
  const ttf = Buffer.from(svg2ttf(svgFont, {}).buffer);
  const woff = Buffer.from(ttf2woff(new Uint8Array(ttf)).buffer);
  const woff2 = Buffer.from(ttf2woff2(new Uint8Array(ttf)));

  const targets = [
    [path.join(fontDir, `${FONT_FILE_BASENAME}.ttf`), ttf],
    [path.join(fontDir, `${FONT_FILE_BASENAME}.woff`), woff],
    [path.join(fontDir, `${FONT_FILE_BASENAME}.woff2`), woff2],
    [path.join(fontDir, `${FONT_FILE_BASENAME}.svg`), Buffer.from(svgFont)],
  ];

  for (const [target, buffer] of targets) {
    await fs.promises.writeFile(target, buffer);
  }
}

async function removeAppleDoubleFiles(dir) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });

  await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(dir, entry.name);
      if (entry.name.startsWith("._")) {
        await fs.promises.rm(entryPath, { recursive: true, force: true });
        return;
      }
      if (entry.isDirectory()) {
        await removeAppleDoubleFiles(entryPath);
      }
    }),
  );
}

async function writePreview(glyphs) {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${FONT_FAMILY} Preview</title>
  <style>
    @font-face {
      font-family: "${FONT_FAMILY}";
      src: url("../../app/public/fonts/${FONT_FILE_BASENAME}.woff2") format("woff2"),
        url("../../app/public/fonts/${FONT_FILE_BASENAME}.woff") format("woff");
    }
    body {
      margin: 32px;
      background: #fff;
      color: #000;
      font-family: ui-sans-serif, system-ui, sans-serif;
    }
    textarea {
      box-sizing: border-box;
      width: min(100%, 1100px);
      min-height: 360px;
      padding: 24px;
      border: 1px solid #000;
      color: #000;
      font-family: "${FONT_FAMILY}", ui-sans-serif, system-ui, sans-serif;
      font-size: 64px;
      line-height: 1.35;
    }
    p {
      max-width: 760px;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <h1>${FONT_FAMILY}</h1>
  <p>Generated ${glyphs.length} glyphs from <code>assets/font_letters</code>. Edit this text to check spacing and missing characters.</p>
  <textarea>${specimenText}</textarea>
</body>
</html>
`;

  await fs.promises.writeFile(path.join(generatedDir, "preview.html"), html);
}

async function writeSamplePng() {
  const ttfPath = path.join(fontDir, `${FONT_FILE_BASENAME}.ttf`);
  const samplePath = path.join(generatedDir, "sample.png");

  try {
    await execFileAsync("magick", [
      "-background",
      "white",
      "-fill",
      "black",
      "-font",
      ttfPath,
      "-pointsize",
      "58",
      "-size",
      "1800x980",
      "-gravity",
      "center",
      `caption:${specimenText}`,
      samplePath,
    ]);
  } catch (error) {
    console.warn(`Skipped sample PNG render: ${error.message}`);
  }
}

async function main() {
  await resetOutputDirs();
  const glyphs = await extractGlyphs();
  await traceGlyphs(glyphs);
  const svgFontPath = await buildSvgFont(glyphs);
  await buildWebFonts(svgFontPath);
  await writePreview(glyphs);
  await writeSamplePng();
  await removeAppleDoubleFiles(generatedDir);
  await removeAppleDoubleFiles(fontDir);

  const relativeFontDir = path.relative(repoDir, fontDir);
  const relativeGeneratedDir = path.relative(repoDir, generatedDir);
  process.stdout.write(
    [
      `Built ${FONT_FAMILY} with ${glyphs.length} glyphs.`,
      `Fonts: ${relativeFontDir}/${FONT_FILE_BASENAME}.{woff2,woff,ttf,svg}`,
      `Intermediate crops/SVGs: ${relativeGeneratedDir}`,
      "",
    ].join("\n"),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
