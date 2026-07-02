import sceneHotspotsData from "./scene-hotspots.json";
import scenePlaylistsData from "./scene-playlists.json";
import {
  createStaticSiteSettingsManifest,
  type SiteSettingsManifest,
} from "@/lib/site-settings";

export type SceneSlug = "construction" | "hq" | "tv-room" | "hole-room";
export type SceneViewport = "desktop" | "mobile";

export const sceneViewports: SceneViewport[] = ["desktop", "mobile"];

export type PercentPoint = {
  x: number;
  y: number;
};

export type HotspotAction =
  | {
      type: "navigate";
      target: SceneSlug;
    }
  | {
      type: "mailto";
      email: string;
      subject?: string;
    }
  | {
      type: "credits";
    };
type HotspotBase = {
  id: string;
  label: string;
  zIndex?: number;
  action: HotspotAction;
};

export type RectHotspot = HotspotBase & {
  shape: "rect";
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export type PolygonHotspot = HotspotBase & {
  shape: "polygon";
  points: PercentPoint[];
};

export type Hotspot = RectHotspot | PolygonHotspot;

export type SceneIconOverlay = {
  id: string;
  label: string;
  src: string;
  zIndex?: number;
  position: {
    x: number;
    y: number;
    width: number;
  };
  action: HotspotAction;
};

export type SceneTicker =
  | {
      text: string;
      position: "bottom";
      speedPixelsPerSecond: number;
      epochOffsetSeconds?: number;
    }
  | {
      messages: string[];
      position: "center";
      cycleSeconds: number;
      messageIntervalSeconds?: number;
      epochOffsetSeconds?: number;
    };

export type SceneVideoSource = {
  src: string;
  width: number;
  height: number;
  sourceFile: string;
};

export type Scene = {
  slug: SceneSlug;
  title: string;
  video: SceneVideoSource & {
    sources?: Record<SceneViewport, SceneVideoSource>;
    durationSeconds: number;
    sync?: {
      enabled: boolean;
      epochOffsetSeconds?: number;
    };
    audio?: {
      enabled: boolean;
      volume: number;
      src: string;
      sourceFile: string;
    };
  };
  playlist?: {
    enabled: boolean;
    name: string;
    folder: string;
    volume: number;
    sync?: {
      enabled: boolean;
      epochOffsetSeconds?: number;
    };
    tracks: {
      title: string;
      artist?: string;
      album?: string;
      sourceFile: string;
      key: string;
      src: string;
      durationSeconds: number;
    }[];
  };
  hotspots: Hotspot[];
  hotspotVariants?: Record<SceneViewport, Hotspot[]>;
  overlays?: SceneIconOverlay[];
  ticker?: SceneTicker;
};

export type ScenePlaylistTrackData = {
  title: string;
  artist?: string;
  album?: string;
  sourceFile: string;
  key: string;
  src: string;
  durationSeconds: number;
};

export type ScenePlaylistData = {
  name: string;
  folder: string;
  playbackMode?: "ordered" | "deterministic-random";
  shuffleSeed?: string;
  totalDurationSeconds: number;
  tracks: ScenePlaylistTrackData[];
};

const mediaBaseUrl = process.env.NEXT_PUBLIC_MEDIA_BASE_URL ?? "/media";
const roomVideoVersion = "20260702-room-7-1";
const roomAudioVersion = "20260702-room-7-1";

const mediaUrl = (path: string) =>
  `${mediaBaseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;

const roomVideoUrl = (path: string) => mediaUrl(`${path}?v=${roomVideoVersion}`);
const roomAudioUrl = (path: string) => mediaUrl(`${path}?v=${roomAudioVersion}`);

export type SceneHotspotEntry =
  | Hotspot[]
  | Partial<Record<SceneViewport, Hotspot[]>>;
export type SceneHotspotsData = Record<SceneSlug, SceneHotspotEntry>;

const sceneHotspots = sceneHotspotsData as SceneHotspotsData;
const scenePlaylists = scenePlaylistsData as Record<SceneSlug, ScenePlaylistData>;

function getSceneHotspotVariants(
  slug: SceneSlug,
  hotspots: SceneHotspotsData,
): Record<SceneViewport, Hotspot[]> {
  const hotspotEntry = hotspots[slug];

  if (Array.isArray(hotspotEntry)) {
    return {
      desktop: hotspotEntry,
      mobile: hotspotEntry,
    };
  }

  return {
    desktop: hotspotEntry.desktop ?? hotspotEntry.mobile ?? [],
    mobile: hotspotEntry.mobile ?? hotspotEntry.desktop ?? [],
  };
}

function createSceneVideoSource(
  path: string,
  width: number,
  height: number,
  sourceFile: string,
): SceneVideoSource {
  return {
    src: roomVideoUrl(path),
    width,
    height,
    sourceFile,
  };
}

export function getSceneVideoSource(
  scene: Scene,
  viewport: SceneViewport,
): SceneVideoSource {
  return scene.video.sources?.[viewport] ?? scene.video;
}

function formatTrackTitle(title: string) {
  return title.replace(/([A-Za-z])_s\b/g, "$1's");
}

function getPlaylistTracks(
  playlists: Record<SceneSlug, ScenePlaylistData>,
  slug: SceneSlug,
) {
  return playlists[slug].tracks.map((track) => ({
    title: formatTrackTitle(track.title),
    ...(track.artist ? { artist: track.artist } : {}),
    ...(track.album ? { album: track.album } : {}),
    sourceFile: track.sourceFile,
    key: track.key,
    src: mediaUrl(track.src),
    durationSeconds: track.durationSeconds,
  }));
}

export function createScenes(
  playlists: Record<SceneSlug, ScenePlaylistData> = scenePlaylists,
  hotspots: SceneHotspotsData = sceneHotspots,
  settings: SiteSettingsManifest = createStaticSiteSettingsManifest(),
): Record<SceneSlug, Scene> {
  const constructionVideoSources = {
    desktop: createSceneVideoSource(
      "rooms/construction-desktop.mp4",
      1080,
      1080,
      "assets/rooms-20260516/compressed/construction-desktop-1080-crf24.mp4",
    ),
    mobile: createSceneVideoSource(
      "rooms/construction-mobile.mp4",
      1080,
      1920,
      "assets/rooms-20260516/compressed/construction-mobile-1080x1920-crf24.mp4",
    ),
  };
  const hqVideoSources = {
    desktop: createSceneVideoSource(
      "rooms/hq-desktop.mp4",
      1080,
      1080,
      "assets/rooms-20260516/compressed/hq-desktop-1080-crf24.mp4",
    ),
    mobile: createSceneVideoSource(
      "rooms/hq-mobile.mp4",
      1080,
      1920,
      "assets/rooms-20260516/compressed/hq-mobile-1080x1920-crf24.mp4",
    ),
  };
  const tvRoomVideoSources = {
    desktop: createSceneVideoSource(
      "rooms/tv-room-desktop.mp4",
      1080,
      1080,
      "assets/rooms-20260702/compressed/tv-room-desktop-1080-crf24.mp4",
    ),
    mobile: createSceneVideoSource(
      "rooms/tv-room-mobile.mp4",
      1080,
      1920,
      "assets/rooms-20260702/compressed/tv-room-mobile-1080x1920-crf24.mp4",
    ),
  };
  const holeRoomVideoSources = {
    desktop: createSceneVideoSource(
      "rooms/hole-room-desktop.mp4",
      1080,
      810,
      "assets/rooms-20260702/compressed/hole-room-desktop-1080x810-crf24.mp4",
    ),
    mobile: createSceneVideoSource(
      "rooms/hole-room-mobile.mp4",
      1080,
      1920,
      "assets/rooms-20260702/compressed/hole-room-mobile-1080x1920-crf24.mp4",
    ),
  };
  const constructionHotspots = getSceneHotspotVariants("construction", hotspots);
  const hqHotspots = getSceneHotspotVariants("hq", hotspots);
  const tvRoomHotspots = getSceneHotspotVariants("tv-room", hotspots);
  const holeRoomHotspots = getSceneHotspotVariants("hole-room", hotspots);

  return {
    construction: {
      slug: "construction",
      title: "Construction Zone",
      video: {
        ...constructionVideoSources.desktop,
        sources: constructionVideoSources,
        durationSeconds: 810.025,
        sync: {
          enabled: true,
        },
        audio: {
          enabled: true,
          volume: settings.rooms.construction.roomAudioVolume,
          src: roomAudioUrl("rooms/construction-audio.m4a"),
          sourceFile: "assets/rooms-20260516/audio/construction-audio.m4a",
        },
      },
      playlist: {
        enabled: true,
        name: playlists.construction.name,
        folder: playlists.construction.folder,
        volume: settings.rooms.construction.playlistVolume,
        sync: {
          enabled: true,
        },
        tracks: getPlaylistTracks(playlists, "construction"),
      },
      hotspots: constructionHotspots.desktop,
      hotspotVariants: constructionHotspots,
      overlays: [],
      ticker: {
        messages: ["Paper Planet", "Under Construction", "Coming Fall 2026"],
        position: "center",
        cycleSeconds: 102,
        messageIntervalSeconds: 24,
      },
    },
    hq: {
      slug: "hq",
      title: "Paper Planet HQ",
      video: {
        ...hqVideoSources.desktop,
        sources: hqVideoSources,
        durationSeconds: 237.142,
        sync: {
          enabled: true,
        },
        audio: {
          enabled: true,
          volume: settings.rooms.hq.roomAudioVolume,
          src: roomAudioUrl("rooms/hq-audio.m4a"),
          sourceFile: "assets/rooms-20260516/audio/hq-audio.m4a",
        },
      },
      playlist: {
        enabled: true,
        name: playlists.hq.name,
        folder: playlists.hq.folder,
        volume: settings.rooms.hq.playlistVolume,
        sync: {
          enabled: true,
        },
        tracks: getPlaylistTracks(playlists, "hq"),
      },
      hotspots: hqHotspots.desktop,
      hotspotVariants: hqHotspots,
      overlays: [
        {
          id: "hq-back-button",
          label: "Back to Construction Zone",
          src: "/icons/back_button_2.png",
          zIndex: 100,
          position: {
            x: 3,
            y: 3,
            width: 12,
          },
          action: {
            type: "navigate",
            target: "construction",
          },
        },
      ],
    },
    "tv-room": {
      slug: "tv-room",
      title: "Paper Planet TV Room",
      video: {
        ...tvRoomVideoSources.desktop,
        sources: tvRoomVideoSources,
        durationSeconds: 126.792,
        sync: {
          enabled: true,
        },
        audio: {
          enabled: true,
          volume: settings.rooms["tv-room"].roomAudioVolume,
          src: roomAudioUrl("rooms/tv-room-audio.m4a"),
          sourceFile: "assets/rooms-20260702/audio/tv-room-audio.m4a",
        },
      },
      playlist: {
        enabled: true,
        name: playlists["tv-room"].name,
        folder: playlists["tv-room"].folder,
        volume: settings.rooms["tv-room"].playlistVolume,
        sync: {
          enabled: true,
        },
        tracks: getPlaylistTracks(playlists, "tv-room"),
      },
      hotspots: tvRoomHotspots.desktop,
      hotspotVariants: tvRoomHotspots,
      overlays: [
        {
          id: "tv-room-back-button",
          label: "Back to Construction Zone",
          src: "/icons/back_button_2.png",
          zIndex: 100,
          position: {
            x: 3,
            y: 3,
            width: 12,
          },
          action: {
            type: "navigate",
            target: "construction",
          },
        },
      ],
    },
    "hole-room": {
      slug: "hole-room",
      title: "Paper Planet Hole Room",
      video: {
        ...holeRoomVideoSources.desktop,
        sources: holeRoomVideoSources,
        durationSeconds: 192.083,
        sync: {
          enabled: true,
        },
        audio: {
          enabled: true,
          volume: settings.rooms["hole-room"].roomAudioVolume,
          src: roomAudioUrl("rooms/hole-room-audio.m4a"),
          sourceFile: "assets/rooms-20260702/audio/hole-room-audio.m4a",
        },
      },
      playlist: {
        enabled: true,
        name: playlists["hole-room"].name,
        folder: playlists["hole-room"].folder,
        volume: settings.rooms["hole-room"].playlistVolume,
        sync: {
          enabled: true,
        },
        tracks: getPlaylistTracks(playlists, "hole-room"),
      },
      hotspots: holeRoomHotspots.desktop,
      hotspotVariants: holeRoomHotspots,
      overlays: [
        {
          id: "hole-room-back-button",
          label: "Back to Construction Zone",
          src: "/icons/back_button_2.png",
          zIndex: 100,
          position: {
            x: 3,
            y: 3,
            width: 12,
          },
          action: {
            type: "navigate",
            target: "construction",
          },
        },
      ],
    },
  };
}

export const scenes: Record<SceneSlug, Scene> = createScenes();

export const sceneSlugs = Object.keys(scenes) as SceneSlug[];

export function getScene(slug: string): Scene | undefined {
  return scenes[slug as SceneSlug];
}
