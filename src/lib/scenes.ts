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
  };
  playlist?: {
    name: string;
    folder: string;
  };
  hotspots: Hotspot[];
};

const mediaBaseUrl = process.env.NEXT_PUBLIC_MEDIA_BASE_URL ?? "/media";

const mediaUrl = (path: string) =>
  `${mediaBaseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;

export const scenes: Record<SceneSlug, Scene> = {
  construction: {
    slug: "construction",
    title: "Construction Zone",
    video: {
      src: mediaUrl("rooms/construction.mp4"),
      width: 1080,
      height: 1080,
      durationSeconds: 810.069,
      sourceFile:
        "assets/Phase 1 - Construction Zone/ROOMS/Paper Planet Construction - V3.mp4",
      sync: {
        enabled: true,
      },
    },
    playlist: {
      name: "HOME - Construction Zone",
      folder:
        "assets/Phase 1 - Construction Zone/Music Playlists/HOME - (Construction Zone)",
    },
    hotspots: [
      {
        id: "hq-building",
        label: "HQ building",
        shape: "rect",
        rect: {
          x: 57,
          y: 18,
          width: 27,
          height: 35,
        },
        action: {
          type: "navigate",
          target: "hq",
        },
      },
    ],
  },
  hq: {
    slug: "hq",
    title: "Paper Planet HQ",
    video: {
      src: mediaUrl("rooms/hq.mp4"),
      width: 1080,
      height: 1080,
      durationSeconds: 237.205,
      sourceFile:
        "assets/Phase 1 - Construction Zone/ROOMS/Paper Planet HQ - V3.mp4",
      sync: {
        enabled: true,
      },
    },
    playlist: {
      name: "HQ",
      folder: "assets/Phase 1 - Construction Zone/Music Playlists/HQ",
    },
    hotspots: [
      {
        id: "chair-contact",
        label: "Contact Paper Planet",
        shape: "rect",
        rect: {
          x: 40,
          y: 61,
          width: 18,
          height: 24,
        },
        action: {
          type: "mailto",
          email: "paperplanetrecords@gmail.com",
          subject: "Paper Planet Records",
        },
      },
    ],
  },
};

export const sceneSlugs = Object.keys(scenes) as SceneSlug[];

export function getScene(slug: string): Scene | undefined {
  return scenes[slug as SceneSlug];
}
