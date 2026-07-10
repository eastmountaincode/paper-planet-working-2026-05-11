import {
  getSceneVideoSource,
  type Scene,
  type SceneViewport,
} from "@/lib/scenes";
import { MOBILE_SCENE_VIEWPORT_MAX_ASPECT } from "./safe-square";

export function isExpectedMediaInterruption(error: unknown) {
  if (!(error instanceof DOMException)) {
    return false;
  }

  return error.name === "AbortError";
}

export function getMediaErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export function getPreferredSceneViewport(): SceneViewport {
  if (typeof window === "undefined") {
    return "desktop";
  }

  const browserAspect = window.innerWidth / Math.max(window.innerHeight, 1);

  return browserAspect <= MOBILE_SCENE_VIEWPORT_MAX_ASPECT
    ? "mobile"
    : "desktop";
}

export function getSceneSyncedVideoTime(scene: Scene) {
  const duration = scene.video.durationSeconds;

  if (!scene.video.sync?.enabled || !Number.isFinite(duration) || duration <= 0) {
    return 0;
  }

  const offset = scene.video.sync.epochOffsetSeconds ?? 0;

  return (((Date.now() / 1000 + offset) % duration) + duration) % duration;
}

export function getSceneVideoPreloadKey(scene: Scene, viewport: SceneViewport) {
  return `${scene.slug}:${viewport}:${getSceneVideoSource(scene, viewport).src}`;
}
