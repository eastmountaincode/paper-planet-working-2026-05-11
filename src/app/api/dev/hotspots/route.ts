import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import type { Hotspot, SceneSlug } from "@/lib/scenes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sceneHotspotFilePath = path.join(
  process.cwd(),
  "src/lib/scene-hotspots.json",
);
const enterHotspotFilePath = path.join(
  process.cwd(),
  "src/lib/enter-hotspots.json",
);
const validSceneSlugs = new Set<SceneSlug>(["construction", "hq"]);
const validTargets = new Set(["construction", "hq", "enter"]);

type HotspotTarget = SceneSlug | "enter";

type SaveHotspotsBody = {
  scene?: SceneSlug;
  target?: HotspotTarget;
  hotspots: Hotspot[];
};

function isSaveHotspotsBody(body: unknown): body is SaveHotspotsBody {
  if (!body || typeof body !== "object") {
    return false;
  }

  const candidate = body as Partial<SaveHotspotsBody>;
  const target = candidate.target ?? candidate.scene;

  return (
    typeof target === "string" &&
    validTargets.has(target) &&
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
      { error: "Expected { target, hotspots }." },
      { status: 400 },
    );
  }

  const target = body.target ?? body.scene;

  if (target === "enter") {
    await fs.writeFile(
      enterHotspotFilePath,
      `${JSON.stringify(body.hotspots, null, 2)}\n`,
    );

    return NextResponse.json({
      ok: true,
      target,
      count: body.hotspots.length,
    });
  }

  if (!target || !validSceneSlugs.has(target as SceneSlug)) {
    return NextResponse.json(
      { error: "Expected a valid room scene or enter target." },
      { status: 400 },
    );
  }

  const current = JSON.parse(
    await fs.readFile(sceneHotspotFilePath, "utf8"),
  ) as Record<SceneSlug, Hotspot[]>;

  const next: Record<SceneSlug, Hotspot[]> = {
    ...current,
    [target]: body.hotspots,
  };

  await fs.writeFile(sceneHotspotFilePath, `${JSON.stringify(next, null, 2)}\n`);

  return NextResponse.json({
    ok: true,
    scene: target,
    target,
    count: body.hotspots.length,
  });
}
