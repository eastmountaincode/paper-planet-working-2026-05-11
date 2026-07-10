import {
  adminUnauthorizedResponse,
  isAdminAuthenticated,
} from "@/lib/admin/auth";
import {
  readSiteSettingsManifest,
  writeSiteSettingsManifest,
} from "@/lib/admin/settings";
import { invalidateRuntimeManifestCache } from "@/lib/admin/runtime-manifests";
import { normalizeSiteSettingsManifest } from "@/lib/site-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return adminUnauthorizedResponse();
  }

  const { manifest, source } = await readSiteSettingsManifest();

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

  const body = await request.json().catch(() => null);
  const manifest = normalizeSiteSettingsManifest(body);
  const savedManifest = await writeSiteSettingsManifest({
    ...manifest,
    updatedAt: new Date().toISOString(),
  });
  invalidateRuntimeManifestCache();

  return Response.json({ manifest: savedManifest, source: "r2" });
}
