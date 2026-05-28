import { readSiteSettingsManifest } from "@/lib/admin/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
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
