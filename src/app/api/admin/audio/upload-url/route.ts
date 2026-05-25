import {
  adminUnauthorizedResponse,
  isAdminAuthenticated,
} from "@/lib/admin/auth";
import { createPresignedAudioUpload } from "@/lib/admin/r2";
import {
  buildAudioKey,
  roomSlugs,
  type SceneSlug,
} from "@/lib/playlist-manifest";

export const runtime = "nodejs";

type UploadUrlRequest = {
  batchId?: string;
  relativePath?: string;
  room?: SceneSlug;
};

function isSceneSlug(value: string | undefined): value is SceneSlug {
  return Boolean(value && roomSlugs.includes(value as SceneSlug));
}

function isValidBatchId(value: string | undefined): value is string {
  return Boolean(value && /^[a-zA-Z0-9-]{8,80}$/.test(value));
}

function isValidRelativePath(value: string | undefined): value is string {
  return Boolean(
    value &&
      value.length <= 300 &&
      !value.startsWith("/") &&
      !value.includes("..") &&
      /\.mp3$/i.test(value),
  );
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return adminUnauthorizedResponse();
  }

  const body = (await request.json().catch(() => null)) as UploadUrlRequest | null;

  const room = body?.room;
  const batchId = body?.batchId;
  const relativePath = body?.relativePath;

  if (
    !isSceneSlug(room) ||
    !isValidBatchId(batchId) ||
    !isValidRelativePath(relativePath)
  ) {
    return Response.json({ error: "Invalid upload request." }, { status: 400 });
  }

  const key = buildAudioKey(room, batchId, relativePath);
  const upload = await createPresignedAudioUpload(key);

  return Response.json(upload);
}
