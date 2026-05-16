"use client";

import Link from "next/link";
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
import type { Hotspot, Scene, SceneSlug, SceneTicker } from "@/lib/scenes";
import { sceneSlugs, scenes } from "@/lib/scenes";
import {
  getInitialPlaylistPosition,
  getScenePlaylistPlayback,
  getSyncedPlaylistPositionForTracks,
  type SyncedPlaylistPosition,
} from "@/lib/playlist-sync";

type RoomExperienceProps = {
  scene: Scene;
};

type PointerPosition = {
  x: number;
  y: number;
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

function getHotspotZIndex(hotspot: Hotspot) {
  return hotspot.zIndex ?? 0;
}

function sortHotspotsByZOrder(hotspots: Hotspot[]) {
  return [...hotspots].sort(
    (a, b) => getHotspotZIndex(a) - getHotspotZIndex(b),
  );
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

type SyncedTickerProps = {
  ticker: SceneTicker;
  devBorders: boolean;
};

const TICKER_GAP_PIXELS = 96;
const ROOM_TRANSITION_MS = 200;

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
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

export function RoomExperience({ scene: initialScene }: RoomExperienceProps) {
  const [scene, setActiveScene] = useState(initialScene);
  const searchParams = useSearchParams();
  const {
    attachVideoAudio,
    detachVideoAudio,
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const debugHotspots =
    searchParams.get("hotspots") === "1" || searchParams.get("debug") === "1";
  const [pointerPosition, setPointerPosition] =
    useState<PointerPosition | null>(null);
  const [devPanelOpen, setDevPanelOpen] = useState(false);
  const [devBorders, setDevBorders] = useState(
    searchParams.get("dev") === "1",
  );
  const [videoAudioMuted, setVideoAudioMuted] = useState(false);
  const [playlistAudioMuted, setPlaylistAudioMuted] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [playlistTrackIndex, setPlaylistTrackIndex] = useState(
    () => getInitialPlaylistPosition(scene).trackIndex,
  );
  const [playlistStartTime, setPlaylistStartTime] = useState(
    () => getInitialPlaylistPosition(scene).currentTime,
  );
  const fadeOutInProgressRef = useRef(false);
  const navigationIdRef = useRef(0);
  const [isExiting, setIsExiting] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [audioTransitionMuted, setAudioTransitionMuted] = useState(false);

  const aspectRatio = useMemo(
    () => `${scene.video.width} / ${scene.video.height}`,
    [scene.video.height, scene.video.width],
  );

  const syncedPlayback = scene.video.sync?.enabled ?? false;
  const videoAudioEnabled = scene.video.audio?.enabled ?? false;
  const videoVolume = scene.video.audio?.volume ?? 0.8;
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
  const orderedHotspots = useMemo(
    () => sortHotspotsByZOrder(scene.hotspots),
    [scene.hotspots],
  );
  const transitionActive = isExiting || !videoReady;

  function markVideoReady() {
    if (fadeOutInProgressRef.current) {
      return;
    }

    setAudioTransitionMuted(false);
    setVideoReady(true);
    setIsExiting(false);
  }

  const getSyncedTime = useCallback(
    () => {
      const offset = scene.video.sync?.epochOffsetSeconds ?? 0;
      const duration = scene.video.durationSeconds;

      return (((Date.now() / 1000 + offset) % duration) + duration) % duration;
    },
    [scene.video.durationSeconds, scene.video.sync?.epochOffsetSeconds],
  );

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
    const video = videoRef.current;

    if (!video || !syncedPlayback) {
      return;
    }

    const expectedTime = getSyncedTime();

    if (
      Number.isFinite(expectedTime) &&
      Math.abs(video.currentTime - expectedTime) > 1.5
    ) {
      video.currentTime = expectedTime;
    }
  }, [getSyncedTime, syncedPlayback]);

  const resumeRoomMedia = useCallback(() => {
    const video = videoRef.current;

    if (video) {
      video.volume = videoVolume;
      video.muted = !hasEntered;
      setVideoAudioLevel(videoVolume, !videoAudioActive);
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
  }, [
    hasEntered,
    setVideoAudioLevel,
    syncVideoTime,
    videoAudioActive,
    videoVolume,
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

      if (key === "b") {
        setDevBorders((current) => !current);
      }

      if (key === "h") {
        setDevPanelOpen((current) => !current);
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, []);

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
    const video = videoRef.current;

    if (!video) {
      return;
    }

    video.volume = 1;
    setVideoAudioLevel(videoVolume, !videoAudioActive);

    void video.play().catch((error: unknown) => {
      if (isExpectedMediaInterruption(error)) {
        return;
      }

      if (videoAudioActive) {
        setAudioError(getMediaErrorMessage(error, "Audio blocked"));
      }
    });
  }, [
    scene.video.src,
    setVideoAudioLevel,
    videoAudioActive,
    videoVolume,
  ]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video || !hasEntered) {
      return;
    }

    void attachVideoAudio(video, videoVolume).catch((error: unknown) => {
      setAudioError(getMediaErrorMessage(error, "Video audio mixer blocked"));
    });

    return () => {
      detachVideoAudio(video);
    };
  }, [attachVideoAudio, detachVideoAudio, hasEntered, scene.video.src, videoVolume]);

  useEffect(() => {
    if (!playlistEnabled || playlistTracks.length === 0) {
      return;
    }

    const syncPlaylist = () => {
      const position = getSyncedPlaylistPosition();

      if (!position) {
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
    const video = videoRef.current;
    const playPromises: Promise<unknown>[] = [];

    setAudioError(null);
    markEntered();
    setVideoAudioMuted(false);
    setPlaylistAudioMuted(false);

    const roomPlaylistOptions = sceneSlugs.flatMap((slug) => {
      const targetScene = scenes[slug];
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
      playPromises.push(attachVideoAudio(video, videoVolume));
      video.muted = false;
      setVideoAudioLevel(videoVolume, false);

      if (syncedPlayback) {
        video.currentTime = getSyncedTime();
      }

      playPromises.push(video.play());
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
    const video = videoRef.current;

    if (!hasEntered) {
      void enterPlanet();
      return;
    }

    const nextMuted = !videoAudioMuted;
    setVideoAudioMuted(nextMuted);

    if (video) {
      setVideoAudioLevel(videoVolume, nextMuted || !videoAudioEnabled);
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

  const playPlaylistForScene = useCallback(async (targetScene: Scene) => {
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
    setActivePlaylistRoom(targetScene.slug, targetPlaylist.volume, false);
  }, [
    hasEntered,
    playRoomPlaylistTrack,
    playlistAudioMuted,
    scene.slug,
    setActivePlaylistRoom,
    setRoomPlaylistAudioLevel,
  ]);

  const switchScene = useCallback((targetScene: Scene, href: string, mode: "push" | "replace") => {
    const position = getInitialPlaylistPosition(targetScene);

    fadeOutInProgressRef.current = false;
    setPointerPosition(null);
    setActiveScene(targetScene);
    setPlaylistTrackIndex(position.trackIndex);
    setPlaylistStartTime(position.currentTime);
    setVideoReady(false);

    if (window.location.pathname !== href) {
      window.history[mode === "push" ? "pushState" : "replaceState"](
        { paperPlanetRoom: targetScene.slug },
        "",
        href,
      );
    }
  }, []);

  const transitionToScene = useCallback(
    async (targetScene: Scene, href: string, mode: "push" | "replace") => {
      const navigationId = navigationIdRef.current + 1;
      navigationIdRef.current = navigationId;
      fadeOutInProgressRef.current = true;

      setAudioError(null);
      setAudioTransitionMuted(true);
      setVideoAudioLevel(videoVolume, true);
      setRoomPlaylistAudioLevel(scene.slug, playlistVolume, true);
      setIsExiting(true);

      const playlistPromise =
        hasEntered && !playlistAudioMuted
          ? playPlaylistForScene(targetScene).catch((error: unknown) => {
              if (isExpectedMediaInterruption(error)) {
                return;
              }

              setAudioError(
                getMediaErrorMessage(error, "Playlist audio blocked"),
              );
            })
          : Promise.resolve();

      await wait(ROOM_TRANSITION_MS);

      if (navigationIdRef.current !== navigationId) {
        return;
      }

      switchScene(targetScene, href, mode);
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

  async function handleRoomNavigation(
    event: MouseEvent<HTMLAnchorElement>,
    href: string,
  ) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.shiftKey ||
      !href.startsWith("/rooms/")
    ) {
      return;
    }

    if (href === `/rooms/${scene.slug}`) {
      event.preventDefault();
      return;
    }

    event.preventDefault();

    const targetSlug = href.replace(/^\/rooms\//, "") as SceneSlug;
    const targetScene = scenes[targetSlug];

    if (targetScene) {
      void transitionToScene(targetScene, href, "push");
      return;
    }

    window.location.assign(href);
  }

  useEffect(() => {
    const handleRoomPopState = () => {
      const match = window.location.pathname.match(/^\/rooms\/([^/?#]+)/);
      const targetSlug = match?.[1] as SceneSlug | undefined;
      const targetScene = targetSlug ? scenes[targetSlug] : undefined;

      if (!targetScene || targetScene.slug === scene.slug) {
        return;
      }

      void transitionToScene(
        targetScene,
        `/rooms/${targetScene.slug}`,
        "replace",
      );
    };

    window.addEventListener("popstate", handleRoomPopState);

    return () => {
      window.removeEventListener("popstate", handleRoomPopState);
    };
  }, [scene.slug, transitionToScene]);

  function getActionHref(action: Hotspot["action"]) {
    if (action.type === "navigate") {
      return `/rooms/${action.target}`;
    }

    const subject = action.subject
      ? `?subject=${encodeURIComponent(action.subject)}`
      : "";
    return `mailto:${action.email}${subject}`;
  }

  function getHotspotHref(hotspot: Hotspot) {
    return getActionHref(hotspot.action);
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

  return (
    <main
      className={classNames(
        "relative min-h-dvh overflow-hidden bg-black text-white",
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
      <section
        className={classNames(
          "flex min-h-dvh items-center justify-center p-3 sm:p-5",
          devOutline(devBorders, 1),
        )}
      >
        <div
          className={classNames(
            "relative w-full max-w-[min(100%,calc(100dvh-2.5rem))] overflow-hidden bg-black",
            devOutline(devBorders, 2),
          )}
          style={{ aspectRatio }}
          onPointerDown={handleFramePointer}
        >
          <video
            key={scene.video.src}
            ref={videoRef}
            className={classNames(
              "absolute inset-0 z-0 h-full w-full object-cover",
              devOutline(devBorders, 3),
            )}
            src={scene.video.src}
            crossOrigin="anonymous"
            autoPlay
            muted={!hasEntered}
            loop
            playsInline
            preload="metadata"
            aria-label={`${scene.title} room video`}
            onLoadedMetadata={(event) => {
              event.currentTarget.volume = videoVolume;

              if (syncedPlayback) {
                event.currentTarget.currentTime = getSyncedTime();
              }
            }}
            onLoadedData={markVideoReady}
            onCanPlay={markVideoReady}
          />

          {scene.ticker ? (
            <SyncedTicker ticker={scene.ticker} devBorders={devBorders} />
          ) : null}

          <svg
            className={classNames(
              "pointer-events-none absolute inset-0 z-10 h-full w-full",
              devOutline(devBorders, 4),
            )}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden={!debugHotspots}
          >
            {orderedHotspots.map((hotspot) => (
                <a
                  key={hotspot.id}
                  href={getHotspotHref(hotspot)}
                  onClick={(event) =>
                    handleRoomNavigation(event, getHotspotHref(hotspot))
                  }
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
              ))}
          </svg>

          {scene.overlays?.map((overlay) => (
            <Link
              key={overlay.id}
              href={getActionHref(overlay.action)}
              onClick={(event) =>
                handleRoomNavigation(event, getActionHref(overlay.action))
              }
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
            </Link>
          ))}
        </div>
      </section>

      <div
        className={classNames(
          "fixed inset-0 z-40 bg-black transition-opacity duration-200",
          transitionActive
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0",
          devOutline(devBorders, 4),
        )}
        aria-hidden="true"
      />

      {!hasEntered ? (
        <div
          className={classNames(
            "fixed inset-0 z-50 flex items-center justify-center bg-black text-white",
            devOutline(devBorders, 4),
          )}
        >
          <button
            type="button"
            onPointerDown={() => {
              if (activePlaylistTrack) {
                primeRoomPlaylistTrack(scene.slug, activePlaylistTrack.src);
              }
            }}
            onClick={enterPlanet}
            className={classNames(
              "cursor-pointer border border-white px-8 py-4 font-mono text-sm uppercase tracking-[0.22em] text-white transition hover:bg-white hover:text-black focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-4 focus-visible:ring-offset-black",
              devOutline(devBorders, 5),
            )}
          >
            Enter
          </button>
        </div>
      ) : null}

      {devPanelOpen ? (
        <aside
          className={classNames(
            "fixed right-3 top-3 z-50 w-[min(15rem,calc(100vw-1.5rem))] border border-white/20 bg-black/85 font-mono text-[0.65rem] leading-snug text-white shadow-2xl backdrop-blur",
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
                <Link
                  key={slug}
                  href={`/rooms/${slug}`}
                  onClick={(event) =>
                    handleRoomNavigation(event, `/rooms/${slug}`)
                  }
                  aria-current={scene.slug === slug ? "page" : undefined}
                  className={classNames(
                    "truncate border border-white/20 px-2 py-1 text-center uppercase text-white/70 hover:border-white/70 hover:text-white aria-[current=page]:border-white aria-[current=page]:text-white",
                    devOutline(devBorders, 3 + index),
                  )}
                >
                  {scenes[slug].title}
                </Link>
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
                <p className="text-white/80">
                  Now playing: {playlistTrackIndex + 1}/{playlistTracks.length}{" "}
                  {activePlaylistTrack.title}
                </p>
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
              <p>
                Video: {scene.video.width}x{scene.video.height} /{" "}
                {scene.video.durationSeconds.toFixed(3)}s
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
