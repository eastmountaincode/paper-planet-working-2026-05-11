import sceneHotspotsData from "./scene-hotspots.json";
import scenePlaylistsData from "./scene-playlists.json";

export type SceneSlug = "construction" | "hq";

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

export type SceneTicker = {
  text: string;
  position: "bottom";
  speedPixelsPerSecond: number;
  epochOffsetSeconds?: number;
};

export type Scene = {
  slug: SceneSlug;
  title: string;
  video: {
    src: string;
    width: number;
    height: number;
    durationSeconds: number;
    sourceFile: string;
    sync?: {
      enabled: boolean;
      epochOffsetSeconds?: number;
    };
    audio?: {
      enabled: boolean;
      volume: number;
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
      src: string;
      durationSeconds: number;
    }[];
  };
  hotspots: Hotspot[];
  overlays?: SceneIconOverlay[];
  ticker?: SceneTicker;
};

export type ScenePlaylistTrackData = {
  title: string;
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
const roomVideoVersion = "20260525-cors";

const mediaUrl = (path: string) =>
  `${mediaBaseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;

const roomVideoUrl = (path: string) => mediaUrl(`${path}?v=${roomVideoVersion}`);

const sceneHotspots = sceneHotspotsData as Record<SceneSlug, Hotspot[]>;
const scenePlaylists = scenePlaylistsData as Record<SceneSlug, ScenePlaylistData>;

function getPlaylistTracks(
  playlists: Record<SceneSlug, ScenePlaylistData>,
  slug: SceneSlug,
) {
  return playlists[slug].tracks.map((track) => ({
    title: track.album ? `${track.album} - ${track.title}` : track.title,
    src: mediaUrl(track.src),
    durationSeconds: track.durationSeconds,
  }));
}

export function createScenes(
  playlists: Record<SceneSlug, ScenePlaylistData> = scenePlaylists,
): Record<SceneSlug, Scene> {
  return {
    construction: {
      slug: "construction",
      title: "Construction Zone",
      video: {
        src: roomVideoUrl("rooms/construction.mp4"),
        width: 1080,
        height: 1080,
        durationSeconds: 810.069,
        sourceFile:
          "assets/Phase 1 - Construction Zone/ROOMS/Paper Planet Construction - V3.mp4",
        sync: {
          enabled: true,
        },
        audio: {
          enabled: true,
          volume: 0.8,
        },
      },
      playlist: {
        enabled: true,
        name: playlists.construction.name,
        folder: playlists.construction.folder,
        volume: 0.65,
        sync: {
          enabled: true,
        },
        tracks: getPlaylistTracks(playlists, "construction"),
      },
      hotspots: sceneHotspots.construction,
      overlays: [],
      ticker: {
        text: "Paper Planet Under Construction Coming Fall 2026",
        position: "bottom",
        speedPixelsPerSecond: 44,
      },
    },
    hq: {
      slug: "hq",
      title: "Paper Planet HQ",
      video: {
        src: roomVideoUrl("rooms/hq.mp4"),
        width: 1080,
        height: 1080,
        durationSeconds: 237.205,
        sourceFile:
          "assets/Phase 1 - Construction Zone/ROOMS/Paper Planet HQ - V3.mp4",
        sync: {
          enabled: true,
        },
        audio: {
          enabled: true,
          volume: 0.8,
        },
      },
      playlist: {
        enabled: true,
        name: playlists.hq.name,
        folder: playlists.hq.folder,
        volume: 0.65,
        sync: {
          enabled: true,
        },
        tracks: getPlaylistTracks(playlists, "hq"),
      },
      hotspots: sceneHotspots.hq,
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
  };
}

export const scenes: Record<SceneSlug, Scene> = createScenes();

export const sceneSlugs = Object.keys(scenes) as SceneSlug[];

export function getScene(slug: string): Scene | undefined {
  return scenes[slug as SceneSlug];
}
