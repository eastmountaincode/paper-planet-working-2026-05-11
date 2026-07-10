import {
  adminUnauthorizedResponse,
  isAdminAuthenticated,
} from "@/lib/admin/auth";
import {
  readHotspotManifest,
  writeHotspotManifest,
} from "@/lib/admin/hotspots";
import { invalidateRuntimeManifestCache } from "@/lib/admin/runtime-manifests";
import {
  hotspotSceneSlugs,
  hotspotSceneViewports,
  normalizeHotspotManifest,
  type HotspotManifest,
  type HotspotTarget,
} from "@/lib/hotspot-manifest";
import type { Hotspot, SceneSlug, SceneViewport } from "@/lib/scenes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SaveTargetBody = {
  target?: HotspotTarget;
  variant?: SceneViewport;
  hotspots?: Hotspot[];
};

function isSceneSlug(value: unknown): value is SceneSlug {
  return hotspotSceneSlugs.includes(value as SceneSlug);
}

function isSceneViewport(value: unknown): value is SceneViewport {
  return hotspotSceneViewports.includes(value as SceneViewport);
}

function isTargetSaveBody(value: unknown): value is SaveTargetBody {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as SaveTargetBody;

  return (
    (candidate.target === "enter" || isSceneSlug(candidate.target)) &&
    Array.isArray(candidate.hotspots)
  );
}

function saveTargetHotspots(
  manifest: HotspotManifest,
  body: SaveTargetBody,
): HotspotManifest {
  const updatedAt = new Date().toISOString();

  if (body.target === "enter") {
    return {
      ...manifest,
      updatedAt,
      enter: body.hotspots ?? [],
    };
  }

  if (!isSceneSlug(body.target) || !isSceneViewport(body.variant)) {
    throw new Error("Expected a valid room target and desktop/mobile variant.");
  }

  return {
    ...manifest,
    updatedAt,
    scenes: {
      ...manifest.scenes,
      [body.target]: {
        ...manifest.scenes[body.target],
        [body.variant]: body.hotspots ?? [],
      },
    },
  };
}

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return adminUnauthorizedResponse();
  }

  const { manifest, source } = await readHotspotManifest();

  return Response.json(
    { manifest, source },
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

  const body = (await request.json().catch(() => null)) as unknown;
  const manifest = normalizeHotspotManifest(body);
  const savedManifest = await writeHotspotManifest({
    ...manifest,
    updatedAt: new Date().toISOString(),
  });
  invalidateRuntimeManifestCache();

  return Response.json({ manifest: savedManifest, source: "r2" });
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return adminUnauthorizedResponse();
  }

  const body = (await request.json().catch(() => null)) as unknown;

  if (!isTargetSaveBody(body)) {
    return Response.json(
      { error: "Expected { target, variant, hotspots }." },
      { status: 400 },
    );
  }

  try {
    const { manifest } = await readHotspotManifest();
    const nextManifest = saveTargetHotspots(manifest, body);
    const savedManifest = await writeHotspotManifest(nextManifest);
    invalidateRuntimeManifestCache();

    return Response.json({
      manifest: savedManifest,
      source: "r2",
      target: body.target,
      variant: body.target === "enter" ? undefined : body.variant,
      count: body.hotspots?.length ?? 0,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Save failed." },
      { status: 400 },
    );
  }
}
