import type { SceneSlug } from "@/lib/scenes";

export const SITE_SETTINGS_MANIFEST_KEY = "manifests/settings.json";
export const SITE_SETTINGS_MANIFEST_VERSION = 1;
export const DEFAULT_ROOM_AUDIO_VOLUME = 0.8;
export const DEFAULT_PLAYLIST_VOLUME = 0.65;

export type RoomAudioSettings = {
  roomAudioVolume: number;
  playlistVolume: number;
};

export type SiteSettingsManifest = {
  version: typeof SITE_SETTINGS_MANIFEST_VERSION;
  updatedAt: string;
  rooms: Record<SceneSlug, RoomAudioSettings>;
};

type UnknownRecord = Record<string, unknown>;

export const settingsRoomSlugs: SceneSlug[] = ["construction", "hq"];

export const settingsRoomTitles: Record<SceneSlug, string> = {
  construction: "Construction Zone",
  hq: "Paper Planet HQ",
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

export function clampVolume(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

function asVolume(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? clampVolume(value)
    : fallback;
}

export function createStaticSiteSettingsManifest(): SiteSettingsManifest {
  const rooms = {} as Record<SceneSlug, RoomAudioSettings>;

  for (const slug of settingsRoomSlugs) {
    rooms[slug] = {
      roomAudioVolume: DEFAULT_ROOM_AUDIO_VOLUME,
      playlistVolume: DEFAULT_PLAYLIST_VOLUME,
    };
  }

  return {
    version: SITE_SETTINGS_MANIFEST_VERSION,
    updatedAt: new Date(0).toISOString(),
    rooms,
  };
}

export function normalizeSiteSettingsManifest(
  value: unknown,
): SiteSettingsManifest {
  const fallback = createStaticSiteSettingsManifest();

  if (!isRecord(value) || !isRecord(value.rooms)) {
    return fallback;
  }

  const rooms = {} as Record<SceneSlug, RoomAudioSettings>;

  for (const slug of settingsRoomSlugs) {
    const room = isRecord(value.rooms[slug]) ? value.rooms[slug] : {};
    const fallbackRoom = fallback.rooms[slug];

    rooms[slug] = {
      roomAudioVolume: asVolume(
        room.roomAudioVolume,
        fallbackRoom.roomAudioVolume,
      ),
      playlistVolume: asVolume(room.playlistVolume, fallbackRoom.playlistVolume),
    };
  }

  return {
    version: SITE_SETTINGS_MANIFEST_VERSION,
    updatedAt: asString(value.updatedAt, new Date().toISOString()),
    rooms,
  };
}
