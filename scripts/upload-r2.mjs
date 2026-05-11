import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const envFile = ".env.local";

const uploads = [
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

function runAws(args, env) {
  const result = spawnSync("aws", args, {
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "aws command failed");
  }

  return result.stdout;
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

  const cacheControl =
    env.R2_CACHE_CONTROL || "public, max-age=31536000, immutable";

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
        "--only-show-errors",
      ],
      env,
    );
  }

  const listing = runAws(
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
  console.log(listing.trim());
}

main();
