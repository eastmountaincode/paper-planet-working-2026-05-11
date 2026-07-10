import { readCachedRuntimeManifests } from "@/lib/admin/runtime-manifests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await readCachedRuntimeManifests();

  return Response.json(
    result,
    {
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}
