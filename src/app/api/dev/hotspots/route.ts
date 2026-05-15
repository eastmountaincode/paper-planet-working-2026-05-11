import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import type { Hotspot, SceneSlug } from "@/lib/scenes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const hotspotFilePath = path.join(process.cwd(), "src/lib/scene-hotspots.json");
const validSceneSlugs = new Set<SceneSlug>(["construction", "hq"]);

type SaveHotspotsBody = {
  scene: SceneSlug;
  hotspots: Hotspot[];
};

function isSaveHotspotsBody(body: unknown): body is SaveHotspotsBody {
  if (!body || typeof body !== "object") {
    return false;
  }

  const candidate = body as Partial<SaveHotspotsBody>;
  return (
    typeof candidate.scene === "string" &&
    validSceneSlugs.has(candidate.scene as SceneSlug) &&
    Array.isArray(candidate.hotspots)
  );
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Hotspot file saves are disabled in production." },
      { status: 403 },
    );
  }

  const body = (await request.json()) as unknown;

  if (!isSaveHotspotsBody(body)) {
    return NextResponse.json(
      { error: "Expected { scene, hotspots }." },
      { status: 400 },
    );
  }

  const current = JSON.parse(
    await fs.readFile(hotspotFilePath, "utf8"),
  ) as Record<SceneSlug, Hotspot[]>;

  const next: Record<SceneSlug, Hotspot[]> = {
    ...current,
    [body.scene]: body.hotspots,
  };

  await fs.writeFile(hotspotFilePath, `${JSON.stringify(next, null, 2)}\n`);

  return NextResponse.json({
    ok: true,
    scene: body.scene,
    count: body.hotspots.length,
  });
}
