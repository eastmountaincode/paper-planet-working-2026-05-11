import {
  adminUnauthorizedResponse,
  isAdminAuthenticated,
} from "@/lib/admin/auth";
import { deleteR2Object } from "@/lib/admin/r2";

export const runtime = "nodejs";

type DeleteAudioRequest = {
  keys?: unknown;
};

function isValidAudioKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 500 &&
    !value.startsWith("/") &&
    !value.includes("..") &&
    /^audio\/normalized\/.+\.mp3$/i.test(value)
  );
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return adminUnauthorizedResponse();
  }

  const body = (await request.json().catch(() => null)) as DeleteAudioRequest | null;
  const keys = Array.isArray(body?.keys) ? [...new Set(body.keys)] : [];

  if (keys.length === 0 || keys.length > 100 || !keys.every(isValidAudioKey)) {
    return Response.json({ error: "Invalid delete request." }, { status: 400 });
  }

  const results = await Promise.allSettled(keys.map((key) => deleteR2Object(key)));
  const deletedKeys: string[] = [];
  const failedKeys: string[] = [];

  results.forEach((result, index) => {
    const key = keys[index] as string;

    if (result.status === "fulfilled") {
      deletedKeys.push(key);
    } else {
      failedKeys.push(key);
    }
  });

  return Response.json(
    {
      deletedKeys,
      failedKeys,
    },
    { status: failedKeys.length > 0 ? 207 : 200 },
  );
}
