import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const projectRoot = dirname(appRoot);
const manifestFile = join(appRoot, "src/lib/scene-playlists.json");
const outputRoot = join(projectRoot, "assets/audio/r2-normalized");

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${command} failed`);
  }

  return result.stdout;
}

function getDurationSeconds(file) {
  const output = run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    file,
  ]);

  const duration = Number.parseFloat(output.trim());

  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Invalid duration for ${file}: ${output.trim()}`);
  }

  return duration;
}

function normalizeTrack(track) {
  const source = join(projectRoot, track.sourceFile);
  const output = join(outputRoot, track.key);

  if (!existsSync(source)) {
    throw new Error(`Missing source file: ${track.sourceFile}`);
  }

  mkdirSync(dirname(output), { recursive: true });

  run("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    source,
    "-map_metadata",
    "0",
    "-map",
    "0:a:0",
    "-vn",
    "-ac",
    "2",
    "-ar",
    "44100",
    "-codec:a",
    "libmp3lame",
    "-b:a",
    "256k",
    "-write_xing",
    "1",
    "-id3v2_version",
    "3",
    output,
  ]);

  const sourceDuration = getDurationSeconds(source);
  const outputDuration = getDurationSeconds(output);
  const durationDelta = Math.abs(sourceDuration - outputDuration);

  if (durationDelta > 0.25) {
    throw new Error(
      `Duration changed too much for ${track.key}: ${sourceDuration.toFixed(
        3,
      )}s -> ${outputDuration.toFixed(3)}s`,
    );
  }

  return {
    output,
    outputSize: statSync(output).size,
    sourceSize: statSync(source).size,
  };
}

const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
const tracks = Object.values(manifest).flatMap((playlist) => playlist.tracks);

console.log(`Normalizing ${tracks.length} playlist tracks...`);

for (const track of tracks) {
  const result = normalizeTrack(track);
  const savedPercent = Math.round(
    (1 - result.outputSize / result.sourceSize) * 100,
  );

  console.log(
    `${track.key} (${result.sourceSize} -> ${result.outputSize}, ${savedPercent}% smaller)`,
  );
}

console.log(`Normalized audio written to ${outputRoot}`);
