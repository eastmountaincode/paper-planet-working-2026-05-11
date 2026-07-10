import { useCallback, useEffect, useRef } from "react";
import { getSceneVideoSource, type Scene } from "@/lib/scenes";
import {
  getPreferredSceneViewport,
  getSceneSyncedVideoTime,
  getSceneVideoPreloadKey,
} from "./media-utils";

type PreloadedVideo = {
  element: HTMLVideoElement;
  lastUsedAt: number;
};

const MAX_PRELOADED_ROOM_VIDEOS = 2;
const VIDEO_PRELOAD_INTENT_DELAY_MS = 80;
const MIN_VIDEO_PRELOAD_DOWNLINK_MBPS = 5;

type NavigatorWithConnection = Navigator & {
  connection?: {
    downlink?: number;
    effectiveType?: string;
    saveData?: boolean;
  };
};

function shouldPrimeSceneVideo() {
  const connection = (navigator as NavigatorWithConnection).connection;

  if (!connection) {
    return true;
  }

  if (
    connection.saveData ||
    connection.effectiveType === "slow-2g" ||
    connection.effectiveType === "2g"
  ) {
    return false;
  }

  return !(
    typeof connection.downlink === "number" &&
    connection.downlink > 0 &&
    connection.downlink <= MIN_VIDEO_PRELOAD_DOWNLINK_MBPS
  );
}

function releaseVideo(video: HTMLVideoElement) {
  video.pause();
  video.removeAttribute("src");
  video.load();
}

export function useRoomMediaPreloader() {
  const preloadedVideosRef = useRef(new Map<string, PreloadedVideo>());
  const pendingPreloadTimersRef = useRef(new Map<string, number>());

  const consumeSceneVideo = useCallback((scene: Scene) => {
    const viewport = getPreferredSceneViewport();
    const key = getSceneVideoPreloadKey(scene, viewport);
    const pendingTimer = pendingPreloadTimersRef.current.get(key);
    const existing = preloadedVideosRef.current.get(key);

    if (pendingTimer !== undefined) {
      window.clearTimeout(pendingTimer);
      pendingPreloadTimersRef.current.delete(key);
    }

    if (!existing) {
      return;
    }

    // The decoded response data remains browser-cacheable, but the detached
    // element must not compete with the visible element for range requests or
    // a hardware decoder once navigation begins.
    releaseVideo(existing.element);
    preloadedVideosRef.current.delete(key);
  }, []);

  const primeSceneVideo = useCallback((scene: Scene) => {
    // A detached media element is valuable on a fast connection, but on a
    // constrained link its partial range request competes with the element
    // mounted by the eventual click. Honor explicit data-saving preferences
    // and Chromium's conservative downlink estimate when available.
    if (!shouldPrimeSceneVideo()) {
      return;
    }

    const viewport = getPreferredSceneViewport();
    const source = getSceneVideoSource(scene, viewport);
    const key = getSceneVideoPreloadKey(scene, viewport);
    const existing = preloadedVideosRef.current.get(key);

    if (existing) {
      existing.lastUsedAt = performance.now();
      return;
    }

    if (pendingPreloadTimersRef.current.has(key)) {
      return;
    }

    const timer = window.setTimeout(() => {
      pendingPreloadTimersRef.current.delete(key);

      if (preloadedVideosRef.current.has(key)) {
        return;
      }

      const video = document.createElement("video");
      const entry: PreloadedVideo = {
        element: video,
        lastUsedAt: performance.now(),
      };
      let frameRequested = false;

      const pauseAfterFrame = () => {
        if (frameRequested) {
          return;
        }

        frameRequested = true;

        const videoWithFrameCallback = video as HTMLVideoElement & {
          requestVideoFrameCallback?: (callback: () => void) => number;
        };

        if (
          typeof videoWithFrameCallback.requestVideoFrameCallback === "function"
        ) {
          videoWithFrameCallback.requestVideoFrameCallback(() => video.pause());
          return;
        }

        window.requestAnimationFrame(() => video.pause());
      };

      const warmSyncedFrame = () => {
        const targetTime = getSceneSyncedVideoTime(scene);

        if (
          Number.isFinite(targetTime) &&
          Math.abs(video.currentTime - targetTime) > 0.5
        ) {
          video.currentTime = targetTime;
        }

        void video.play().then(pauseAfterFrame).catch(() => undefined);
      };

      video.preload = "auto";
      video.muted = true;
      video.playsInline = true;
      video.crossOrigin = "anonymous";
      video.src = source.src;
      video.addEventListener("loadedmetadata", warmSyncedFrame, { once: true });
      video.addEventListener("canplay", pauseAfterFrame, { once: true });

      preloadedVideosRef.current.set(key, entry);
      video.load();

      if (preloadedVideosRef.current.size <= MAX_PRELOADED_ROOM_VIDEOS) {
        return;
      }

      const oldest = [...preloadedVideosRef.current.entries()]
        .filter(([candidateKey]) => candidateKey !== key)
        .sort(([, left], [, right]) => left.lastUsedAt - right.lastUsedAt)[0];

      if (oldest) {
        releaseVideo(oldest[1].element);
        preloadedVideosRef.current.delete(oldest[0]);
      }
    }, VIDEO_PRELOAD_INTENT_DELAY_MS);

    pendingPreloadTimersRef.current.set(key, timer);
  }, []);

  useEffect(
    () => () => {
      for (const timer of pendingPreloadTimersRef.current.values()) {
        window.clearTimeout(timer);
      }

      for (const { element } of preloadedVideosRef.current.values()) {
        releaseVideo(element);
      }

      pendingPreloadTimersRef.current.clear();
      preloadedVideosRef.current.clear();
    },
    [],
  );

  return { consumeSceneVideo, primeSceneVideo };
}
