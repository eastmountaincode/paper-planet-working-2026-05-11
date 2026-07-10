import { revalidateTag, unstable_cache } from "next/cache";
import { readHotspotManifest } from "@/lib/admin/hotspots";
import { readPlaylistManifest } from "@/lib/admin/playlists";
import { readSiteSettingsManifest } from "@/lib/admin/settings";

const RUNTIME_MANIFEST_CACHE_TAG = "paper-planet-runtime-manifests-v1";

export const readCachedRuntimeManifests = unstable_cache(
  async () => {
    const [hotspots, playlists, settings] = await Promise.all([
      readHotspotManifest(),
      readPlaylistManifest(),
      readSiteSettingsManifest(),
    ]);

    return { hotspots, playlists, settings };
  },
  [RUNTIME_MANIFEST_CACHE_TAG],
  {
    revalidate: 300,
    tags: [RUNTIME_MANIFEST_CACHE_TAG],
  },
);

export function invalidateRuntimeManifestCache() {
  revalidateTag(RUNTIME_MANIFEST_CACHE_TAG, { expire: 0 });
}
