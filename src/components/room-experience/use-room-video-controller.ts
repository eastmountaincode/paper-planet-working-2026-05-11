import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { Scene, SceneViewport } from "@/lib/scenes";
import { sceneViewports } from "@/lib/scenes";
import {
  VIDEO_LOAD_RECOVERY_LIMIT,
  VIDEO_LOAD_RECOVERY_MS,
  VIDEO_READY_CHECK_MS,
} from "./constants";
import {
  getMediaErrorMessage,
  isExpectedMediaInterruption,
} from "./media-utils";
import { MOBILE_SCENE_VIEWPORT_MAX_ASPECT } from "./safe-square";

type VideoLoadWatch = {
  attempts: number;
  key: string;
  lastRecoveryAt: number;
  startedAt: number;
};

type UseRoomVideoControllerOptions = {
  audioTransitionMuted: boolean;
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

function getPreferredSceneViewport(): SceneViewport {
  if (typeof window === "undefined") {
    return "desktop";
  }

  const browserAspect = window.innerWidth / Math.max(window.innerHeight, 1);

  return browserAspect <= MOBILE_SCENE_VIEWPORT_MAX_ASPECT
    ? "mobile"
    : "desktop";
}

export function useRoomVideoController({
  audioTransitionMuted,
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
  const videoLoadWatchRef = useRef(createVideoLoadWatch());
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

  const markVideoReady = useCallback(() => {
    if (fadeOutInProgressRef.current) {
      return;
    }

    pendingVideoFrameKeyRef.current = null;
    videoLoadWatchRef.current = createVideoLoadWatch();
    setAudioTransitionMuted(false);
    setVideoReady(true);
    setIsExiting(false);
  }, [fadeOutInProgressRef, setAudioTransitionMuted]);

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

      if (visibleViewport !== nextViewport && nextVideo) {
        syncVideoElementTime(nextVideo);
        applyVideoElementAudioState(nextViewport);
        nextVideo.preload = "auto";
        void nextVideo.play().catch(() => undefined);

        if (nextVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          visibleSceneViewportRef.current = nextViewport;
          setVisibleSceneViewport(nextViewport);
          applyVideoElementAudioState(nextViewport);
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
  }, [applyVideoElementAudioState, syncVideoElementTime]);

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
        )}s / ready ${video.readyState} / net ${video.networkState}`,
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
    scene.slug,
    videoAudioActive,
    videoVolume,
  ]);

  return {
    handleVariantVideoReady,
    isExiting,
    muteAllVideosForTransition,
    playVisibleVideoOnEnter,
    recordVisibleVideoTime: (timeSeconds: number) => {
      lastVideoTimeRef.current = timeSeconds;
    },
    resetVideoForSceneSwitch,
    resolvedSceneViewport,
    sceneViewport,
    setIsExiting,
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
