import { readPlaylistManifest } from "@/lib/admin/playlists";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { manifest, source } = await readPlaylistManifest();

  return Response.json(
    { manifest, source },
    {
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}
