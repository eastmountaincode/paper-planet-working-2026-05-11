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

function releaseVideo(video: HTMLVideoElement) {
  video.pause();
  video.removeAttribute("src");
  video.load();
}

export function useRoomMediaPreloader() {
  const preloadedVideosRef = useRef(new Map<string, PreloadedVideo>());

  const consumeSceneVideo = useCallback((scene: Scene) => {
    const viewport = getPreferredSceneViewport();
    const key = getSceneVideoPreloadKey(scene, viewport);
    const existing = preloadedVideosRef.current.get(key);

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
    const viewport = getPreferredSceneViewport();
    const source = getSceneVideoSource(scene, viewport);
    const key = getSceneVideoPreloadKey(scene, viewport);
    const existing = preloadedVideosRef.current.get(key);

    if (existing) {
      existing.lastUsedAt = performance.now();
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

      if (typeof videoWithFrameCallback.requestVideoFrameCallback === "function") {
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
  }, []);

  useEffect(
    () => () => {
      for (const { element } of preloadedVideosRef.current.values()) {
        releaseVideo(element);
      }

      preloadedVideosRef.current.clear();
    },
    [],
  );

  return { consumeSceneVideo, primeSceneVideo };
}
