import { promises as fs } from "node:fs";
import path from "node:path";
import {
  adminUnauthorizedResponse,
  isAdminAuthenticated,
} from "@/lib/admin/auth";
import { fontGlyphDefinitions } from "@/lib/font-glyph-metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const glyphPngDir = path.join(
  process.cwd(),
  "..",
  "assets",
  "font_letters",
  "generated",
  "glyphs",
);

const allowedGlyphStems = new Set(
  fontGlyphDefinitions.map((glyph) => glyph.fileStem),
);

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return adminUnauthorizedResponse();
  }

  const url = new URL(request.url);
  const stem = url.searchParams.get("stem");

  if (!stem || !allowedGlyphStems.has(stem)) {
    return new Response("Unknown glyph.", { status: 404 });
  }

  const glyph = await fs.readFile(path.join(glyphPngDir, `${stem}.png`));

  return new Response(glyph, {
    headers: {
      "cache-control": "no-store",
      "content-type": "image/png",
    },
  });
}
