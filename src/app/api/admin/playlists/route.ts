import {
  adminUnauthorizedResponse,
  isAdminAuthenticated,
} from "@/lib/admin/auth";
import {
  readPlaylistManifest,
  writePlaylistManifest,
} from "@/lib/admin/playlists";
import { normalizePlaylistManifest } from "@/lib/playlist-manifest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return adminUnauthorizedResponse();
  }

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

export async function PUT(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return adminUnauthorizedResponse();
  }

  const body = await request.json().catch(() => null);
  const manifest = normalizePlaylistManifest(body);
  const savedManifest = await writePlaylistManifest({
    ...manifest,
    updatedAt: new Date().toISOString(),
  });

  return Response.json({ manifest: savedManifest, source: "r2" });
}
