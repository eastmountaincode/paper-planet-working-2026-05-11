import { getR2TextObject, putR2JsonObject } from "@/lib/admin/r2";
import {
  createStaticSiteSettingsManifest,
  normalizeSiteSettingsManifest,
  SITE_SETTINGS_MANIFEST_KEY,
  type SiteSettingsManifest,
} from "@/lib/site-settings";

export async function readSiteSettingsManifest() {
  try {
    const text = await getR2TextObject(SITE_SETTINGS_MANIFEST_KEY);

    return {
      manifest: normalizeSiteSettingsManifest(JSON.parse(text)),
      source: "r2" as const,
    };
  } catch {
    return {
      manifest: createStaticSiteSettingsManifest(),
      source: "static" as const,
    };
  }
}

export async function writeSiteSettingsManifest(
  manifest: SiteSettingsManifest,
) {
  const current = await readSiteSettingsManifest();
  const snapshotKey = `manifests/history/settings-${new Date()
    .toISOString()
    .replace(/[:.]/g, "-")}.json`;

  if (current.source === "r2") {
    await putR2JsonObject(snapshotKey, current.manifest);
  }

  await putR2JsonObject(SITE_SETTINGS_MANIFEST_KEY, manifest);

  return manifest;
}
