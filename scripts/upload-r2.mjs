import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const envFile = ".env.local";
const playlistManifestFile = "src/lib/scene-playlists.json";
const normalizedAudioRoot = "../assets/audio/r2-normalized";

const videoUploads = [
  {
    source:
      "../assets/Phase 1 - Construction Zone/ROOMS/compressed/construction-1080-crf24-audio.mp4",
    key: "rooms/construction.mp4",
    contentType: "video/mp4",
  },
  {
    source:
      "../assets/Phase 1 - Construction Zone/ROOMS/compressed/hq-1080-crf24-audio.mp4",
    key: "rooms/hq.mp4",
    contentType: "video/mp4",
  },
];

function getPlaylistUploads() {
  if (!existsSync(playlistManifestFile)) {
    return [];
  }

  const manifest = JSON.parse(readFileSync(playlistManifestFile, "utf8"));

  return Object.values(manifest).flatMap((playlist) =>
    playlist.tracks.map((track) => {
      const normalizedSource = `${normalizedAudioRoot}/${track.key}`;

      return {
        source: existsSync(normalizedSource)
          ? normalizedSource
          : `../${track.sourceFile}`,
        key: track.key,
        contentType: "audio/mpeg",
      };
    }),
  );
}

function loadEnv(file) {
  const env = { ...process.env };
  const text = readFileSync(file, "utf8");

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

function requireEnv(env, keys) {
  const missing = keys.filter((key) => !env[key]);

  if (missing.length) {
    throw new Error(`${missing.join(", ")} missing from ${envFile}`);
  }
}

function runAws(args, env, options = {}) {
  const retries = options.retries ?? 0;
  const timeout = options.timeoutMs ?? 120_000;
  let lastError = "";

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const result = spawnSync("aws", args, {
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout,
    });

    if (result.status === 0) {
      return result.stdout;
    }

    lastError =
      result.error?.message ||
      result.stderr ||
      result.stdout ||
      "aws command failed";

    if (attempt < retries) {
      console.warn(`Retrying AWS command after failure: ${lastError.trim()}`);
    }
  }

  throw new Error(lastError);
}

function main() {
  const env = loadEnv(envFile);

  requireEnv(env, [
    "R2_BUCKET_NAME",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_ENDPOINT",
  ]);

  env.AWS_ACCESS_KEY_ID = env.R2_ACCESS_KEY_ID;
  env.AWS_SECRET_ACCESS_KEY = env.R2_SECRET_ACCESS_KEY;
  env.AWS_DEFAULT_REGION = "auto";
  env.AWS_CLI_CONNECT_TIMEOUT = env.AWS_CLI_CONNECT_TIMEOUT || "10";
  env.AWS_CLI_READ_TIMEOUT = env.AWS_CLI_READ_TIMEOUT || "30";

  const cacheControl =
    env.R2_CACHE_CONTROL || "public, max-age=31536000, immutable";
  const uploadMode = process.argv.includes("--audio-only")
    ? "audio"
    : process.argv.includes("--video-only")
      ? "video"
      : "all";
  const playlistUploads = getPlaylistUploads();
  const uploads =
    uploadMode === "audio"
      ? playlistUploads
      : uploadMode === "video"
        ? videoUploads
        : [...videoUploads, ...playlistUploads];

  console.log("Verifying R2 bucket access...");
  runAws(
    ["s3", "ls", `s3://${env.R2_BUCKET_NAME}`, "--endpoint-url", env.R2_ENDPOINT],
    env,
  );

  for (const upload of uploads) {
    console.log(`Uploading ${upload.key}...`);
    runAws(
      [
        "s3",
        "cp",
        upload.source,
        `s3://${env.R2_BUCKET_NAME}/${upload.key}`,
        "--endpoint-url",
        env.R2_ENDPOINT,
        "--content-type",
        upload.contentType,
        "--cache-control",
        cacheControl,
        "--no-progress",
        "--only-show-errors",
      ],
      env,
      { retries: 2 },
    );
  }

  const roomListing = runAws(
    [
      "s3",
      "ls",
      `s3://${env.R2_BUCKET_NAME}/rooms/`,
      "--endpoint-url",
      env.R2_ENDPOINT,
    ],
    env,
  );

  console.log("Uploaded room objects:");
  console.log(roomListing.trim());

  const audioListing = runAws(
    [
      "s3",
      "ls",
      `s3://${env.R2_BUCKET_NAME}/audio/`,
      "--recursive",
      "--endpoint-url",
      env.R2_ENDPOINT,
    ],
    env,
  );

  if (audioListing.trim()) {
    console.log("Uploaded audio objects:");
    console.log(audioListing.trim());
  }
}

main();
