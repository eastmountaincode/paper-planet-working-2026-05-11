import { promises as fs } from "node:fs";
import path from "node:path";
import {
  adminUnauthorizedResponse,
  isAdminAuthenticated,
} from "@/lib/admin/auth";
import {
  normalizeFontGlyphMetricsManifest,
  type FontGlyphMetricsManifest,
} from "@/lib/font-glyph-metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fontMetricsPath = path.join(
  process.cwd(),
  "..",
  "assets",
  "font_letters",
  "glyph-metrics.json",
);

async function readFontMetricsManifest() {
  const text = await fs.readFile(fontMetricsPath, "utf8");

  return normalizeFontGlyphMetricsManifest(JSON.parse(text));
}

async function writeFontMetricsManifest(manifest: FontGlyphMetricsManifest) {
  await fs.writeFile(fontMetricsPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return manifest;
}

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return adminUnauthorizedResponse();
  }

  const manifest = await readFontMetricsManifest();

  return Response.json(
    { manifest },
    {
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}

export async function PUT(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return adminUnauthorizedResponse();
  }

  const body = await request.json().catch(() => null);
  const manifest = normalizeFontGlyphMetricsManifest(body);
  const savedManifest = await writeFontMetricsManifest({
    ...manifest,
    updatedAt: new Date().toISOString(),
  });

  return Response.json({ manifest: savedManifest });
}
