import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let r2Client: S3Client | null = null;

function requireEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

export function getR2BucketName() {
  return requireEnv("R2_BUCKET_NAME");
}

function getR2Client() {
  if (!r2Client) {
    r2Client = new S3Client({
      region: "auto",
      endpoint: requireEnv("R2_ENDPOINT"),
      credentials: {
        accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
        secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
      },
    });
  }

  return r2Client;
}

export function getMediaBaseUrl() {
  return (
    process.env.R2_PUBLIC_MEDIA_DOMAIN ||
    process.env.NEXT_PUBLIC_MEDIA_BASE_URL ||
    ""
  ).replace(/\/$/, "");
}

export function getPublicMediaUrl(key: string) {
  const baseUrl = getMediaBaseUrl();

  return baseUrl ? `${baseUrl}/${key.replace(/^\//, "")}` : key;
}

async function streamToString(stream: unknown) {
  if (!stream || typeof stream !== "object" || !("transformToString" in stream)) {
    throw new Error("R2 object body is not readable.");
  }

  return (stream as { transformToString: () => Promise<string> }).transformToString();
}

export async function getR2TextObject(key: string) {
  const response = await getR2Client().send(
    new GetObjectCommand({
      Bucket: getR2BucketName(),
      Key: key,
    }),
  );

  return streamToString(response.Body);
}

export async function putR2JsonObject(key: string, value: unknown) {
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: getR2BucketName(),
      Key: key,
      Body: `${JSON.stringify(value, null, 2)}\n`,
      ContentType: "application/json; charset=utf-8",
      CacheControl: "public, max-age=30, stale-while-revalidate=30",
    }),
  );
}

export async function deleteR2Object(key: string) {
  await getR2Client().send(
    new DeleteObjectCommand({
      Bucket: getR2BucketName(),
      Key: key,
    }),
  );
}

export async function createPresignedAudioUpload(key: string) {
  const cacheControl =
    process.env.R2_AUDIO_CACHE_CONTROL ||
    process.env.R2_CACHE_CONTROL ||
    "public, max-age=31536000, immutable";
  const contentType = "audio/mpeg";

  const command = new PutObjectCommand({
    Bucket: getR2BucketName(),
    Key: key,
    ContentType: contentType,
    CacheControl: cacheControl,
  });

  return {
    key,
    url: await getSignedUrl(getR2Client(), command, { expiresIn: 60 * 10 }),
    headers: {
      "cache-control": cacheControl,
      "content-type": contentType,
    },
    publicUrl: getPublicMediaUrl(key),
  };
}
