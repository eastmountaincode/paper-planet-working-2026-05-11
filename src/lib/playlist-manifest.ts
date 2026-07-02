import scenePlaylistsData from "@/lib/scene-playlists.json";
import type { ScenePlaylistData, SceneSlug } from "@/lib/scenes";

export type { SceneSlug } from "@/lib/scenes";

export const PLAYLIST_MANIFEST_KEY = "manifests/playlists.json";
export const PLAYLIST_MANIFEST_VERSION = 3;

export type PlaylistPlaybackMode = "ordered" | "deterministic-random";

export type PlaylistManifestTrack = {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  key: string;
  src: string;
  durationSeconds: number;
  enabled: boolean;
  originalFileName?: string;
  uploadedAt?: string;
};

export type PlaylistManifestRoom = {
  name: string;
  folder?: string;
  playbackMode: PlaylistPlaybackMode;
  shuffleSeed?: string;
  volume?: number;
  tracks: PlaylistManifestTrack[];
};

export type PlaylistManifest = {
  version: typeof PLAYLIST_MANIFEST_VERSION;
  updatedAt: string;
  rooms: Record<SceneSlug, PlaylistManifestRoom>;
};

type UnknownRecord = Record<string, unknown>;

const scenePlaylists = scenePlaylistsData as Record<SceneSlug, ScenePlaylistData>;

export const roomTitles: Record<SceneSlug, string> = {
  construction: "Construction Zone",
  hq: "Paper Planet HQ",
  "tv-room": "Paper Planet TV Room",
  "hole-room": "Paper Planet Hole Room",
};

export const roomSlugs: SceneSlug[] = [
  "construction",
  "hq",
  "tv-room",
  "hole-room",
];

export function slugifyPathSegment(value: string) {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "item";
}

export function stripAudioExtension(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "");
}

export function stripTrackNumber(fileName: string) {
  return stripAudioExtension(fileName)
    .replace(/^\s*\d+[\s._-]+/, "")
    .trim();
}

export function getFolderAlbum(relativePath: string) {
  const parts = relativePath.split("/").filter(Boolean);

  if (parts.length <= 1) {
    return undefined;
  }

  return parts.slice(0, -1).join(" / ");
}

export function createTrackId() {
  const randomPart =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 12)
      : Math.random().toString(36).slice(2, 14);

  return `track_${randomPart}`;
}

export function createBatchId(date = new Date()) {
  const timestamp = date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "z");
  const randomPart =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 6)
      : Math.random().toString(36).slice(2, 8);

  return `${timestamp}-${randomPart}`;
}

export function buildAudioKey(
  room: SceneSlug,
  batchId: string,
  relativePath: string,
) {
  const parts = relativePath.split("/").filter(Boolean);
  const fileName = parts.pop() ?? "track.mp3";
  const folderParts = parts.map(slugifyPathSegment);
  const baseName = slugifyPathSegment(stripAudioExtension(fileName));

  return ["audio", "normalized", room, batchId, ...folderParts, `${baseName}.mp3`].join(
    "/",
  );
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asPlaybackMode(value: unknown): PlaylistPlaybackMode {
  return value === "deterministic-random" ? value : "ordered";
}

function asNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function normalizeTrack(value: unknown): PlaylistManifestTrack | null {
  if (!isRecord(value)) {
    return null;
  }

  const key = asString(value.key || value.src);

  if (!key) {
    return null;
  }

  return {
    id: asString(value.id, createTrackId()),
    title: asString(value.title, stripTrackNumber(key.split("/").at(-1) ?? key)),
    ...(typeof value.artist === "string" && value.artist
      ? { artist: value.artist }
      : {}),
    ...(typeof value.album === "string" && value.album ? { album: value.album } : {}),
    key,
    src: asString(value.src, key),
    durationSeconds: asNumber(value.durationSeconds, 0),
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    ...(typeof value.originalFileName === "string"
      ? { originalFileName: value.originalFileName }
      : {}),
    ...(typeof value.uploadedAt === "string" ? { uploadedAt: value.uploadedAt } : {}),
  };
}

export function createStaticPlaylistManifest(): PlaylistManifest {
  const rooms = {} as Record<SceneSlug, PlaylistManifestRoom>;

  for (const slug of roomSlugs) {
    const playlist = scenePlaylists[slug];

    rooms[slug] = {
      name: playlist.name,
      folder: playlist.folder,
      playbackMode: playlist.playbackMode ?? "ordered",
      ...(playlist.shuffleSeed ? { shuffleSeed: playlist.shuffleSeed } : {}),
      tracks: playlist.tracks.map((track, index) => ({
        id: `${slug}-${index}-${slugifyPathSegment(track.key)}`,
        title: track.title,
        ...(track.artist ? { artist: track.artist } : {}),
        ...(track.album ? { album: track.album } : {}),
        key: track.key,
        src: track.src,
        durationSeconds: track.durationSeconds,
        enabled: true,
        originalFileName: track.sourceFile.split("/").at(-1),
      })),
    };
  }

  return {
    version: PLAYLIST_MANIFEST_VERSION,
    updatedAt: new Date(0).toISOString(),
    rooms,
  };
}

export function normalizePlaylistManifest(value: unknown): PlaylistManifest {
  const fallback = createStaticPlaylistManifest();

  if (!isRecord(value) || !isRecord(value.rooms)) {
    return fallback;
  }

  const rooms = {} as Record<SceneSlug, PlaylistManifestRoom>;

  for (const slug of roomSlugs) {
    const room = isRecord(value.rooms[slug]) ? value.rooms[slug] : undefined;
    const fallbackRoom = fallback.rooms[slug];
    const tracks = Array.isArray(room?.tracks)
      ? room.tracks.map(normalizeTrack).filter((track): track is PlaylistManifestTrack => Boolean(track))
      : fallbackRoom.tracks;

    rooms[slug] = {
      name: asString(room?.name, fallbackRoom.name),
      ...(typeof room?.folder === "string" ? { folder: room.folder } : {}),
      playbackMode: asPlaybackMode(room?.playbackMode ?? fallbackRoom.playbackMode),
      ...(typeof room?.shuffleSeed === "string" && room.shuffleSeed
        ? { shuffleSeed: room.shuffleSeed }
        : fallbackRoom.shuffleSeed
          ? { shuffleSeed: fallbackRoom.shuffleSeed }
          : {}),
      ...(typeof room?.volume === "number" ? { volume: room.volume } : {}),
      tracks,
    };
  }

  return {
    version: PLAYLIST_MANIFEST_VERSION,
    updatedAt: asString(value.updatedAt, new Date().toISOString()),
    rooms,
  };
}

export function playlistManifestToScenePlaylists(
  manifest: PlaylistManifest,
): Record<SceneSlug, ScenePlaylistData> {
  const playlists = {} as Record<SceneSlug, ScenePlaylistData>;

  for (const slug of roomSlugs) {
    const room = manifest.rooms[slug];
    const enabledTracks = room.tracks.filter((track) => track.enabled);

    playlists[slug] = {
      name: room.name,
      folder: room.folder ?? "",
      playbackMode: room.playbackMode,
      ...(room.shuffleSeed ? { shuffleSeed: room.shuffleSeed } : {}),
      totalDurationSeconds: Number(
        enabledTracks
          .reduce((total, track) => total + track.durationSeconds, 0)
          .toFixed(3),
      ),
      tracks: enabledTracks.map((track) => ({
        title: track.title,
        ...(track.artist ? { artist: track.artist } : {}),
        ...(track.album ? { album: track.album } : {}),
        sourceFile: track.originalFileName ?? track.key,
        key: track.key,
        src: track.src,
        durationSeconds: track.durationSeconds,
      })),
    };
  }

  return playlists;
}
