import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import {
  sceneSlugs,
  sceneViewports,
  type Hotspot,
  type SceneSlug,
  type SceneViewport,
} from "@/lib/scenes";

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
const validSceneSlugs = new Set<SceneSlug>(sceneSlugs);
const validTargets = new Set<HotspotTarget>(["enter", ...sceneSlugs]);
const validSceneViewports = new Set<SceneViewport>(sceneViewports);

type HotspotTarget = SceneSlug | "enter";
type SceneHotspotEntry =
  | Hotspot[]
  | Partial<Record<SceneViewport, Hotspot[]>>;
type SceneHotspotFile = Record<SceneSlug, SceneHotspotEntry>;

type SaveHotspotsBody = {
  scene?: SceneSlug;
  target?: HotspotTarget;
  variant?: SceneViewport;
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

function normalizeSceneHotspotEntry(
  entry: SceneHotspotEntry | undefined,
): Record<SceneViewport, Hotspot[]> {
  if (Array.isArray(entry)) {
    return {
      desktop: entry,
      mobile: entry,
    };
  }

  return {
    desktop: entry?.desktop ?? entry?.mobile ?? [],
    mobile: entry?.mobile ?? entry?.desktop ?? [],
  };
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
  const variant = body.variant ?? "desktop";

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

  if (!validSceneViewports.has(variant)) {
    return NextResponse.json(
      { error: "Expected variant to be desktop or mobile." },
      { status: 400 },
    );
  }

  const current = JSON.parse(
    await fs.readFile(sceneHotspotFilePath, "utf8"),
  ) as SceneHotspotFile;
  const currentEntry = normalizeSceneHotspotEntry(current[target as SceneSlug]);

  const next: SceneHotspotFile = {
    ...current,
    [target]: {
      ...currentEntry,
      [variant]: body.hotspots,
    },
  };

  await fs.writeFile(sceneHotspotFilePath, `${JSON.stringify(next, null, 2)}\n`);

  return NextResponse.json({
    ok: true,
    scene: target,
    target,
    variant,
    count: body.hotspots.length,
  });
}
