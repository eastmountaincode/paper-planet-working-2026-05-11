import { getR2TextObject, putR2JsonObject } from "@/lib/admin/r2";
import {
  createStaticHotspotManifest,
  HOTSPOT_MANIFEST_KEY,
  normalizeHotspotManifest,
  type HotspotManifest,
} from "@/lib/hotspot-manifest";

export async function readHotspotManifest() {
  try {
    const text = await getR2TextObject(HOTSPOT_MANIFEST_KEY);

    return {
      manifest: normalizeHotspotManifest(JSON.parse(text)),
      source: "r2" as const,
    };
  } catch {
    return {
      manifest: createStaticHotspotManifest(),
      source: "static" as const,
    };
  }
}

export async function writeHotspotManifest(manifest: HotspotManifest) {
  const current = await readHotspotManifest();
  const snapshotKey = `manifests/history/hotspots-${new Date()
    .toISOString()
    .replace(/[:.]/g, "-")}.json`;

  if (current.source === "r2") {
    await putR2JsonObject(snapshotKey, current.manifest);
  }

  await putR2JsonObject(HOTSPOT_MANIFEST_KEY, manifest);

  return manifest;
}

