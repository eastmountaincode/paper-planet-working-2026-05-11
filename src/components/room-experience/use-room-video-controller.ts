import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { Scene, SceneViewport } from "@/lib/scenes";
import { getSceneVideoSource, sceneViewports } from "@/lib/scenes";
import {
  ROOM_TRANSITION_MS,
  VIDEO_LOAD_RECOVERY_LIMIT,
  VIDEO_LOAD_RECOVERY_MS,
  VIDEO_READY_CHECK_MS,
} from "./constants";
import {
  getPreferredSceneViewport,
  getMediaErrorMessage,
  isExpectedMediaInterruption,
} from "./media-utils";

type VideoLoadWatch = {
  attempts: number;
  key: string;
  lastRecoveryAt: number;
  startedAt: number;
};

export type VideoPlaybackEvent =
  | "abort"
  | "emptied"
  | "ended"
  | "error"
  | "pause"
  | "playing"
  | "stalled"
  | "suspend"
  | "waiting";

type VideoHealthWatch = {
  attempts: number;
  key: string;
  lastAttemptAt: number;
  lastEvent: VideoPlaybackEvent | "progress" | "init";
  lastObservedTime: number;
  lastProgressAt: number;
};

const VIDEO_HEALTH_CHECK_MS = 2_000;
const VIDEO_STALL_THRESHOLD_MS = 5_000;
const VIDEO_RECOVERY_BACKOFF_MS = [0, 1_000, 3_000, 8_000, 15_000];

type UseRoomVideoControllerOptions = {
  audioTransitionMuted: boolean;
  debugStatusEnabled: boolean;
  fadeOutInProgressRef: { current: boolean };
  resumeActivePlaylistAudio: () => void;
  scene: Scene;
  setAudioError: (message: string | null) => void;
  setAudioTransitionMuted: Dispatch<SetStateAction<boolean>>;
  setVideoAudioLevel: (volume: number, muted: boolean) => void;
  syncedPlayback: boolean;
  videoAudioActive: boolean;
  videoAudioEnabled: boolean;
  videoVolume: number;
};

function createVideoLoadWatch(): VideoLoadWatch {
  return {
    attempts: 0,
    key: "",
    lastRecoveryAt: 0,
    startedAt: 0,
  };
}

function createVideoHealthWatch(key = ""): VideoHealthWatch {
  return {
    attempts: 0,
    key,
    lastAttemptAt: 0,
    lastEvent: "init",
    lastObservedTime: 0,
    lastProgressAt: performance.now(),
  };
}

export function useRoomVideoController({
  audioTransitionMuted,
  debugStatusEnabled,
  fadeOutInProgressRef,
  resumeActivePlaylistAudio,
  scene,
  setAudioError,
  setAudioTransitionMuted,
  setVideoAudioLevel,
  syncedPlayback,
  videoAudioActive,
  videoAudioEnabled,
  videoVolume,
}: UseRoomVideoControllerOptions) {
  const videoElementsRef = useRef<Record<SceneViewport, HTMLVideoElement | null>>(
    {
      desktop: null,
      mobile: null,
    },
  );
  const lastVideoTimeRef = useRef(0);
  const sceneViewportRef = useRef<SceneViewport | null>(null);
  const visibleSceneViewportRef = useRef<SceneViewport | null>(null);
  const pendingVideoFrameKeyRef = useRef<string | null>(null);
  const transitionMinimumUntilRef = useRef(0);
  const transitionRevealTimerRef = useRef<number | null>(null);
  const videoLoadWatchRef = useRef(createVideoLoadWatch());
  const videoHealthWatchRef = useRef<VideoHealthWatch | null>(null);
  const [sceneViewport, setSceneViewport] = useState<SceneViewport | null>(null);
  const [visibleSceneViewport, setVisibleSceneViewport] =
    useState<SceneViewport | null>(null);
  const [isExiting, setIsExiting] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [videoElementStatus, setVideoElementStatus] = useState("pending");
  const resolvedSceneViewport =
    visibleSceneViewport ?? sceneViewport ?? "desktop";

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

      if (video.seeking || video.readyState < HTMLMediaElement.HAVE_METADATA) {
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

  const applyVideoElementAudioState = useCallback(
    (
      visibleViewport = visibleSceneViewportRef.current ?? sceneViewportRef.current,
    ) => {
      let hasAudibleVideo = false;

      for (const viewport of sceneViewports) {
        const video = videoElementsRef.current[viewport];

        if (!video) {
          continue;
        }

        const isVisible = viewport === visibleViewport;
        const muted = !isVisible || !videoAudioActive || !videoAudioEnabled;

        video.volume = muted ? 0 : videoVolume;
        video.muted = muted;

        if (!muted) {
          hasAudibleVideo = true;
        }
      }

      setVideoAudioLevel(videoVolume, !hasAudibleVideo);
    },
    [setVideoAudioLevel, videoAudioActive, videoAudioEnabled, videoVolume],
  );

  const getVisibleVideoElement = useCallback(() => {
    const viewport = visibleSceneViewportRef.current ?? sceneViewportRef.current;

    return viewport ? videoElementsRef.current[viewport] : null;
  }, []);

  const revealReadyVideo = useCallback(() => {
    if (transitionRevealTimerRef.current !== null) {
      window.clearTimeout(transitionRevealTimerRef.current);
      transitionRevealTimerRef.current = null;
    }

    const reveal = () => {
      transitionRevealTimerRef.current = null;
      setAudioTransitionMuted(false);
      setIsExiting(false);
    };
    const remaining = transitionMinimumUntilRef.current - performance.now();

    if (remaining > 0) {
      transitionRevealTimerRef.current = window.setTimeout(reveal, remaining);
      return;
    }

    reveal();
  }, [setAudioTransitionMuted]);

  const markVideoReady = useCallback(() => {
    if (fadeOutInProgressRef.current) {
      return;
    }

    pendingVideoFrameKeyRef.current = null;
    videoLoadWatchRef.current = createVideoLoadWatch();
    setVideoReady(true);
    revealReadyVideo();
  }, [fadeOutInProgressRef, revealReadyVideo]);

  const beginVideoTransition = useCallback(() => {
    if (transitionRevealTimerRef.current !== null) {
      window.clearTimeout(transitionRevealTimerRef.current);
      transitionRevealTimerRef.current = null;
    }

    transitionMinimumUntilRef.current = performance.now() + ROOM_TRANSITION_MS;
    setIsExiting(true);
    setVideoReady(false);
  }, []);

  const confirmVideoFrameReady = useCallback(
    (viewport: SceneViewport, video: HTMLVideoElement) => {
      const frameKey = `${scene.slug}:${viewport}:${video.currentSrc || video.src}`;

      if (pendingVideoFrameKeyRef.current === frameKey) {
        return;
      }

      pendingVideoFrameKeyRef.current = frameKey;

      const markFrameReady = () => {
        if (
          pendingVideoFrameKeyRef.current !== frameKey ||
          sceneViewportRef.current !== viewport ||
          videoElementsRef.current[viewport] !== video ||
          video.seeking ||
          video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
        ) {
          return;
        }

        visibleSceneViewportRef.current = viewport;
        setVisibleSceneViewport(viewport);
        applyVideoElementAudioState(viewport);
        markVideoReady();
      };

      const videoWithFrameCallback = video as HTMLVideoElement & {
        requestVideoFrameCallback?: (callback: () => void) => number;
      };

      if (typeof videoWithFrameCallback.requestVideoFrameCallback === "function") {
        videoWithFrameCallback.requestVideoFrameCallback(markFrameReady);
        return;
      }

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(markFrameReady);
      });
    },
    [applyVideoElementAudioState, markVideoReady, scene.slug],
  );

  const handleVariantVideoReady = useCallback((viewport: SceneViewport) => {
    if (sceneViewportRef.current !== viewport) {
      return;
    }

    const video = videoElementsRef.current[viewport];

    if (video) {
      const didSeek = syncVideoElementTime(video);

      if (
        didSeek ||
        video.seeking ||
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        return;
      }
    }

    if (video) {
      confirmVideoFrameReady(viewport, video);
      return;
    }

    markVideoReady();
  }, [confirmVideoFrameReady, markVideoReady, syncVideoElementTime]);

  const syncVideoTime = useCallback(() => {
    const video = getVisibleVideoElement();

    if (!syncedPlayback) {
      return;
    }

    const expectedTime = getSyncedTime();

    if (
      video &&
      !video.seeking &&
      video.readyState >= HTMLMediaElement.HAVE_METADATA &&
      Number.isFinite(expectedTime) &&
      Math.abs(video.currentTime - expectedTime) > 1.5
    ) {
      video.currentTime = expectedTime;
    }
  }, [getSyncedTime, getVisibleVideoElement, syncedPlayback]);

  const resumeRoomMedia = useCallback(() => {
    const video = getVisibleVideoElement();

    if (video) {
      applyVideoElementAudioState();
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
    applyVideoElementAudioState,
    getVisibleVideoElement,
    setAudioError,
    syncVideoTime,
    videoAudioActive,
  ]);

  const playVisibleVideoOnEnter = useCallback(() => {
    const video = getVisibleVideoElement();

    if (!video) {
      setVideoAudioLevel(videoVolume, true);
      return null;
    }

    for (const viewport of sceneViewports) {
      const element = videoElementsRef.current[viewport];

      if (!element) {
        continue;
      }

      const isVisible = element === video;
      const muted = !isVisible || !videoAudioEnabled;

      element.volume = muted ? 0 : videoVolume;
      element.muted = muted;
    }

    setVideoAudioLevel(videoVolume, !videoAudioEnabled);

    if (syncedPlayback) {
      video.currentTime = getSyncedTime();
    }

    return video.play();
  }, [
    getSyncedTime,
    getVisibleVideoElement,
    setVideoAudioLevel,
    syncedPlayback,
    videoAudioEnabled,
    videoVolume,
  ]);

  const toggleVisibleVideoAudio = useCallback(
    (nextMuted: boolean) => {
      const video = getVisibleVideoElement();
      let hasAudibleVideo = false;

      for (const viewport of sceneViewports) {
        const element = videoElementsRef.current[viewport];

        if (!element) {
          continue;
        }

        const isVisible = element === video;
        const muted =
          !isVisible || nextMuted || !videoAudioEnabled || audioTransitionMuted;

        element.volume = muted ? 0 : videoVolume;
        element.muted = muted;

        if (!muted) {
          hasAudibleVideo = true;
        }
      }

      setVideoAudioLevel(videoVolume, !hasAudibleVideo);
      void video?.play().catch((error: unknown) => {
        if (isExpectedMediaInterruption(error)) {
          return;
        }

        if (!nextMuted && videoAudioEnabled) {
          setAudioError(getMediaErrorMessage(error, "Video playback blocked"));
        }
      });
    },
    [
      audioTransitionMuted,
      getVisibleVideoElement,
      setAudioError,
      setVideoAudioLevel,
      videoAudioEnabled,
      videoVolume,
    ],
  );

  const handleVideoPlaybackEvent = useCallback(
    (
      viewport: SceneViewport,
      video: HTMLVideoElement,
      event: VideoPlaybackEvent,
    ) => {
      const visibleViewport =
        visibleSceneViewportRef.current ?? sceneViewportRef.current;

      if (viewport !== visibleViewport) {
        return;
      }

      const key = `${scene.slug}:${viewport}:${video.currentSrc || video.src}`;
      let watch = videoHealthWatchRef.current;

      if (!watch || watch.key !== key) {
        watch = createVideoHealthWatch(key);
        watch.lastObservedTime = video.currentTime;
        videoHealthWatchRef.current = watch;
      }

      watch.lastEvent = event;

      if (event === "playing") {
        watch.attempts = 0;
        watch.lastProgressAt = performance.now();
        watch.lastObservedTime = video.currentTime;
      }

      if (
        event === "abort" ||
        event === "emptied" ||
        event === "error" ||
        event === "pause" ||
        event === "stalled"
      ) {
        watch.lastProgressAt = Math.min(
          watch.lastProgressAt,
          performance.now() - VIDEO_STALL_THRESHOLD_MS,
        );
      }
    },
    [scene.slug],
  );

  const muteAllVideosForTransition = useCallback(() => {
    for (const viewport of sceneViewports) {
      const video = videoElementsRef.current[viewport];

      if (!video) {
        continue;
      }

      video.volume = 0;
      video.muted = true;
    }
  }, []);

  const resetVideoForSceneSwitch = useCallback(() => {
    lastVideoTimeRef.current = 0;
    pendingVideoFrameKeyRef.current = null;
    videoLoadWatchRef.current = createVideoLoadWatch();
    videoHealthWatchRef.current = null;
    setVideoReady(false);
  }, []);

  useEffect(() => {
    visibleSceneViewportRef.current = visibleSceneViewport;
  }, [visibleSceneViewport, scene.slug]);

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
        applyVideoElementAudioState(nextViewport);
        return;
      }

      if (visibleViewport !== nextViewport) {
        setVideoReady(false);

        if (nextVideo) {
          syncVideoElementTime(nextVideo);
          nextVideo.preload = "auto";
          void nextVideo.play().catch(() => undefined);

          if (nextVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            confirmVideoFrameReady(nextViewport, nextVideo);
          }
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
  }, [
    applyVideoElementAudioState,
    confirmVideoFrameReady,
    syncVideoElementTime,
  ]);

  useEffect(
    () => () => {
      if (transitionRevealTimerRef.current !== null) {
        window.clearTimeout(transitionRevealTimerRef.current);
      }
    },
    [],
  );

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

      const now = window.performance.now();
      const videoKey = `${scene.slug}:${viewport}:${video.currentSrc || video.src}`;

      if (videoLoadWatchRef.current.key !== videoKey) {
        videoLoadWatchRef.current = {
          attempts: 0,
          key: videoKey,
          lastRecoveryAt: 0,
          startedAt: now,
        };
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
        return;
      }

      const watch = videoLoadWatchRef.current;
      const hasWaitedLongEnough =
        now - watch.startedAt >= VIDEO_LOAD_RECOVERY_MS &&
        now - watch.lastRecoveryAt >= VIDEO_LOAD_RECOVERY_MS;

      if (
        hasWaitedLongEnough &&
        watch.attempts < VIDEO_LOAD_RECOVERY_LIMIT &&
        !video.seeking &&
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        videoLoadWatchRef.current = {
          ...watch,
          attempts: watch.attempts + 1,
          lastRecoveryAt: now,
        };
        pendingVideoFrameKeyRef.current = null;
        video.load();
        void video.play().catch(() => undefined);
      }
    };

    const animationFrame = window.requestAnimationFrame(checkActiveVideo);
    const timeout = window.setTimeout(checkActiveVideo, VIDEO_READY_CHECK_MS);
    const interval = window.setInterval(checkActiveVideo, VIDEO_READY_CHECK_MS);

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
    const checkVideoHealth = () => {
      if (document.hidden || !navigator.onLine) {
        return;
      }

      const video = getVisibleVideoElement();
      const viewport =
        visibleSceneViewportRef.current ?? sceneViewportRef.current;

      if (!video || !viewport) {
        return;
      }

      const key = `${scene.slug}:${viewport}:${video.currentSrc || video.src}`;
      const now = performance.now();
      let watch = videoHealthWatchRef.current;

      if (!watch || watch.key !== key) {
        watch = createVideoHealthWatch(key);
        watch.lastObservedTime = video.currentTime;
        videoHealthWatchRef.current = watch;
      }

      const progressed =
        video.currentTime > watch.lastObservedTime + 0.05 ||
        video.currentTime < watch.lastObservedTime - 0.5;

      if (progressed) {
        watch.attempts = 0;
        watch.lastEvent = "progress";
        watch.lastObservedTime = video.currentTime;
        watch.lastProgressAt = now;
        return;
      }

      watch.lastObservedTime = video.currentTime;

      const sourceIsBroken =
        Boolean(video.error) ||
        video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE;
      const explicitlyUnhealthy =
        sourceIsBroken ||
        video.paused ||
        !video.currentSrc;
      const stoppedProgressing =
        !video.seeking &&
        now - watch.lastProgressAt >= VIDEO_STALL_THRESHOLD_MS;

      if (!explicitlyUnhealthy && !stoppedProgressing) {
        return;
      }

      const backoffIndex = Math.min(
        watch.attempts,
        VIDEO_RECOVERY_BACKOFF_MS.length - 1,
      );
      const recoveryDelay = VIDEO_RECOVERY_BACKOFF_MS[backoffIndex];

      if (now - watch.lastAttemptAt < recoveryDelay) {
        return;
      }

      watch.attempts += 1;
      watch.lastAttemptAt = now;

      if (sourceIsBroken || watch.attempts >= 3) {
        const expectedSource = getSceneVideoSource(scene, viewport).src;
        const absoluteExpectedSource = new URL(
          expectedSource,
          window.location.href,
        ).href;

        pendingVideoFrameKeyRef.current = null;
        setVideoReady(false);

        if (video.src !== absoluteExpectedSource) {
          video.src = expectedSource;
        }

        video.load();
      } else {
        syncVideoElementTime(video);
      }

      void video.play().catch((error: unknown) => {
        if (!isExpectedMediaInterruption(error)) {
          setAudioError(
            getMediaErrorMessage(error, "Room video recovery failed"),
          );
        }
      });
    };

    const handleReturn = () => {
      if (!document.hidden) {
        checkVideoHealth();
      }
    };
    const interval = window.setInterval(
      checkVideoHealth,
      VIDEO_HEALTH_CHECK_MS,
    );

    window.addEventListener("focus", handleReturn);
    window.addEventListener("online", handleReturn);
    document.addEventListener("visibilitychange", handleReturn);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleReturn);
      window.removeEventListener("online", handleReturn);
      document.removeEventListener("visibilitychange", handleReturn);
    };
  }, [
    getVisibleVideoElement,
    scene,
    setAudioError,
    syncVideoElementTime,
  ]);

  useEffect(() => {
    applyVideoElementAudioState(resolvedSceneViewport);
  }, [applyVideoElementAudioState, resolvedSceneViewport, scene.slug]);

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
      setVideoAudioLevel(videoVolume, true);
      return;
    }

    applyVideoElementAudioState();

    void video.play().catch((error: unknown) => {
      if (isExpectedMediaInterruption(error)) {
        return;
      }

      if (videoAudioActive) {
        setAudioError(getMediaErrorMessage(error, "Audio blocked"));
      }
    });
  }, [
    applyVideoElementAudioState,
    getVisibleVideoElement,
    resolvedSceneViewport,
    scene.slug,
    setAudioError,
    setVideoAudioLevel,
    videoAudioActive,
    videoVolume,
  ]);

  useEffect(() => {
    if (!debugStatusEnabled) {
      return undefined;
    }

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
        )} / ${video.paused ? "paused" : "playing"} / ${video.currentTime.toFixed(
          1,
        )}s / ready ${video.readyState} / net ${video.networkState} / health ${
          videoHealthWatchRef.current?.lastEvent ?? "init"
        } / retries ${videoHealthWatchRef.current?.attempts ?? 0}`,
      );
    };

    updateVideoElementStatus();
    const interval = window.setInterval(updateVideoElementStatus, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [
    debugStatusEnabled,
    getVisibleVideoElement,
    resolvedSceneViewport,
    scene.slug,
    videoAudioActive,
    videoVolume,
  ]);

  return {
    beginVideoTransition,
    handleVariantVideoReady,
    handleVideoPlaybackEvent,
    isExiting,
    muteAllVideosForTransition,
    playVisibleVideoOnEnter,
    recordVisibleVideoTime: (timeSeconds: number) => {
      lastVideoTimeRef.current = timeSeconds;

      const watch = videoHealthWatchRef.current;

      if (
        watch &&
        (timeSeconds > watch.lastObservedTime + 0.05 ||
          timeSeconds < watch.lastObservedTime - 0.5)
      ) {
        watch.attempts = 0;
        watch.lastEvent = "progress";
        watch.lastObservedTime = timeSeconds;
        watch.lastProgressAt = performance.now();
      }
    },
    resetVideoForSceneSwitch,
    resolvedSceneViewport,
    sceneViewport,
    setVideoElement: (
      viewport: SceneViewport,
      element: HTMLVideoElement | null,
    ) => {
      videoElementsRef.current[viewport] = element;
    },
    syncVideoElementTime,
    toggleVisibleVideoAudio,
    transitionActive: isExiting || !videoReady,
    videoElementStatus,
    visibleSceneViewport,
  };
}
