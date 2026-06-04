"use client";

import { useSearchParams } from "next/navigation";
import type { MouseEvent } from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useEntryState } from "@/components/entry-provider";
import type {
  Hotspot,
  Scene,
  SceneSlug,
  SceneTicker,
  SceneViewport,
} from "@/lib/scenes";
import {
  createScenes,
  getSceneVideoSource,
  sceneSlugs,
  sceneViewports,
  scenes as staticScenes,
} from "@/lib/scenes";
import {
  getInitialPlaylistPosition,
  getScenePlaylistPlayback,
  getSyncedPlaylistPositionForTracks,
  type SyncedPlaylistPosition,
} from "@/lib/playlist-sync";
import {
  normalizePlaylistManifest,
  playlistManifestToScenePlaylists,
} from "@/lib/playlist-manifest";
import {
  hotspotManifestToSceneHotspots,
  normalizeHotspotManifest,
} from "@/lib/hotspot-manifest";
import { normalizeSiteSettingsManifest } from "@/lib/site-settings";
import { EnterArtworkButton } from "@/components/enter-artwork-button";

type RoomExperienceProps = {
  scene: Scene;
};

type PointerPosition = {
  x: number;
  y: number;
};

type StageTransform = {
  scale: number;
  x: number;
  y: number;
};

type StagePointer = {
  x: number;
  y: number;
};

type StageGesture = {
  pointers: Map<number, StagePointer>;
  startCenter: StagePointer | null;
  startDistance: number;
  startTransform: StageTransform;
};

type PlaylistTrack = NonNullable<Scene["playlist"]>["tracks"][number];

type PlaylistMetadataToast = {
  id: number;
  title: string;
  artist?: string;
  album?: string;
  frame: PlaylistMetadataFrame;
};

type PlaylistMetadataFrame = {
  path: string;
};

const devOutlineClasses = [
  "outline-cyan-400/80",
  "outline-fuchsia-400/80",
  "outline-lime-400/80",
  "outline-amber-400/80",
  "outline-sky-400/80",
  "outline-rose-400/80",
];

function classNames(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function devOutline(enabled: boolean, level: number) {
  if (!enabled) {
    return "";
  }

  return classNames(
    "outline outline-1 outline-offset-[-1px]",
    devOutlineClasses[level % devOutlineClasses.length],
  );
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
}

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof Element
    ? Boolean(
        target.closest(
          "a, button, input, select, textarea, [role='button'], [data-stage-interactive='true']",
        ),
      )
    : false;
}

function getHotspotZIndex(hotspot: Hotspot) {
  return hotspot.zIndex ?? 0;
}

function sortHotspotsByZOrder(hotspots: Hotspot[]) {
  return [...hotspots].sort(
    (a, b) => getHotspotZIndex(a) - getHotspotZIndex(b),
  );
}

function getPreferredSceneViewport(): SceneViewport {
  if (typeof window === "undefined") {
    return "desktop";
  }

  return window.innerWidth < 768 || window.innerWidth / window.innerHeight < 0.75
    ? "mobile"
    : "desktop";
}

function isExpectedMediaInterruption(error: unknown) {
  if (!(error instanceof DOMException)) {
    return false;
  }

  return error.name === "AbortError";
}

function getMediaErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

type BottomTicker = Extract<SceneTicker, { position: "bottom" }>;
type CenterTicker = Extract<SceneTicker, { position: "center" }>;

type SyncedTickerProps = {
  ticker: BottomTicker;
  devBorders: boolean;
};

type CenterTickerProps = {
  ticker: CenterTicker;
  devBorders: boolean;
};

type SceneTickerOverlayProps = {
  ticker: SceneTicker;
  devBorders: boolean;
};

const TICKER_GAP_PIXELS = 96;
const ROOM_TRANSITION_MS = 200;
const ROOT_HREF = "/";
const DEFAULT_STAGE_TRANSFORM: StageTransform = { scale: 1, x: 0, y: 0 };
const MAX_STAGE_SCALE = 3;
const WHEEL_ZOOM_SPEED = 0.006;
const WHEEL_LINE_PIXELS = 16;
const PLAYLIST_METADATA_TOAST_MS = 6200;
const LOADING_PREVIEW_MS = 3200;
const ROOM_AUDIO_PERIODIC_SYNC_THRESHOLD_SECONDS = 6;
const ROOM_AUDIO_IMMEDIATE_SYNC_THRESHOLD_SECONDS = 0.5;
const LOADING_GIF_SRC = "/loading/paper-planet-loading.gif";
const helperUnlockStorageKey = "paper-planet-helper-unlocked";
const helperUnlockParam = "pp_debug";
const helperUnlockValue = "paperplanet";
const helperUnlockedByDefault = process.env.NODE_ENV !== "production";

type NativeGestureEvent = Event & {
  clientX?: number;
  clientY?: number;
  scale?: number;
};

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getPointerDistance(first: StagePointer, second: StagePointer) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function getPointerCenter(first: StagePointer, second: StagePointer) {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };
}

function clampStageTransform(
  transform: StageTransform,
  rect: DOMRect | null,
): StageTransform {
  const scale = clamp(transform.scale, 1, MAX_STAGE_SCALE);

  if (!rect || scale <= 1.001) {
    return DEFAULT_STAGE_TRANSFORM;
  }

  const maxX = (rect.width * (scale - 1)) / 2;
  const maxY = (rect.height * (scale - 1)) / 2;

  return {
    scale,
    x: clamp(transform.x, -maxX, maxX),
    y: clamp(transform.y, -maxY, maxY),
  };
}

function getStageZoomTransform(
  startTransform: StageTransform,
  startPoint: StagePointer,
  currentPoint: StagePointer,
  nextScale: number,
): StageTransform {
  const scale = clamp(nextScale, 1, MAX_STAGE_SCALE);
  const startScale = startTransform.scale || 1;
  const contentX = (startPoint.x - startTransform.x) / startScale;
  const contentY = (startPoint.y - startTransform.y) / startScale;

  return {
    scale,
    x: currentPoint.x - contentX * scale,
    y: currentPoint.y - contentY * scale,
  };
}

function getNormalizedWheelDelta(event: WheelEvent) {
  const multiplier =
    event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? WHEEL_LINE_PIXELS
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? window.innerHeight
        : 1;

  return {
    x: event.deltaX * multiplier,
    y: event.deltaY * multiplier,
  };
}

function formatPlaylistTrackDisplayTitle(track: PlaylistTrack) {
  return track.album ? `${track.album} - ${track.title}` : track.title;
}

function hashString(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createSeededRandom(seed: number) {
  let value = seed || 1;

  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);

    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function createMetadataFramePath(seed: number) {
  const random = createSeededRandom(seed);
  const jitter = (amount: number) => (random() * 2 - 1) * amount;
  const points = [
    { x: 3 + jitter(1.7), y: 9 + jitter(2.1) },
    { x: 17 + jitter(2.8), y: 5 + jitter(1.6) },
    { x: 38 + jitter(2.4), y: 4 + jitter(1.4) },
    { x: 62 + jitter(2.4), y: 4 + jitter(1.4) },
    { x: 84 + jitter(2.8), y: 5 + jitter(1.6) },
    { x: 97 + jitter(1.7), y: 9 + jitter(2.1) },
    { x: 99 + jitter(1.4), y: 28 + jitter(2.8) },
    { x: 98 + jitter(1.5), y: 56 + jitter(2.8) },
    { x: 97 + jitter(1.7), y: 90 + jitter(2.1) },
    { x: 82 + jitter(2.8), y: 96 + jitter(1.7) },
    { x: 58 + jitter(2.4), y: 97 + jitter(1.3) },
    { x: 38 + jitter(2.4), y: 97 + jitter(1.3) },
    { x: 16 + jitter(2.8), y: 96 + jitter(1.7) },
    { x: 3 + jitter(1.7), y: 90 + jitter(2.1) },
    { x: 1 + jitter(1.4), y: 61 + jitter(2.8) },
    { x: 2 + jitter(1.5), y: 31 + jitter(2.8) },
  ];
  const midpoint = (first: (typeof points)[number], second: (typeof points)[number]) => ({
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  });
  const start = midpoint(points.at(-1) ?? points[0], points[0]);
  const curves = points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    const end = midpoint(point, next);

    return `Q ${point.x.toFixed(2)} ${point.y.toFixed(2)} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
  });

  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} ${curves.join(" ")} Z`;
}

function createPlaylistMetadataFrame(seedText: string): PlaylistMetadataFrame {
  return {
    path: createMetadataFramePath(hashString(seedText)),
  };
}

function TickerText({ text }: { text: string }) {
  const characters = Array.from(text);

  return (
    <>
      {characters.map((character, index) => (
        <span
          // Every ticker copy must have identical wave phase for a seamless wrap.
          key={`${character}-${index}`}
          className="paper-planet-wave-letter inline-block"
          style={{ animationDelay: `${index * -0.045}s` }}
        >
          {character === " " ? "\u00A0" : character}
        </span>
      ))}
    </>
  );
}

function CenterTickerText({ text }: { text: string }) {
  return <TickerText text={text} />;
}

function SyncedTicker({ ticker, devBorders }: SyncedTickerProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const firstCopyRef = useRef<HTMLSpanElement>(null);
  const secondCopyRef = useRef<HTMLSpanElement>(null);
  const [copyCount, setCopyCount] = useState(4);

  useEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    const firstCopy = firstCopyRef.current;
    const secondCopy = secondCopyRef.current;

    if (!viewport || !track || !firstCopy || !secondCopy) {
      return;
    }

    let animationFrame = 0;
    let itemWidth = secondCopy.offsetLeft - firstCopy.offsetLeft;

    const measure = () => {
      itemWidth = secondCopy.offsetLeft - firstCopy.offsetLeft;
      const nextCopyCount = Math.max(
        3,
        Math.ceil(viewport.clientWidth / Math.max(itemWidth, 1)) + 3,
      );

      setCopyCount((current) =>
        current === nextCopyCount ? current : nextCopyCount,
      );
    };

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(viewport);
    resizeObserver.observe(firstCopy);
    resizeObserver.observe(secondCopy);
    measure();

    const tick = () => {
      const seconds = Date.now() / 1000 + (ticker.epochOffsetSeconds ?? 0);
      const offset =
        (seconds * ticker.speedPixelsPerSecond) % Math.max(itemWidth, 1);

      track.style.transform = `translate3d(${-offset}px, 0, 0)`;
      animationFrame = window.requestAnimationFrame(tick);
    };

    tick();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
    };
  }, [ticker.epochOffsetSeconds, ticker.speedPixelsPerSecond]);

  return (
    <div
      ref={viewportRef}
      className={classNames(
        "pointer-events-none absolute inset-x-0 bottom-0 z-20 overflow-hidden py-1 text-white sm:py-2",
        devOutline(devBorders, 5),
      )}
      aria-label={ticker.text}
    >
      <div
        ref={trackRef}
        className="flex w-max whitespace-nowrap will-change-transform"
      >
        {Array.from({ length: copyCount }).map((_, index) => (
          <span
            key={index}
            ref={
              index === 0
                ? firstCopyRef
                : index === 1
                  ? secondCopyRef
                  : undefined
            }
            className="font-paper-planet block shrink-0 text-3xl leading-none text-white [text-shadow:0_2px_8px_rgba(0,0,0,0.95)] sm:text-5xl"
            style={{ marginRight: TICKER_GAP_PIXELS }}
            aria-hidden={index > 0}
          >
            <TickerText text={ticker.text} />
          </span>
        ))}
      </div>
    </div>
  );
}

function CenterTicker({ ticker, devBorders }: CenterTickerProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const messageInterval =
    ticker.messageIntervalSeconds ?? ticker.cycleSeconds / ticker.messages.length;

  useEffect(() => {
    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    let animationFrame = 0;
    let viewportWidth = viewport.clientWidth;
    let messageWidths = ticker.messages.map(
      (_, index) => messageRefs.current[index]?.offsetWidth ?? 0,
    );
    const cycleSeconds = Math.max(ticker.cycleSeconds, 1);
    const intervalSeconds = Math.max(messageInterval, 0.1);
    const travelSeconds = Math.min(
      cycleSeconds,
      Math.max(1, intervalSeconds * 0.825),
    );

    const measure = () => {
      viewportWidth = viewport.clientWidth;
      messageWidths = ticker.messages.map(
        (_, index) => messageRefs.current[index]?.offsetWidth ?? 0,
      );
    };

    const tick = () => {
      const seconds = Date.now() / 1000 + (ticker.epochOffsetSeconds ?? 0);

      ticker.messages.forEach((_, index) => {
        const element = messageRefs.current[index];

        if (!element) {
          return;
        }

        const phase = positiveModulo(
          seconds - index * intervalSeconds,
          cycleSeconds,
        );

        if (phase > travelSeconds) {
          element.style.opacity = "0";
          element.style.visibility = "hidden";
          return;
        }

        const progress = phase / travelSeconds;
        const startX = viewportWidth * 1.1;
        const endX = -(messageWidths[index] || element.offsetWidth) * 1.05;
        const x = startX + (endX - startX) * progress;
        const rotation = -1.4 + 2.4 * progress;

        element.style.opacity = "1";
        element.style.visibility = "visible";
        element.style.transform = `translate3d(${x.toFixed(
          2,
        )}px, -50%, 0) rotate(${rotation.toFixed(3)}deg)`;
      });

      animationFrame = window.requestAnimationFrame(tick);
    };

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(viewport);
    messageRefs.current.forEach((element) => {
      if (element) {
        resizeObserver.observe(element);
      }
    });

    measure();
    tick();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
    };
  }, [
    messageInterval,
    ticker.cycleSeconds,
    ticker.epochOffsetSeconds,
    ticker.messages,
  ]);

  return (
    <div
      ref={viewportRef}
      className={classNames(
        "pointer-events-none absolute inset-x-0 top-[58%] z-20 h-[34dvh] min-h-36 -translate-y-1/2 overflow-hidden text-white",
        devOutline(devBorders, 5),
      )}
      aria-label={ticker.messages.join(" ")}
    >
      {ticker.messages.map((message, index) => (
        <div
          key={message}
          ref={(element) => {
            messageRefs.current[index] = element;
          }}
          className="absolute left-0 top-1/2 w-max whitespace-nowrap font-paper-planet text-[clamp(2.6rem,9.2vw,7.4rem)] leading-none text-white opacity-0 will-change-transform"
          style={{
            visibility: "hidden",
          }}
          aria-hidden={index > 0}
        >
          <CenterTickerText text={message} />
        </div>
      ))}
    </div>
  );
}

function SceneTickerOverlay({ ticker, devBorders }: SceneTickerOverlayProps) {
  return ticker.position === "center" ? (
    <CenterTicker ticker={ticker} devBorders={devBorders} />
  ) : (
    <SyncedTicker ticker={ticker} devBorders={devBorders} />
  );
}

export function RoomExperience({ scene: initialScene }: RoomExperienceProps) {
  const [runtimeScenes, setRuntimeScenes] = useState(staticScenes);
  const [scene, setActiveScene] = useState(initialScene);
  const [sceneViewport, setSceneViewport] = useState<SceneViewport | null>(null);
  const [visibleSceneViewport, setVisibleSceneViewport] =
    useState<SceneViewport | null>(null);
  const searchParams = useSearchParams();
  const {
    hasEntered,
    markEntered,
    playRoomPlaylistTrack,
    playlistGain,
    playlistStatus,
    primeRoomPlaylistTrack,
    resumeRoomPlaylistAudio,
    setActivePlaylistRoom,
    setRoomPlaylistAudioLevel,
    setVideoAudioLevel,
    unlockRoomPlaylists,
    videoGain,
  } = useEntryState();
  const videoElementsRef = useRef<Record<SceneViewport, HTMLVideoElement | null>>(
    {
      desktop: null,
      mobile: null,
    },
  );
  const roomAudioRef = useRef<HTMLAudioElement>(null);
  const lastVideoTimeRef = useRef(0);
  const sceneViewportRef = useRef<SceneViewport | null>(null);
  const visibleSceneViewportRef = useRef<SceneViewport | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneSlugRef = useRef(initialScene.slug);
  const helperParamValue = searchParams.get(helperUnlockParam);
  const helperUnlockedByUrl = helperParamValue === helperUnlockValue;
  const helperLockedByUrl = helperParamValue === "0";
  const helperInitiallyUnlocked = helperUnlockedByDefault || helperUnlockedByUrl;
  const [devPanelUnlocked, setDevPanelUnlocked] = useState(
    helperInitiallyUnlocked,
  );
  const debugHotspots =
    devPanelUnlocked &&
    (searchParams.get("hotspots") === "1" ||
      searchParams.get("debug") === "1" ||
      helperUnlockedByUrl);
  const [pointerPosition, setPointerPosition] =
    useState<PointerPosition | null>(null);
  const [devPanelOpen, setDevPanelOpen] = useState(helperInitiallyUnlocked);
  const [devBordersEnabled, setDevBordersEnabled] = useState(
    helperUnlockedByUrl && searchParams.get("dev") === "1",
  );
  const devBorders = devBordersEnabled && helperUnlockedByUrl;
  const [videoAudioMuted, setVideoAudioMuted] = useState(false);
  const [playlistAudioMuted, setPlaylistAudioMuted] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [playlistTrackIndex, setPlaylistTrackIndex] = useState(0);
  const [playlistStartTime, setPlaylistStartTime] = useState(0);
  const [metadataToast, setMetadataToast] =
    useState<PlaylistMetadataToast | null>(null);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [loadingPreviewVisible, setLoadingPreviewVisible] = useState(false);
  const fadeOutInProgressRef = useRef(false);
  const navigationIdRef = useRef(0);
  const metadataToastIdRef = useRef(0);
  const metadataToastTimeoutRef = useRef<number | null>(null);
  const loadingPreviewTimeoutRef = useRef<number | null>(null);
  const lastMetadataToastKeyRef = useRef<string | null>(null);
  const playlistAudioActiveRef = useRef(false);
  const playlistStatusRef = useRef(playlistStatus);
  const [isExiting, setIsExiting] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [audioTransitionMuted, setAudioTransitionMuted] = useState(false);
  const [videoElementStatus, setVideoElementStatus] = useState("pending");
  const [roomAudioElementStatus, setRoomAudioElementStatus] =
    useState("pending");
  const [stageTransform, setStageTransform] = useState<StageTransform>(
    DEFAULT_STAGE_TRANSFORM,
  );
  const stageTransformRef = useRef(DEFAULT_STAGE_TRANSFORM);
  const stageGestureRef = useRef<StageGesture>({
    pointers: new Map(),
    startCenter: null,
    startDistance: 0,
    startTransform: DEFAULT_STAGE_TRANSFORM,
  });
  const nativeGestureStartRef = useRef<{
    point: StagePointer;
    transform: StageTransform;
  } | null>(null);

  const resolvedSceneViewport =
    visibleSceneViewport ?? sceneViewport ?? "desktop";
  const activeVideoSource = useMemo(
    () => getSceneVideoSource(scene, resolvedSceneViewport),
    [resolvedSceneViewport, scene],
  );
  const activeHotspots =
    scene.hotspotVariants?.[resolvedSceneViewport] ?? scene.hotspots;
  const aspectRatio = useMemo(
    () => `${activeVideoSource.width} / ${activeVideoSource.height}`,
    [activeVideoSource.height, activeVideoSource.width],
  );
  const stageFrameStyle = useMemo(
    () => {
      const sourceRatio = activeVideoSource.width / activeVideoSource.height;

      if (resolvedSceneViewport === "mobile") {
        return {
          aspectRatio,
          height: `min(100dvh, calc(100vw / ${sourceRatio}))`,
          maxWidth: "none",
          width: `min(100vw, calc(100dvh * ${sourceRatio}))`,
        };
      }

      return {
        aspectRatio,
        maxWidth: `min(100%, calc((100dvh - 2.5rem) * ${sourceRatio}))`,
      };
    },
    [
      activeVideoSource.height,
      activeVideoSource.width,
      aspectRatio,
      resolvedSceneViewport,
    ],
  );

  const syncedPlayback = scene.video.sync?.enabled ?? false;
  const videoAudioEnabled = scene.video.audio?.enabled ?? false;
  const videoVolume = scene.video.audio?.volume ?? 0.8;
  const roomAudioSource = scene.video.audio?.src ?? "";
  const playlistEnabled = scene.playlist?.enabled ?? false;
  const playlistTracks = useMemo(
    () => scene.playlist?.tracks ?? [],
    [scene.playlist?.tracks],
  );
  const playlistSyncEnabled = scene.playlist?.sync?.enabled ?? false;
  const playlistEpochOffset = scene.playlist?.sync?.epochOffsetSeconds ?? 0;
  const playlistVolume = scene.playlist?.volume ?? 0.65;
  const activePlaylistTrack = playlistTracks[playlistTrackIndex] ?? null;
  const videoAudioActive =
    hasEntered && videoAudioEnabled && !videoAudioMuted && !audioTransitionMuted;
  const playlistAudioActive =
    hasEntered &&
    playlistEnabled &&
    !playlistAudioMuted &&
    !audioTransitionMuted;

  useEffect(() => {
    playlistAudioActiveRef.current = playlistAudioActive;
  }, [playlistAudioActive]);

  useEffect(() => {
    playlistStatusRef.current = playlistStatus;
  }, [playlistStatus]);

  useEffect(() => {
    if (helperUnlockedByDefault) {
      return undefined;
    }

    const syncHelperUnlock = window.setTimeout(() => {
      if (helperLockedByUrl) {
        window.localStorage.removeItem(helperUnlockStorageKey);
        setDevPanelUnlocked(false);
        setDevPanelOpen(false);
        setDevBordersEnabled(false);
        return;
      }

      if (helperUnlockedByUrl) {
        window.localStorage.setItem(helperUnlockStorageKey, "1");
        setDevPanelUnlocked(true);
        setDevPanelOpen(true);
        return;
      }

      const storedUnlock =
        window.localStorage.getItem(helperUnlockStorageKey) === "1";

      setDevPanelUnlocked(storedUnlock);
    }, 0);

    return () => {
      window.clearTimeout(syncHelperUnlock);
    };
  }, [helperLockedByUrl, helperUnlockedByUrl]);

  const orderedHotspots = useMemo(
    () => sortHotspotsByZOrder(activeHotspots),
    [activeHotspots],
  );
  const transitionActive = isExiting || !videoReady;
  const loadingOverlayActive = transitionActive || loadingPreviewVisible;
  const helperShortcutEnabled = devPanelUnlocked && helperUnlockedByUrl;
  const stageTransformStyle = useMemo(
    () => ({
      transform: `translate3d(${stageTransform.x}px, ${stageTransform.y}px, 0) scale(${stageTransform.scale})`,
    }),
    [stageTransform.scale, stageTransform.x, stageTransform.y],
  );
  const showMetadataToast = useCallback(
    (title: string, album?: string, artist?: string) => {
      const nextId = metadataToastIdRef.current + 1;
      metadataToastIdRef.current = nextId;
      setMetadataToast({
        id: nextId,
        title,
        ...(artist ? { artist } : {}),
        ...(album ? { album } : {}),
        frame: createPlaylistMetadataFrame(
          `${nextId}:${title}:${artist ?? ""}:${album ?? ""}`,
        ),
      });

      if (metadataToastTimeoutRef.current) {
        window.clearTimeout(metadataToastTimeoutRef.current);
      }

      metadataToastTimeoutRef.current = window.setTimeout(() => {
        setMetadataToast((current) => (current?.id === nextId ? null : current));
        metadataToastTimeoutRef.current = null;
      }, PLAYLIST_METADATA_TOAST_MS);
    },
    [],
  );

  const showPlaylistMetadataToast = useCallback(
    (track: PlaylistTrack | null = activePlaylistTrack) => {
      if (!track) {
        return;
      }

      showMetadataToast(track.title, track.album, track.artist);
    },
    [activePlaylistTrack, showMetadataToast],
  );

  const showLoadingPreview = useCallback(() => {
    setLoadingPreviewVisible(true);

    if (loadingPreviewTimeoutRef.current) {
      window.clearTimeout(loadingPreviewTimeoutRef.current);
    }

    loadingPreviewTimeoutRef.current = window.setTimeout(() => {
      setLoadingPreviewVisible(false);
      loadingPreviewTimeoutRef.current = null;
    }, LOADING_PREVIEW_MS);
  }, []);

  const getSyncedTime = useCallback(
    () => {
      const offset = scene.video.sync?.epochOffsetSeconds ?? 0;
      const duration = scene.video.durationSeconds;

      return (((Date.now() / 1000 + offset) % duration) + duration) % duration;
    },
    [scene.video.durationSeconds, scene.video.sync?.epochOffsetSeconds],
  );

  const syncVideoElementTime = useCallback(
    (video: HTMLVideoElement) => {
      let targetTime: number | null = null;

      if (syncedPlayback) {
        targetTime = getSyncedTime();
      } else if (lastVideoTimeRef.current > 0) {
        targetTime = Math.min(
          lastVideoTimeRef.current,
          Number.isFinite(video.duration)
            ? Math.max(video.duration - 0.1, 0)
            : lastVideoTimeRef.current,
        );
      }

      if (targetTime === null || !Number.isFinite(targetTime)) {
        return false;
      }

      if (Math.abs(video.currentTime - targetTime) <= 1.5) {
        return false;
      }

      video.currentTime = targetTime;
      return true;
    },
    [getSyncedTime, syncedPlayback],
  );

  const syncRoomAudioElementTime = useCallback(
    (
      audio: HTMLAudioElement,
      thresholdSeconds = ROOM_AUDIO_PERIODIC_SYNC_THRESHOLD_SECONDS,
    ) => {
      if (audio.readyState < HTMLMediaElement.HAVE_METADATA) {
        return;
      }

      const duration = Number.isFinite(audio.duration)
        ? audio.duration
        : scene.video.durationSeconds;
      const targetTime = syncedPlayback
        ? getSyncedTime()
        : lastVideoTimeRef.current;

      if (!Number.isFinite(targetTime) || targetTime < 0) {
        return;
      }

      const safeTime =
        duration > 0
          ? Math.min(targetTime % duration, Math.max(duration - 0.05, 0))
          : targetTime;

      if (Math.abs(audio.currentTime - safeTime) > thresholdSeconds) {
        audio.currentTime = safeTime;
      }
    },
    [getSyncedTime, scene.video.durationSeconds, syncedPlayback],
  );

  useEffect(() => {
    stageTransformRef.current = stageTransform;
  }, [stageTransform]);

  useEffect(() => {
    sceneSlugRef.current = scene.slug;
  }, [scene.slug]);

  useEffect(() => {
    if (!creditsOpen) {
      return undefined;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCreditsOpen(false);
      }
    };

    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [creditsOpen]);

  useEffect(() => {
    visibleSceneViewportRef.current = visibleSceneViewport;
  }, [visibleSceneViewport, scene.slug]);

  const getVisibleVideoElement = useCallback(() => {
    const viewport = visibleSceneViewportRef.current ?? sceneViewportRef.current;

    return viewport ? videoElementsRef.current[viewport] : null;
  }, []);

  useEffect(() => {
    const updateSceneViewport = () => {
      const nextViewport = getPreferredSceneViewport();

      if (sceneViewportRef.current === nextViewport) {
        return;
      }

      sceneViewportRef.current = nextViewport;
      setSceneViewport(nextViewport);

      const visibleViewport = visibleSceneViewportRef.current;
      const nextVideo = videoElementsRef.current[nextViewport];

      if (!visibleViewport) {
        visibleSceneViewportRef.current = nextViewport;
        setVideoReady(false);
        setVisibleSceneViewport(nextViewport);
        return;
      }

      if (visibleViewport !== nextViewport && nextVideo) {
        syncVideoElementTime(nextVideo);
        nextVideo.volume = 0;
        nextVideo.muted = true;
        nextVideo.preload = "auto";
        void nextVideo.play().catch(() => undefined);

        if (nextVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          visibleSceneViewportRef.current = nextViewport;
          setVisibleSceneViewport(nextViewport);
        }
      }
    };

    const animationFrame = window.requestAnimationFrame(updateSceneViewport);
    window.addEventListener("resize", updateSceneViewport);
    window.addEventListener("orientationchange", updateSceneViewport);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", updateSceneViewport);
      window.removeEventListener("orientationchange", updateSceneViewport);
    };
  }, [syncVideoElementTime]);

  useEffect(() => {
    return () => {
      if (metadataToastTimeoutRef.current) {
        window.clearTimeout(metadataToastTimeoutRef.current);
      }

      if (loadingPreviewTimeoutRef.current) {
        window.clearTimeout(loadingPreviewTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let isCanceled = false;

    async function loadRuntimeManifests() {
      const [playlistResponse, hotspotResponse, settingsResponse] = await Promise.all([
        fetch("/api/playlists", { cache: "no-store" }).catch(() => null),
        fetch("/api/hotspots", { cache: "no-store" }).catch(() => null),
        fetch("/api/settings", { cache: "no-store" }).catch(() => null),
      ]);

      const playlistResult = playlistResponse?.ok
        ? ((await playlistResponse.json()) as { manifest?: unknown })
        : {};
      const hotspotResult = hotspotResponse?.ok
        ? ((await hotspotResponse.json()) as { manifest?: unknown })
        : {};
      const settingsResult = settingsResponse?.ok
        ? ((await settingsResponse.json()) as { manifest?: unknown })
        : {};
      const playlistManifest = normalizePlaylistManifest(playlistResult.manifest);
      const hotspotManifest = normalizeHotspotManifest(hotspotResult.manifest);
      const settingsManifest = normalizeSiteSettingsManifest(
        settingsResult.manifest,
      );
      const nextScenes = createScenes(
        playlistManifestToScenePlaylists(playlistManifest),
        hotspotManifestToSceneHotspots(hotspotManifest),
        settingsManifest,
      );
      const nextScene = nextScenes[sceneSlugRef.current] ?? nextScenes.construction;
      const nextPosition = getInitialPlaylistPosition(nextScene);

      if (!isCanceled) {
        setRuntimeScenes(nextScenes);
        setActiveScene(nextScene);
        setPlaylistTrackIndex(nextPosition.trackIndex);
        setPlaylistStartTime(nextPosition.currentTime);
      }
    }

    void loadRuntimeManifests();

    return () => {
      isCanceled = true;
    };
  }, []);

  const markVideoReady = useCallback(() => {
    if (fadeOutInProgressRef.current) {
      return;
    }

    setAudioTransitionMuted(false);
    setVideoReady(true);
    setIsExiting(false);
  }, []);

  const handleVariantVideoReady = useCallback((viewport: SceneViewport) => {
    if (sceneViewportRef.current !== viewport) {
      return;
    }

    const video = videoElementsRef.current[viewport];

    if (video) {
      const didSeek = syncVideoElementTime(video);
      video.volume = 0;
      video.muted = true;

      if (
        didSeek ||
        video.seeking ||
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        return;
      }
    }

    visibleSceneViewportRef.current = viewport;
    setVisibleSceneViewport(viewport);
    markVideoReady();
  }, [markVideoReady, syncVideoElementTime]);

  useEffect(() => {
    if (videoReady || !sceneViewport) {
      return undefined;
    }

    const checkActiveVideo = () => {
      const viewport = sceneViewportRef.current;
      const video = viewport ? videoElementsRef.current[viewport] : null;

      if (!viewport || !video) {
        return;
      }

      video.preload = "auto";
      void video.play().catch(() => undefined);

      const didSeek = syncVideoElementTime(video);

      if (
        !didSeek &&
        !video.seeking &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        handleVariantVideoReady(viewport);
      }
    };

    const animationFrame = window.requestAnimationFrame(checkActiveVideo);
    const timeout = window.setTimeout(checkActiveVideo, 700);
    const interval = window.setInterval(checkActiveVideo, 700);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [
    handleVariantVideoReady,
    scene.slug,
    sceneViewport,
    syncVideoElementTime,
    videoReady,
  ]);

  useEffect(() => {
    for (const viewport of sceneViewports) {
      const video = videoElementsRef.current[viewport];

      if (!video) {
        continue;
      }

      video.volume = 0;
      video.muted = true;
    }
  }, [resolvedSceneViewport, scene.slug]);

  const getSyncedPlaylistPosition = useCallback(
    (): SyncedPlaylistPosition | null => {
      if (!playlistSyncEnabled || playlistTracks.length === 0) {
        return null;
      }

      return getSyncedPlaylistPositionForTracks(
        playlistTracks,
        playlistEpochOffset,
      );
    },
    [playlistEpochOffset, playlistSyncEnabled, playlistTracks],
  );

  useEffect(() => {
    if (hasEntered || !activePlaylistTrack) {
      return;
    }

    primeRoomPlaylistTrack(scene.slug, activePlaylistTrack.src);
  }, [activePlaylistTrack, hasEntered, primeRoomPlaylistTrack, scene.slug]);

  const syncVideoTime = useCallback(() => {
    const video = getVisibleVideoElement();
    const audio = roomAudioRef.current;

    if (!syncedPlayback) {
      return;
    }

    const expectedTime = getSyncedTime();

    if (
      video &&
      Number.isFinite(expectedTime) &&
      Math.abs(video.currentTime - expectedTime) > 1.5
    ) {
      video.currentTime = expectedTime;
    }

    if (audio) {
      syncRoomAudioElementTime(audio);
    }
  }, [
    getSyncedTime,
    getVisibleVideoElement,
    syncRoomAudioElementTime,
    syncedPlayback,
  ]);

  const playRoomAudioElement = useCallback(
    (muted = !videoAudioActive) => {
      const audio = roomAudioRef.current;

      if (!audio || !videoAudioEnabled || !roomAudioSource) {
        setVideoAudioLevel(videoVolume, true);
        return;
      }

      audio.volume = videoVolume;
      audio.muted = muted;
      setVideoAudioLevel(videoVolume, muted);
      syncRoomAudioElementTime(
        audio,
        ROOM_AUDIO_IMMEDIATE_SYNC_THRESHOLD_SECONDS,
      );

      void audio.play().catch((error: unknown) => {
        if (isExpectedMediaInterruption(error)) {
          return;
        }

        if (!muted) {
          setAudioError(getMediaErrorMessage(error, "Room audio blocked"));
        }
      });
    },
    [
      roomAudioSource,
      setVideoAudioLevel,
      syncRoomAudioElementTime,
      videoAudioActive,
      videoAudioEnabled,
      videoVolume,
    ],
  );

  const resumeRoomMedia = useCallback(() => {
    const video = getVisibleVideoElement();

    if (video) {
      video.volume = 0;
      video.muted = true;
      syncVideoTime();

      void video.play().catch((error: unknown) => {
        if (isExpectedMediaInterruption(error)) {
          return;
        }

        if (videoAudioActive) {
          setAudioError(getMediaErrorMessage(error, "Video playback blocked"));
        }
      });
    }

    playRoomAudioElement(!videoAudioActive);
  }, [
    getVisibleVideoElement,
    playRoomAudioElement,
    syncVideoTime,
    videoAudioActive,
  ]);

  const resumeActivePlaylistAudio = useCallback(
    (label = "Playlist audio blocked") => {
      if (!playlistAudioActive || !activePlaylistTrack) {
        return;
      }

      void resumeRoomPlaylistAudio(scene.slug, playlistVolume, false).catch(
        (error: unknown) => {
          if (isExpectedMediaInterruption(error)) {
            return;
          }

          setAudioError(getMediaErrorMessage(error, label));
        },
      );
    },
    [
      activePlaylistTrack,
      playlistAudioActive,
      playlistVolume,
      resumeRoomPlaylistAudio,
      scene.slug,
    ],
  );

  useEffect(() => {
    const handlePageShow = () => {
      window.setTimeout(resumeRoomMedia, 0);
      window.setTimeout(() => resumeActivePlaylistAudio(), 0);
    };

    const handlePopState = () => {
      window.setTimeout(resumeRoomMedia, 0);
      window.setTimeout(() => resumeActivePlaylistAudio(), 0);
    };

    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [resumeActivePlaylistAudio, resumeRoomMedia]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isTypingTarget(event.target)
      ) {
        return;
      }

      const key = event.key.toLowerCase();

      if (!devPanelUnlocked) {
        return;
      }

      if (!helperShortcutEnabled) {
        return;
      }

      if (key === "b") {
        setDevBordersEnabled((current) => !current);
      }

      if (key === "h") {
        setDevPanelOpen((current) => !current);
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [devPanelUnlocked, helperShortcutEnabled]);

  useEffect(() => {
    if (!syncedPlayback) {
      return;
    }

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        syncVideoTime();
        resumeRoomMedia();
        resumeActivePlaylistAudio();
      }
    };

    syncVideoTime();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", syncVideoTime);
    const interval = window.setInterval(syncVideoTime, 30_000);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", syncVideoTime);
      window.clearInterval(interval);
    };
  }, [
    resumeActivePlaylistAudio,
    resumeRoomMedia,
    syncVideoTime,
    syncedPlayback,
  ]);

  useEffect(() => {
    const video = getVisibleVideoElement();

    if (!video) {
      return;
    }

    video.volume = 0;
    video.muted = true;

    void video.play().catch((error: unknown) => {
      if (isExpectedMediaInterruption(error)) {
        return;
      }

      if (videoAudioActive) {
        setAudioError(getMediaErrorMessage(error, "Audio blocked"));
      }
    });
  }, [
    activeVideoSource.src,
    getVisibleVideoElement,
    resolvedSceneViewport,
    videoAudioActive,
  ]);

  useEffect(() => {
    const audio = roomAudioRef.current;

    if (!audio) {
      return;
    }

    audio.volume = videoVolume;
    audio.muted = !videoAudioActive;
    setVideoAudioLevel(videoVolume, !videoAudioActive);
    syncRoomAudioElementTime(
      audio,
      ROOM_AUDIO_IMMEDIATE_SYNC_THRESHOLD_SECONDS,
    );

    if (hasEntered && videoAudioEnabled && roomAudioSource) {
      void audio.play().catch((error: unknown) => {
        if (isExpectedMediaInterruption(error)) {
          return;
        }

        if (videoAudioActive) {
          setAudioError(getMediaErrorMessage(error, "Room audio blocked"));
        }
      });
    }
  }, [
    hasEntered,
    roomAudioSource,
    setVideoAudioLevel,
    syncRoomAudioElementTime,
    videoAudioActive,
    videoAudioEnabled,
    videoVolume,
  ]);

  useEffect(() => {
    const updateVideoElementStatus = () => {
      const video = getVisibleVideoElement();

      if (!video) {
        setVideoElementStatus("no element");
        return;
      }

      const sourceName = video.currentSrc
        ? (video.currentSrc.split("/").at(-1) ?? "loaded")
        : "no src";

      setVideoElementStatus(
        `${sourceName} / ${video.muted ? "muted" : "unmuted"} / vol ${video.volume.toFixed(
          2,
        )} / ${video.paused ? "paused" : "playing"} / ready ${
          video.readyState
        } / net ${video.networkState}`,
      );

      const audio = roomAudioRef.current;

      if (!audio) {
        setRoomAudioElementStatus("no element");
        return;
      }

      const audioSourceName = audio.currentSrc
        ? (audio.currentSrc.split("/").at(-1) ?? "loaded")
        : "no src";

      setRoomAudioElementStatus(
        `${audioSourceName} / ${audio.muted ? "muted" : "unmuted"} / vol ${audio.volume.toFixed(
          2,
        )} / ${audio.paused ? "paused" : "playing"} / ${audio.currentTime.toFixed(
          1,
        )}s / ready ${audio.readyState} / net ${audio.networkState}`,
      );
    };

    updateVideoElementStatus();
    const interval = window.setInterval(updateVideoElementStatus, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [
    getVisibleVideoElement,
    resolvedSceneViewport,
    roomAudioSource,
    scene.slug,
    videoAudioActive,
    videoVolume,
  ]);

  useEffect(() => {
    if (!playlistEnabled || playlistTracks.length === 0) {
      return;
    }

    const syncPlaylist = () => {
      const position = getSyncedPlaylistPosition();

      if (!position) {
        return;
      }

      const status = playlistStatusRef.current;
      const activePlaybackIsHealthy =
        playlistAudioActiveRef.current &&
        !status.paused &&
        status.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;

      if (activePlaybackIsHealthy) {
        return;
      }

      setPlaylistTrackIndex(position.trackIndex);
      setPlaylistStartTime(position.currentTime);
    };

    syncPlaylist();
    const interval = window.setInterval(syncPlaylist, 30_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [
    getSyncedPlaylistPosition,
    playlistEnabled,
    playlistTracks.length,
  ]);

  useEffect(() => {
    if (!playlistAudioActive || !activePlaylistTrack) {
      return;
    }

    const playCurrentTrack = () =>
      playRoomPlaylistTrack({
        room: scene.slug,
        src: activePlaylistTrack.src,
        startTime: playlistStartTime,
        volume: playlistVolume,
        onEnded: () => {
          setPlaylistTrackIndex(
            (current) => (current + 1) % playlistTracks.length,
          );
          setPlaylistStartTime(0);
        },
      });

    void playCurrentTrack().catch((error: unknown) => {
      if (isExpectedMediaInterruption(error)) {
        return;
      }

      setAudioError(getMediaErrorMessage(error, "Playlist audio blocked"));
    });

    return undefined;
  }, [
    activePlaylistTrack,
    playRoomPlaylistTrack,
    playlistAudioActive,
    playlistStartTime,
    playlistTracks.length,
    playlistVolume,
    scene.slug,
  ]);

  useEffect(() => {
    if (!playlistAudioActive || !activePlaylistTrack) {
      return;
    }

    const toastKey = `${scene.slug}:${playlistTrackIndex}:${activePlaylistTrack.src}`;
    const previousToastKey = lastMetadataToastKeyRef.current;

    lastMetadataToastKeyRef.current = toastKey;

    if (
      !previousToastKey ||
      previousToastKey === toastKey ||
      !previousToastKey.startsWith(`${scene.slug}:`)
    ) {
      return;
    }

    showPlaylistMetadataToast(activePlaylistTrack);
  }, [
    activePlaylistTrack,
    playlistAudioActive,
    playlistTrackIndex,
    scene.slug,
    showPlaylistMetadataToast,
  ]);

  useEffect(() => {
    if (!playlistEnabled) {
      setRoomPlaylistAudioLevel(scene.slug, 0, true);
      return;
    }

    setActivePlaylistRoom(scene.slug, playlistVolume, !playlistAudioActive);
  }, [
    playlistAudioActive,
    playlistEnabled,
    playlistVolume,
    scene.slug,
    setActivePlaylistRoom,
    setRoomPlaylistAudioLevel,
  ]);

  async function enterPlanet() {
    const video = getVisibleVideoElement();
    const playPromises: Promise<unknown>[] = [];

    setAudioError(null);
    markEntered();
    setVideoAudioMuted(false);
    setPlaylistAudioMuted(false);

    const roomPlaylistOptions = sceneSlugs.flatMap((slug) => {
      const targetScene = runtimeScenes[slug];
      const playback = getScenePlaylistPlayback(targetScene);

      if (!playback) {
        return [];
      }

      return [
        {
          active: slug === scene.slug,
          room: slug,
          src: playback.track.src,
          startTime: playback.currentTime,
          volume: playback.volume,
          onEnded:
            slug === scene.slug
              ? () => {
                  setPlaylistTrackIndex(
                    (current) => (current + 1) % playlistTracks.length,
                  );
                  setPlaylistStartTime(0);
                }
              : undefined,
        },
      ];
    });

    if (roomPlaylistOptions.length > 0) {
      playPromises.push(unlockRoomPlaylists(roomPlaylistOptions));
    }

    if (video && videoAudioEnabled) {
      video.volume = 0;
      video.muted = true;
      setVideoAudioLevel(videoVolume, false);

      if (syncedPlayback) {
        video.currentTime = getSyncedTime();
      }

      playPromises.push(video.play());
    }

    if (videoAudioEnabled && roomAudioSource) {
      const audio = roomAudioRef.current;

      if (audio) {
        audio.volume = videoVolume;
        audio.muted = false;
        syncRoomAudioElementTime(
          audio,
          ROOM_AUDIO_IMMEDIATE_SYNC_THRESHOLD_SECONDS,
        );
        playPromises.push(audio.play());
      }
    }

    const results = await Promise.allSettled(playPromises);
    const failedResult = results.find(
      (result): result is PromiseRejectedResult =>
        result.status === "rejected" &&
        !isExpectedMediaInterruption(result.reason),
    );

    if (failedResult) {
      setAudioError(getMediaErrorMessage(failedResult.reason, "Audio blocked"));
    }
  }

  function toggleVideoAudio() {
    const video = getVisibleVideoElement();

    if (!hasEntered) {
      void enterPlanet();
      return;
    }

    const nextMuted = !videoAudioMuted;
    setVideoAudioMuted(nextMuted);
    setVideoAudioLevel(videoVolume, nextMuted || !videoAudioEnabled);

    if (video) {
      video.volume = 0;
      video.muted = true;
    }

    const audio = roomAudioRef.current;

    if (audio) {
      audio.volume = videoVolume;
      audio.muted = nextMuted || !videoAudioEnabled;
    }

    resumeActivePlaylistAudio();
  }

  function togglePlaylistAudio() {
    if (!hasEntered) {
      void enterPlanet();
      return;
    }

    setPlaylistAudioMuted((current) => !current);
  }

  const playPlaylistForScene = useCallback(
    async (targetScene: Scene, muted = false) => {
      if (!hasEntered || playlistAudioMuted) {
        return;
      }

      const targetPlaylist = targetScene.playlist;

      if (!targetPlaylist?.enabled || targetPlaylist.tracks.length === 0) {
        setRoomPlaylistAudioLevel(targetScene.slug, 0, true);
        return;
      }

      const position = getSyncedPlaylistPositionForTracks(
        targetPlaylist.tracks,
        targetPlaylist.sync?.epochOffsetSeconds ?? 0,
      );
      const targetTrack = position
        ? targetPlaylist.tracks[position.trackIndex]
        : targetPlaylist.tracks[0];

      if (!targetTrack) {
        return;
      }

      await playRoomPlaylistTrack({
        room: targetScene.slug,
        src: targetTrack.src,
        startTime: position?.currentTime ?? 0,
        volume: targetPlaylist.volume,
        muted,
        onEnded: () => {
          if (targetScene.slug !== scene.slug) {
            return;
          }

          setPlaylistTrackIndex(
            (current) => (current + 1) % targetPlaylist.tracks.length,
          );
          setPlaylistStartTime(0);
        },
      });
      setActivePlaylistRoom(targetScene.slug, targetPlaylist.volume, muted);
    },
    [
      hasEntered,
      playRoomPlaylistTrack,
      playlistAudioMuted,
      scene.slug,
      setActivePlaylistRoom,
      setRoomPlaylistAudioLevel,
    ],
  );

  const getRootHistoryHref = useCallback(() => {
    return window.location.search ? `/${window.location.search}` : ROOT_HREF;
  }, []);

  const switchScene = useCallback(
    (targetScene: Scene, mode: "push" | "replace") => {
      const position = getInitialPlaylistPosition(targetScene);

      fadeOutInProgressRef.current = false;
      setPointerPosition(null);
      stageGestureRef.current.pointers.clear();
      stageGestureRef.current.startCenter = null;
      stageGestureRef.current.startDistance = 0;
      stageGestureRef.current.startTransform = DEFAULT_STAGE_TRANSFORM;
      lastVideoTimeRef.current = 0;
      setStageTransform(DEFAULT_STAGE_TRANSFORM);
      setCreditsOpen(false);
      setActiveScene(targetScene);
      setPlaylistTrackIndex(position.trackIndex);
      setPlaylistStartTime(position.currentTime);
      setVideoReady(false);

      window.history[mode === "push" ? "pushState" : "replaceState"](
        { paperPlanetRoom: targetScene.slug },
        "",
        getRootHistoryHref(),
      );
    },
    [getRootHistoryHref],
  );

  const transitionToScene = useCallback(
    async (targetScene: Scene, mode: "push" | "replace") => {
      const navigationId = navigationIdRef.current + 1;
      navigationIdRef.current = navigationId;
      fadeOutInProgressRef.current = true;

      setAudioError(null);
      setAudioTransitionMuted(true);
      setVideoAudioLevel(videoVolume, true);
      setRoomPlaylistAudioLevel(scene.slug, playlistVolume, true);
      setIsExiting(true);

      await wait(ROOM_TRANSITION_MS);

      if (navigationIdRef.current !== navigationId) {
        return;
      }

      const playlistPromise =
        hasEntered && !playlistAudioMuted
          ? playPlaylistForScene(targetScene, true).catch((error: unknown) => {
              if (isExpectedMediaInterruption(error)) {
                return;
              }

              setAudioError(
                getMediaErrorMessage(error, "Playlist audio blocked"),
              );
            })
          : Promise.resolve();

      switchScene(targetScene, mode);
      void playlistPromise;
    },
    [
      hasEntered,
      playPlaylistForScene,
      playlistAudioMuted,
      playlistVolume,
      scene.slug,
      setRoomPlaylistAudioLevel,
      setVideoAudioLevel,
      switchScene,
      videoVolume,
    ],
  );

  function handleSceneNavigation(
    event: MouseEvent<HTMLAnchorElement>,
    targetSlug: SceneSlug,
  ) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.shiftKey
    ) {
      return;
    }

    if (targetSlug === scene.slug) {
      event.preventDefault();
      return;
    }

    event.preventDefault();

    const targetScene = runtimeScenes[targetSlug];

    if (targetScene) {
      void transitionToScene(targetScene, "push");
    }
  }

  function handleHotspotActionClick(
    event: MouseEvent<HTMLAnchorElement>,
    action: Hotspot["action"],
  ) {
    if (action.type === "navigate") {
      handleSceneNavigation(event, action.target);
      return;
    }

    if (
      action.type !== "credits" ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.shiftKey
    ) {
      return;
    }

    event.preventDefault();
    setCreditsOpen(true);
  }

  useEffect(() => {
    window.history.replaceState(
      { paperPlanetRoom: scene.slug },
      "",
      getRootHistoryHref(),
    );
  }, [getRootHistoryHref, scene.slug]);

  useEffect(() => {
    const handleRoomPopState = (event: PopStateEvent) => {
      const targetSlug = event.state?.paperPlanetRoom as SceneSlug | undefined;
      const targetScene = targetSlug
        ? runtimeScenes[targetSlug]
        : runtimeScenes.construction;

      if (!targetScene || targetScene.slug === scene.slug) {
        return;
      }

      void transitionToScene(targetScene, "replace");
    };

    window.addEventListener("popstate", handleRoomPopState);

    return () => {
      window.removeEventListener("popstate", handleRoomPopState);
    };
  }, [runtimeScenes, scene.slug, transitionToScene]);

  function getActionHref(action: Hotspot["action"]) {
    if (action.type === "navigate") {
      return ROOT_HREF;
    }

    if (action.type === "credits") {
      return "#credits";
    }

    const subject = action.subject
      ? `?subject=${encodeURIComponent(action.subject)}`
      : "";
    return `mailto:${action.email}${subject}`;
  }

  function getPolygonPoints(hotspot: Hotspot) {
    return hotspot.shape === "polygon"
      ? hotspot.points.map((point) => `${point.x},${point.y}`).join(" ")
      : "";
  }

  function handleFramePointer(event: React.PointerEvent<HTMLDivElement>) {
    if (!debugHotspots || event.target !== event.currentTarget) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    setPointerPosition({
      x: Number((((event.clientX - rect.left) / rect.width) * 100).toFixed(2)),
      y: Number((((event.clientY - rect.top) / rect.height) * 100).toFixed(2)),
    });
  }

  function setClampedStageTransform(nextTransform: StageTransform) {
    const clampedTransform = clampStageTransform(
      nextTransform,
      stageRef.current?.getBoundingClientRect() ?? null,
    );

    stageTransformRef.current = clampedTransform;
    setStageTransform(clampedTransform);
  }

  function getStagePointer(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();

    return {
      x: event.clientX - rect.left - rect.width / 2,
      y: event.clientY - rect.top - rect.height / 2,
    };
  }

  function getStagePointerFromClient(clientX: number, clientY: number) {
    const rect = stageRef.current?.getBoundingClientRect();

    if (!rect) {
      return null;
    }

    return {
      x: clientX - rect.left - rect.width / 2,
      y: clientY - rect.top - rect.height / 2,
    };
  }

  function getStageCenterPointer() {
    return { x: 0, y: 0 };
  }

  function zoomStageAt(
    startTransform: StageTransform,
    startPoint: StagePointer,
    currentPoint: StagePointer,
    nextScale: number,
  ) {
    setClampedStageTransform(
      getStageZoomTransform(startTransform, startPoint, currentPoint, nextScale),
    );
  }

  function resetStageGesture() {
    stageGestureRef.current.pointers.clear();
    stageGestureRef.current.startCenter = null;
    stageGestureRef.current.startDistance = 0;
    stageGestureRef.current.startTransform = stageTransformRef.current;
  }

  function handleStagePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    handleFramePointer(event);

    if (isInteractiveTarget(event.target)) {
      return;
    }

    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    const gesture = stageGestureRef.current;
    const pointer = getStagePointer(event);
    gesture.pointers.set(event.pointerId, pointer);

    if (event.currentTarget.setPointerCapture) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    const pointers = Array.from(gesture.pointers.values());
    gesture.startTransform = stageTransformRef.current;

    if (pointers.length >= 2) {
      gesture.startCenter = getPointerCenter(pointers[0], pointers[1]);
      gesture.startDistance = getPointerDistance(pointers[0], pointers[1]);
      return;
    }

    gesture.startCenter = pointer;
    gesture.startDistance = 0;
  }

  function handleStagePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const gesture = stageGestureRef.current;

    if (!gesture.pointers.has(event.pointerId)) {
      return;
    }

    gesture.pointers.set(event.pointerId, getStagePointer(event));
    const pointers = Array.from(gesture.pointers.values());

    if (pointers.length >= 2 && gesture.startCenter) {
      const currentCenter = getPointerCenter(pointers[0], pointers[1]);
      const currentDistance = getPointerDistance(pointers[0], pointers[1]);
      const distanceRatio =
        gesture.startDistance > 0
          ? currentDistance / gesture.startDistance
          : 1;
      const nextScale = gesture.startTransform.scale * distanceRatio;

      event.preventDefault();
      zoomStageAt(
        gesture.startTransform,
        gesture.startCenter,
        currentCenter,
        nextScale,
      );
      return;
    }

    if (pointers.length === 1) {
      return;
    }
  }

  function handleStagePointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    const gesture = stageGestureRef.current;
    gesture.pointers.delete(event.pointerId);

    if (event.currentTarget.releasePointerCapture) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // The pointer may already be released after a browser-level cancel.
      }
    }

    const pointers = Array.from(gesture.pointers.values());

    if (pointers.length >= 2) {
      gesture.startTransform = stageTransformRef.current;
      gesture.startCenter = getPointerCenter(pointers[0], pointers[1]);
      gesture.startDistance = getPointerDistance(pointers[0], pointers[1]);
      return;
    }

    if (pointers.length === 1) {
      gesture.startTransform = stageTransformRef.current;
      gesture.startCenter = pointers[0];
      gesture.startDistance = 0;
      return;
    }

    resetStageGesture();
  }

  useEffect(() => {
    const stage = stageRef.current;

    if (!stage) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        const currentTransform = stageTransformRef.current;

        if (currentTransform.scale <= 1.001) {
          return;
        }

        event.preventDefault();
        resetStageGesture();
        nativeGestureStartRef.current = null;

        const delta = getNormalizedWheelDelta(event);

        setClampedStageTransform({
          ...currentTransform,
          x: currentTransform.x - delta.x,
          y: currentTransform.y - delta.y,
        });
        return;
      }

      const pointer = getStagePointerFromClient(event.clientX, event.clientY);

      if (!pointer) {
        return;
      }

      event.preventDefault();
      resetStageGesture();
      nativeGestureStartRef.current = null;

      const currentTransform = stageTransformRef.current;
      const nextScale =
        currentTransform.scale * Math.exp(-event.deltaY * WHEEL_ZOOM_SPEED);

      zoomStageAt(currentTransform, pointer, pointer, nextScale);
    };

    const handleGestureStart = (event: Event) => {
      const gestureEvent = event as NativeGestureEvent;
      const pointer =
        typeof gestureEvent.clientX === "number" &&
        typeof gestureEvent.clientY === "number"
          ? getStagePointerFromClient(gestureEvent.clientX, gestureEvent.clientY)
          : getStageCenterPointer();

      event.preventDefault();
      resetStageGesture();
      nativeGestureStartRef.current = {
        point: pointer ?? getStageCenterPointer(),
        transform: stageTransformRef.current,
      };
    };

    const handleGestureChange = (event: Event) => {
      const gestureEvent = event as NativeGestureEvent;
      const start = nativeGestureStartRef.current;
      const scale = Number(gestureEvent.scale);

      if (!start || !Number.isFinite(scale)) {
        return;
      }

      const currentPoint =
        typeof gestureEvent.clientX === "number" &&
        typeof gestureEvent.clientY === "number"
          ? getStagePointerFromClient(gestureEvent.clientX, gestureEvent.clientY)
          : start.point;

      event.preventDefault();
      zoomStageAt(
        start.transform,
        start.point,
        currentPoint ?? start.point,
        start.transform.scale * scale,
      );
    };

    const handleGestureEnd = (event: Event) => {
      event.preventDefault();
      nativeGestureStartRef.current = null;
      resetStageGesture();
    };

    stage.addEventListener("wheel", handleWheel, { passive: false });
    stage.addEventListener("gesturestart", handleGestureStart, {
      passive: false,
    });
    stage.addEventListener("gesturechange", handleGestureChange, {
      passive: false,
    });
    stage.addEventListener("gestureend", handleGestureEnd, { passive: false });

    return () => {
      stage.removeEventListener("wheel", handleWheel);
      stage.removeEventListener("gesturestart", handleGestureStart);
      stage.removeEventListener("gesturechange", handleGestureChange);
      stage.removeEventListener("gestureend", handleGestureEnd);
    };
  });

  return (
    <main
      className={classNames(
        "relative h-dvh overflow-hidden overscroll-none bg-black text-white",
        devOutline(devBorders, 0),
      )}
    >
      {activePlaylistTrack && !hasEntered ? (
        <link
          rel="preload"
          href={activePlaylistTrack.src}
          as="audio"
          crossOrigin="anonymous"
        />
      ) : null}
      {roomAudioSource ? (
        <audio
          ref={roomAudioRef}
          src={roomAudioSource}
          loop
          preload="auto"
          crossOrigin="anonymous"
          muted={!videoAudioActive}
          onLoadedMetadata={(event) => {
            event.currentTarget.volume = videoVolume;
            syncRoomAudioElementTime(
              event.currentTarget,
              ROOM_AUDIO_IMMEDIATE_SYNC_THRESHOLD_SECONDS,
            );
          }}
        />
      ) : null}
      <section
        className={classNames(
          "flex h-dvh touch-none justify-center overflow-hidden",
          resolvedSceneViewport === "mobile" ? "p-0" : "p-3 sm:p-5",
          "items-center",
          devOutline(devBorders, 1),
        )}
      >
        <div
          ref={stageRef}
          className={classNames(
            "relative w-full touch-none overflow-hidden bg-black",
            devOutline(devBorders, 2),
          )}
          style={stageFrameStyle}
          onPointerDown={handleStagePointerDown}
          onPointerMove={handleStagePointerMove}
          onPointerUp={handleStagePointerEnd}
          onPointerCancel={handleStagePointerEnd}
        >
          <div
            className={classNames(
              "absolute inset-0 origin-center will-change-transform",
              devOutline(devBorders, 3),
            )}
            style={stageTransformStyle}
          >
            {sceneViewport
              ? sceneViewports.map((viewport) => {
                  const videoSource = getSceneVideoSource(scene, viewport);
                  const isVisible = viewport === resolvedSceneViewport;

                  return (
                    <video
                      key={`${scene.slug}:${viewport}:native-audio`}
                      ref={(element) => {
                        videoElementsRef.current[viewport] = element;
                      }}
                      className={classNames(
                        "absolute inset-0 z-0 h-full w-full object-cover",
                        isVisible ? "opacity-100" : "opacity-0",
                        devOutline(devBorders, 4),
                      )}
                      crossOrigin="anonymous"
                      src={videoSource.src}
                      autoPlay={isVisible}
                      muted
                      loop
                      playsInline
                      preload={isVisible ? "auto" : "metadata"}
                      aria-hidden={!isVisible}
                      aria-label={
                        isVisible ? `${scene.title} room video` : undefined
                      }
                      onLoadedMetadata={(event) => {
                        event.currentTarget.volume = 0;
                        event.currentTarget.muted = true;
                        syncVideoElementTime(event.currentTarget);
                      }}
                      onTimeUpdate={(event) => {
                        if (isVisible) {
                          lastVideoTimeRef.current =
                            event.currentTarget.currentTime;
                        }
                      }}
                      onLoadedData={() => handleVariantVideoReady(viewport)}
                      onCanPlay={() => handleVariantVideoReady(viewport)}
                      onSeeked={() => handleVariantVideoReady(viewport)}
                      onPlaying={() => handleVariantVideoReady(viewport)}
                    />
                  );
                })
              : null}

            {scene.ticker ? (
              <SceneTickerOverlay ticker={scene.ticker} devBorders={devBorders} />
            ) : null}

            <svg
              className={classNames(
                "pointer-events-none absolute inset-0 z-10 h-full w-full",
                devOutline(devBorders, 5),
              )}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden={!debugHotspots}
            >
              {orderedHotspots.map((hotspot) => {
                const action = hotspot.action;

                return (
                  <a
                    key={hotspot.id}
                    href={getActionHref(action)}
                    onClick={(event) => handleHotspotActionClick(event, action)}
                    aria-label={hotspot.label}
                    className="pointer-events-auto outline-none"
                  >
                    {hotspot.shape === "rect" ? (
                      <rect
                        x={hotspot.rect.x}
                        y={hotspot.rect.y}
                        width={hotspot.rect.width}
                        height={hotspot.rect.height}
                        fill={
                          debugHotspots
                            ? "rgba(253, 224, 71, 0.22)"
                            : "transparent"
                        }
                        stroke={
                          debugHotspots ? "rgba(253, 224, 71, 0.95)" : "none"
                        }
                        strokeWidth={debugHotspots ? 0.3 : 0}
                        vectorEffect="non-scaling-stroke"
                        pointerEvents="all"
                      >
                        <title>{hotspot.label}</title>
                      </rect>
                    ) : (
                      <polygon
                        points={getPolygonPoints(hotspot)}
                        fill={
                          debugHotspots
                            ? "rgba(253, 224, 71, 0.22)"
                            : "transparent"
                        }
                        stroke={
                          debugHotspots ? "rgba(253, 224, 71, 0.95)" : "none"
                        }
                        strokeWidth={debugHotspots ? 0.3 : 0}
                        vectorEffect="non-scaling-stroke"
                        pointerEvents="all"
                      >
                        <title>{hotspot.label}</title>
                      </polygon>
                    )}
                  </a>
                );
              })}
            </svg>

            {scene.overlays?.map((overlay) => {
              const action = overlay.action;

              return (
                <a
                  key={overlay.id}
                  href={getActionHref(action)}
                  onClick={(event) => handleHotspotActionClick(event, action)}
                  aria-label={overlay.label}
                  title={debugHotspots ? overlay.label : undefined}
                  className={classNames(
                    "absolute z-30 block outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black",
                    devOutline(devBorders, overlay.zIndex ?? 6),
                  )}
                  style={{
                    left: `${overlay.position.x}%`,
                    top: `${overlay.position.y}%`,
                    width: `${overlay.position.width}%`,
                  }}
                >
                  {/* Use a plain img for local hand-drawn UI sprites; Next image optimization can be brittle in dev previews. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={overlay.src}
                    alt=""
                    className="block h-auto w-full select-none"
                    draggable={false}
                  />
                  <span className="sr-only">{overlay.label}</span>
                </a>
              );
            })}
          </div>

        </div>
      </section>

      <div
        className={classNames(
          "fixed inset-0 z-40 flex items-center justify-center bg-black transition-opacity duration-200",
          loadingOverlayActive ? "opacity-100" : "opacity-0",
          transitionActive ? "pointer-events-auto" : "pointer-events-none",
          devOutline(devBorders, 4),
        )}
        aria-hidden="true"
      >
        {loadingOverlayActive ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={LOADING_GIF_SRC}
            alt=""
            className="block w-96 select-none md:w-[30rem]"
            draggable={false}
          />
        ) : null}
      </div>

      {!hasEntered ? (
        <div
          className={classNames(
            "fixed inset-0 z-50 flex touch-none items-center justify-center bg-black text-white",
            devOutline(devBorders, 4),
          )}
        >
          <EnterArtworkButton
            onPointerPrime={() => {
              if (activePlaylistTrack) {
                primeRoomPlaylistTrack(scene.slug, activePlaylistTrack.src);
              }
            }}
            onEnter={enterPlanet}
            className={devOutline(devBorders, 5)}
          />
        </div>
      ) : null}

      {metadataToast ? (
        <div
          key={metadataToast.id}
          className="pointer-events-none fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-[45] flex justify-center sm:bottom-6"
          role="status"
          aria-live="polite"
        >
          <div className="paper-planet-metadata-toast font-paper-planet relative isolate max-w-[min(42rem,calc(100vw-1.5rem))] px-5 py-2.5 text-center text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.68)] sm:px-6">
            <svg
              className="pointer-events-none absolute -inset-1 -z-10 h-[calc(100%+0.5rem)] w-[calc(100%+0.5rem)] overflow-visible"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path
                d={metadataToast.frame.path}
                fill="rgba(0, 0, 0, 0.86)"
                stroke="rgba(255, 255, 255, 0.78)"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.25"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <p className="text-[1.55rem] leading-[0.9] text-white/62 sm:text-[1.95rem]">
              Now playing
            </p>
            <p className="text-balance break-words text-[clamp(1.9rem,6.4vw,3rem)] leading-[0.62] text-white">
              {metadataToast.title}
            </p>
            {metadataToast.artist ? (
              <p className="mt-0.5 text-balance break-words text-[1.45rem] leading-[0.68] text-white/72 sm:text-[1.85rem]">
                artist: {metadataToast.artist}
              </p>
            ) : null}
            {metadataToast.album ? (
              <p className="mt-0.5 text-balance break-words text-[1.45rem] leading-[0.68] text-white/72 sm:text-[1.85rem]">
                album: {metadataToast.album}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {creditsOpen ? (
        <div
          className="fixed inset-0 z-[48] flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm"
          role="presentation"
          onClick={() => setCreditsOpen(false)}
        >
          <div
            className="font-paper-planet relative w-full max-w-[min(34rem,calc(100vw-2rem))] border border-white/55 bg-black/90 px-6 py-5 text-center text-white shadow-2xl sm:px-8 sm:py-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="paper-planet-credits-title"
            data-stage-interactive="true"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="absolute right-3 top-2 cursor-pointer text-3xl leading-none text-white/65 hover:text-white"
              aria-label="Close credits"
              onClick={() => setCreditsOpen(false)}
            >
              &times;
            </button>
            <h2
              id="paper-planet-credits-title"
              className="text-[2.1rem] leading-none text-white sm:text-[2.6rem]"
            >
              Credits
            </h2>
            <div className="mt-5 grid gap-3 text-[1.45rem] leading-[0.92] text-white/82 sm:text-[1.85rem]">
              <p>Drawings by Connor Schultze</p>
              <p>
                Web development by{" "}
                <a
                  href="https://andrew-boylan.com"
                  target="_blank"
                  rel="noreferrer"
                  className="font-pyxis text-white underline decoration-white/45 underline-offset-4 hover:decoration-white"
                >
                  Regular Expression
                </a>
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {helperShortcutEnabled && devPanelOpen ? (
        <aside
          className={classNames(
            "fixed right-3 top-3 z-50 max-h-[calc(100dvh-1.5rem)] w-[min(15rem,calc(100vw-1.5rem))] overflow-y-auto overscroll-contain border border-white/20 bg-black/85 font-mono text-[0.65rem] leading-snug text-white shadow-2xl backdrop-blur",
            devOutline(devBorders, 5),
          )}
        >
        <button
          type="button"
          onClick={() => setDevPanelOpen((current) => !current)}
          className={classNames(
            "flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left uppercase tracking-[0.16em] text-white/80 hover:text-white",
            devOutline(devBorders, 0),
          )}
          aria-expanded={devPanelOpen}
        >
          <span>{scene.title}</span>
          <span aria-hidden="true">{devPanelOpen ? "−" : "+"}</span>
        </button>

          <div
            className={classNames(
              "grid gap-2 border-t border-white/15 p-2",
              devOutline(devBorders, 1),
            )}
          >
            <div
              className={classNames(
                "grid grid-cols-1 gap-1",
                devOutline(devBorders, 2),
              )}
            >
              {sceneSlugs.map((slug, index) => (
                <a
                  key={slug}
                  href={ROOT_HREF}
                  onClick={(event) => handleSceneNavigation(event, slug)}
                  aria-current={scene.slug === slug ? "page" : undefined}
                  className={classNames(
                    "truncate border border-white/20 px-2 py-1 text-center uppercase text-white/70 hover:border-white/70 hover:text-white aria-[current=page]:border-white aria-[current=page]:text-white",
                    devOutline(devBorders, 3 + index),
                  )}
                >
                  {runtimeScenes[slug].title}
                </a>
              ))}
            </div>

            <div
              className={classNames(
                "grid gap-1.5 border border-white/15 p-2",
                devOutline(devBorders, 2),
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="uppercase text-white/60">Sound</span>
                {!hasEntered ? (
                  <button
                    type="button"
                    onClick={enterPlanet}
                    className={classNames(
                      "border border-white/30 px-1.5 py-1 uppercase text-white hover:border-white",
                      devOutline(devBorders, 3),
                    )}
                  >
                    Enter
                  </button>
                ) : (
                  <span className="uppercase text-white/50">Unlocked</span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 text-white/60">
                <span>
                  Video audio:{" "}
                  {videoAudioEnabled
                    ? videoAudioActive
                      ? `on / volume ${videoVolume}`
                      : "muted"
                    : "off"}
                </span>
                {videoAudioEnabled ? (
                  <button
                    type="button"
                    onClick={toggleVideoAudio}
                    className={classNames(
                      "border border-white/30 px-1.5 py-1 uppercase text-white hover:border-white",
                      devOutline(devBorders, 3),
                    )}
                  >
                    {videoAudioActive ? "Mute" : "Unmute"}
                  </button>
                ) : null}
              </div>
              <p className="break-words text-white/45">
                Room audio: {roomAudioElementStatus}
              </p>
              <p className="break-words text-white/45">
                Visual video: {videoElementStatus}
              </p>
              <p className="text-white/60">
                Playlist:{" "}
                {playlistEnabled
                  ? playlistTracks.length > 0
                    ? `${scene.playlist?.name} (${playlistTracks.length}) / ${
                        playlistAudioActive ? "on" : "muted"
                      }`
                    : `${scene.playlist?.name} / tracks not published yet`
                  : "off"}
              </p>
              {playlistEnabled && playlistTracks.length > 0 ? (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={togglePlaylistAudio}
                    className={classNames(
                      "border border-white/30 px-1.5 py-1 uppercase text-white hover:border-white",
                      devOutline(devBorders, 3),
                    )}
                  >
                    {playlistAudioActive ? "Mute playlist" : "Unmute playlist"}
                  </button>
                </div>
              ) : null}
              {playlistEnabled && activePlaylistTrack ? (
                <div className="grid gap-1">
                  <p className="text-white/80">
                    Now playing: {playlistTrackIndex + 1}/{playlistTracks.length}{" "}
                    {formatPlaylistTrackDisplayTitle(activePlaylistTrack)}
                  </p>
                  <div className="flex flex-wrap justify-end gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        showPlaylistMetadataToast(activePlaylistTrack)
                      }
                      className={classNames(
                        "cursor-pointer border border-white/30 px-1.5 py-1 uppercase text-white hover:border-white",
                        devOutline(devBorders, 3),
                      )}
                    >
                      Show metadata
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        showMetadataToast(
                          "The Extraordinary Paper Planet Construction Parade",
                          activePlaylistTrack.album,
                          "Paper Planet Players",
                        )
                      }
                      className={classNames(
                        "cursor-pointer border border-white/30 px-1.5 py-1 uppercase text-white hover:border-white",
                        devOutline(devBorders, 3),
                      )}
                    >
                      Long title
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        showMetadataToast(
                          activePlaylistTrack.title,
                          "The Complete Songs From The Long Walk Through Paper Planet",
                          "Connor W.",
                        )
                      }
                      className={classNames(
                        "cursor-pointer border border-white/30 px-1.5 py-1 uppercase text-white hover:border-white",
                        devOutline(devBorders, 3),
                      )}
                    >
                      Long album
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        showMetadataToast(
                          "Conito's Way",
                          "Alpaulccino",
                          "Connor Wilson",
                        )
                      }
                      className={classNames(
                        "cursor-pointer border border-white/30 px-1.5 py-1 uppercase text-white hover:border-white",
                        devOutline(devBorders, 3),
                      )}
                    >
                      Conito&apos;s
                    </button>
                  </div>
                </div>
              ) : null}
              <p className="text-white/55">
                Playlist state: {playlistStatus.lastEvent} /{" "}
                {playlistStatus.paused ? "paused" : "playing"} / ready{" "}
                {playlistStatus.readyState} / net {playlistStatus.networkState}
              </p>
              <p className="text-white/55">
                Mixer gain: video {videoGain.toFixed(2)} / playlist{" "}
                {playlistGain.toFixed(2)}
              </p>
              <p className="truncate text-white/45">
                Playlist source:{" "}
                {playlistStatus.currentSrc
                  ? playlistStatus.currentSrc.split("/").at(-1)
                  : "none"}
              </p>
              {audioError ? <p className="text-red-300">{audioError}</p> : null}
              {playlistStatus.error ? (
                <p className="text-red-300">{playlistStatus.error}</p>
              ) : null}
            </div>

            <div
              className={classNames(
                "grid gap-0.5 border border-white/15 p-2 text-white/60",
                devOutline(devBorders, 2),
              )}
            >
              <p>Scene: {scene.slug}</p>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={showLoadingPreview}
                  className={classNames(
                    "cursor-pointer border border-white/30 px-1.5 py-1 uppercase text-white hover:border-white",
                    devOutline(devBorders, 3),
                  )}
                >
                  Show loading
                </button>
              </div>
              <p>
                Video: {sceneViewport ?? "detecting"} / {activeVideoSource.width}x
                {activeVideoSource.height} / {scene.video.durationSeconds.toFixed(3)}s
              </p>
              <p>Borders: {devBorders ? "visible" : "hidden"}</p>
              <p>
                Hotspots:{" "}
                {debugHotspots
                  ? pointerPosition
                    ? `x ${pointerPosition.x}%, y ${pointerPosition.y}%`
                    : "visible"
                  : "add ?hotspots=1"}
              </p>
            </div>
          </div>
        </aside>
      ) : null}
    </main>
  );
}
