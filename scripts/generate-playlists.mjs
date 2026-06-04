import { readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const projectRoot = dirname(appRoot);

const playlistDefinitions = {
  construction: {
    name: "HOME - Construction Zone",
    folder:
      "assets/audio/rooms/construction_zone/HOME - (ConstructionZone) good to go",
    keyPrefix: "audio/normalized/construction",
    playbackMode: "ordered",
  },
  hq: {
    name: "HQ",
    folder: "assets/audio/rooms/hq/HQ - Songs can stay anonymous no metadata",
    keyPrefix: "audio/normalized/hq",
    playbackMode: "deterministic-random",
    shuffleSeed: "paper-planet-hq-v1",
  },
};

const collator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

function toPosixPath(path) {
  return path.split(sep).join("/");
}

function slugify(value) {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "track";
}

function getAudioFiles(folder) {
  const files = [];

  function walk(currentFolder) {
    for (const entry of readdirSync(currentFolder)) {
      if (entry.startsWith("._")) {
        continue;
      }

      const path = join(currentFolder, entry);
      const stat = statSync(path);

      if (stat.isDirectory()) {
        walk(path);
        continue;
      }

      if (stat.isFile() && extname(entry).toLowerCase() === ".mp3") {
        files.push(path);
      }
    }
  }

  walk(folder);

  return files.sort((a, b) =>
    collator.compare(toPosixPath(relative(folder, a)), toPosixPath(relative(folder, b))),
  );
}

function getDurationSeconds(file) {
  const result = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      file,
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  if (result.status !== 0) {
    throw new Error(result.stderr || `ffprobe failed for ${file}`);
  }

  const duration = Number.parseFloat(result.stdout.trim());

  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Invalid duration for ${file}: ${result.stdout.trim()}`);
  }

  return Number(duration.toFixed(3));
}

function stripTrackNumber(fileName) {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/^\s*\d+[\s._-]+/, "")
    .trim();
}

function makeUniqueKey(key, usedKeys) {
  if (!usedKeys.has(key)) {
    usedKeys.add(key);
    return key;
  }

  const extension = extname(key);
  const base = key.slice(0, -extension.length);
  let index = 2;

  while (usedKeys.has(`${base}-${index}${extension}`)) {
    index += 1;
  }

  const uniqueKey = `${base}-${index}${extension}`;
  usedKeys.add(uniqueKey);
  return uniqueKey;
}

function hashString(value) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createSeededRandom(seed) {
  let state = hashString(seed);

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleTracks(tracks, seed) {
  const shuffled = [...tracks];
  const random = createSeededRandom(seed);

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }

  return shuffled;
}

function getTrackKey(definition, folder, file, usedKeys) {
  const relativeParts = toPosixPath(relative(folder, file)).split("/");
  const fileName = relativeParts.pop() ?? "";
  const fileBase = fileName.replace(/\.[^.]+$/, "");
  const folders = relativeParts.map(slugify);
  const key = [...folders, `${slugify(fileBase)}.mp3`].join("/");

  return makeUniqueKey(`${definition.keyPrefix}/${key}`, usedKeys);
}

function getTag(file, tag) {
  const result = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      `format_tags=${tag}`,
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      file,
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  if (result.status !== 0) {
    return undefined;
  }

  const value = result.stdout.trim();

  return value || undefined;
}

const manifest = {};
const usedKeys = new Set();

for (const [slug, definition] of Object.entries(playlistDefinitions)) {
  const folder = join(projectRoot, definition.folder);
  const files = getAudioFiles(folder);
  let tracks = files.map((file) => {
    const sourceFile = toPosixPath(relative(projectRoot, file));
    const key = getTrackKey(definition, folder, file, usedKeys);
    const title = getTag(file, "title");
    const artist = getTag(file, "artist");
    const album = getTag(file, "album");

    return {
      title: title ?? stripTrackNumber(file.split(sep).at(-1) ?? ""),
      ...(artist ? { artist } : {}),
      ...(album ? { album } : {}),
      sourceFile,
      key,
      src: key,
      durationSeconds: getDurationSeconds(file),
    };
  });

  if (definition.playbackMode === "deterministic-random") {
    tracks = shuffleTracks(tracks, definition.shuffleSeed ?? slug);
  }

  manifest[slug] = {
    name: definition.name,
    folder: definition.folder,
    playbackMode: definition.playbackMode,
    ...(definition.shuffleSeed ? { shuffleSeed: definition.shuffleSeed } : {}),
    totalDurationSeconds: Number(
      tracks
        .reduce((total, track) => total + track.durationSeconds, 0)
        .toFixed(3),
    ),
    tracks,
  };
}

writeFileSync(
  join(appRoot, "src/lib/scene-playlists.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

for (const [slug, playlist] of Object.entries(manifest)) {
  const minutes = Math.round(playlist.totalDurationSeconds / 60);
  console.log(`${slug}: ${playlist.tracks.length} tracks, about ${minutes} min`);
}
