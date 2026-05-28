import { readHotspotManifest } from "@/lib/admin/hotspots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
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

