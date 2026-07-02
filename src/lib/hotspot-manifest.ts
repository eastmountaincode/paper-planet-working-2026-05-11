import enterHotspotsData from "@/lib/enter-hotspots.json";
import sceneHotspotsData from "@/lib/scene-hotspots.json";
import type { Hotspot, SceneSlug, SceneViewport } from "@/lib/scenes";

export const HOTSPOT_MANIFEST_KEY = "manifests/hotspots.json";
export const HOTSPOT_MANIFEST_VERSION = 1;

export type HotspotManifest = {
  version: typeof HOTSPOT_MANIFEST_VERSION;
  updatedAt: string;
  enter: Hotspot[];
  scenes: Record<SceneSlug, Record<SceneViewport, Hotspot[]>>;
};

export type HotspotTarget = SceneSlug | "enter";

type SceneHotspotEntry =
  | Hotspot[]
  | Partial<Record<SceneViewport, Hotspot[]>>;
type UnknownRecord = Record<string, unknown>;

export const hotspotSceneSlugs: SceneSlug[] = [
  "construction",
  "hq",
  "tv-room",
  "hole-room",
];
export const hotspotSceneViewports: SceneViewport[] = ["desktop", "mobile"];

const staticEnterHotspots = enterHotspotsData as Hotspot[];
const staticSceneHotspots = sceneHotspotsData as Record<
  SceneSlug,
  SceneHotspotEntry
>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isPoint(value: unknown) {
  if (!isRecord(value)) {
    return false;
  }

  return asNumber(value.x) !== null && asNumber(value.y) !== null;
}

function isExternalLinkUrl(value: unknown) {
  if (typeof value !== "string" || value.length === 0) {
    return false;
  }

  try {
    const url = new URL(value);

    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isHotspotAction(value: unknown) {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  if (value.type === "navigate") {
    return hotspotSceneSlugs.includes(value.target as SceneSlug);
  }

  if (value.type === "mailto") {
    return typeof value.email === "string" && value.email.length > 0;
  }

  if (value.type === "externalLink") {
    return isExternalLinkUrl(value.url);
  }

  if (value.type === "credits") {
    return true;
  }

  return false;
}

function isHotspot(value: unknown): value is Hotspot {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.label !== "string" ||
    !isHotspotAction(value.action)
  ) {
    return false;
  }

  if (value.shape === "rect") {
    return (
      isRecord(value.rect) &&
      asNumber(value.rect.x) !== null &&
      asNumber(value.rect.y) !== null &&
      asNumber(value.rect.width) !== null &&
      asNumber(value.rect.height) !== null
    );
  }

  if (value.shape === "polygon") {
    return Array.isArray(value.points) && value.points.every(isPoint);
  }

  return false;
}

function normalizeHotspots(value: unknown, fallback: Hotspot[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const hotspots = value.filter(isHotspot);

  return hotspots.length > 0 || value.length === 0 ? hotspots : fallback;
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

export function createStaticHotspotManifest(): HotspotManifest {
  const scenes = {} as Record<SceneSlug, Record<SceneViewport, Hotspot[]>>;

  for (const slug of hotspotSceneSlugs) {
    scenes[slug] = normalizeSceneHotspotEntry(staticSceneHotspots[slug]);
  }

  return {
    version: HOTSPOT_MANIFEST_VERSION,
    updatedAt: new Date(0).toISOString(),
    enter: staticEnterHotspots,
    scenes,
  };
}

export function normalizeHotspotManifest(value: unknown): HotspotManifest {
  const fallback = createStaticHotspotManifest();

  if (!isRecord(value)) {
    return fallback;
  }

  const scenes = {} as Record<SceneSlug, Record<SceneViewport, Hotspot[]>>;
  const valueScenes = isRecord(value.scenes) ? value.scenes : {};

  for (const slug of hotspotSceneSlugs) {
    const valueScene = isRecord(valueScenes[slug]) ? valueScenes[slug] : {};
    const fallbackScene = fallback.scenes[slug];

    scenes[slug] = {
      desktop: normalizeHotspots(valueScene.desktop, fallbackScene.desktop),
      mobile: normalizeHotspots(valueScene.mobile, fallbackScene.mobile),
    };
  }

  return {
    version: HOTSPOT_MANIFEST_VERSION,
    updatedAt: asString(value.updatedAt, new Date().toISOString()),
    enter: normalizeHotspots(value.enter, fallback.enter),
    scenes,
  };
}

export function hotspotManifestToSceneHotspots(manifest: HotspotManifest) {
  return manifest.scenes;
}
