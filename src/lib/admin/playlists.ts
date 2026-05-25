import {
  createStaticPlaylistManifest,
  normalizePlaylistManifest,
  PLAYLIST_MANIFEST_KEY,
  type PlaylistManifest,
} from "@/lib/playlist-manifest";
import { getR2TextObject, putR2JsonObject } from "@/lib/admin/r2";

export async function readPlaylistManifest() {
  try {
    const text = await getR2TextObject(PLAYLIST_MANIFEST_KEY);

    return {
      manifest: normalizePlaylistManifest(JSON.parse(text)),
      source: "r2" as const,
    };
  } catch {
    return {
      manifest: createStaticPlaylistManifest(),
      source: "static" as const,
    };
  }
}

export async function writePlaylistManifest(manifest: PlaylistManifest) {
  const current = await readPlaylistManifest();
  const snapshotKey = `manifests/history/${new Date()
    .toISOString()
    .replace(/[:.]/g, "-")}.json`;

  if (current.source === "r2") {
    await putR2JsonObject(snapshotKey, current.manifest);
  }

  await putR2JsonObject(PLAYLIST_MANIFEST_KEY, manifest);

  return manifest;
}
