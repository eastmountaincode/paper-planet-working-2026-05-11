import {
  useCallback,
  useEffect,
  type Dispatch,
  type MouseEvent,
  type SetStateAction,
} from "react";
import { getInitialPlaylistPosition } from "@/lib/playlist-sync";
import type {
  Hotspot,
  Scene,
  SceneSlug,
} from "@/lib/scenes";
import { ROOT_HREF } from "./constants";
import {
  getMediaErrorMessage,
  isExpectedMediaInterruption,
} from "./media-utils";
import type { PointerPosition } from "./types";

type UseRoomNavigationOptions = {
  beginVideoTransition: () => void;
  consumeSceneVideo: (targetScene: Scene) => void;
  currentScene: Scene;
  fadeOutInProgressRef: { current: boolean };
  hasEntered: boolean;
  muteAllVideosForTransition: () => void;
  playPlaylistForScene: (targetScene: Scene, muted?: boolean) => Promise<void>;
  playlistAudioMuted: boolean;
  playlistVolume: number;
  primeScenePlaylist: (targetScene: Scene) => void;
  primeSceneVideo: (targetScene: Scene) => void;
  resetStageTransform: () => void;
  resetVideoForSceneSwitch: () => void;
  runtimeScenes: Record<SceneSlug, Scene>;
  sceneSlugRef: { current: SceneSlug };
  setActiveScene: Dispatch<SetStateAction<Scene>>;
  setAudioError: (message: string | null) => void;
  setAudioTransitionMuted: Dispatch<SetStateAction<boolean>>;
  setCreditsOpen: Dispatch<SetStateAction<boolean>>;
  setPlaylistStartTime: Dispatch<SetStateAction<number>>;
  setPlaylistTrackIndex: Dispatch<SetStateAction<number>>;
  setPointerPosition: Dispatch<SetStateAction<PointerPosition | null>>;
  setRoomPlaylistAudioLevel: (
    room: SceneSlug,
    volume: number,
    muted: boolean,
  ) => void;
  setVideoAudioLevel: (volume: number, muted: boolean) => void;
  videoVolume: number;
};

function getRootHistoryHref() {
  return window.location.search ? `/${window.location.search}` : ROOT_HREF;
}

export function getHotspotActionHref(action: Hotspot["action"]) {
  if (action.type === "navigate") {
    return ROOT_HREF;
  }

  if (action.type === "externalLink") {
    return action.url;
  }

  if (action.type === "credits") {
    return "#credits";
  }

  const subject = action.subject
    ? `?subject=${encodeURIComponent(action.subject)}`
    : "";
  return `mailto:${action.email}${subject}`;
}

export function useRoomNavigation({
  beginVideoTransition,
  consumeSceneVideo,
  currentScene,
  fadeOutInProgressRef,
  hasEntered,
  muteAllVideosForTransition,
  playPlaylistForScene,
  playlistAudioMuted,
  playlistVolume,
  primeScenePlaylist,
  primeSceneVideo,
  resetStageTransform,
  resetVideoForSceneSwitch,
  runtimeScenes,
  sceneSlugRef,
  setActiveScene,
  setAudioError,
  setAudioTransitionMuted,
  setCreditsOpen,
  setPlaylistStartTime,
  setPlaylistTrackIndex,
  setPointerPosition,
  setRoomPlaylistAudioLevel,
  setVideoAudioLevel,
  videoVolume,
}: UseRoomNavigationOptions) {
  const switchScene = useCallback(
    (targetScene: Scene, mode: "push" | "replace") => {
      const position = getInitialPlaylistPosition(targetScene);

      fadeOutInProgressRef.current = false;
      sceneSlugRef.current = targetScene.slug;
      setPointerPosition(null);
      resetStageTransform();
      resetVideoForSceneSwitch();
      setCreditsOpen(false);
      setActiveScene(targetScene);
      setPlaylistTrackIndex(position.trackIndex);
      setPlaylistStartTime(position.currentTime);

      window.history[mode === "push" ? "pushState" : "replaceState"](
        { paperPlanetRoom: targetScene.slug },
        "",
        getRootHistoryHref(),
      );
    },
    [
      fadeOutInProgressRef,
      resetStageTransform,
      resetVideoForSceneSwitch,
      sceneSlugRef,
      setActiveScene,
      setCreditsOpen,
      setPlaylistStartTime,
      setPlaylistTrackIndex,
      setPointerPosition,
    ],
  );

  const transitionToScene = useCallback(
    (targetScene: Scene, mode: "push" | "replace") => {
      fadeOutInProgressRef.current = true;
      consumeSceneVideo(targetScene);

      setAudioError(null);
      setAudioTransitionMuted(true);
      beginVideoTransition();
      setVideoAudioLevel(videoVolume, true);
      setRoomPlaylistAudioLevel(currentScene.slug, playlistVolume, true);
      muteAllVideosForTransition();

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
      beginVideoTransition,
      consumeSceneVideo,
      currentScene.slug,
      fadeOutInProgressRef,
      hasEntered,
      muteAllVideosForTransition,
      playPlaylistForScene,
      playlistAudioMuted,
      playlistVolume,
      setAudioError,
      setAudioTransitionMuted,
      setRoomPlaylistAudioLevel,
      setVideoAudioLevel,
      switchScene,
      videoVolume,
    ],
  );

  const handleSceneNavigation = useCallback(
    (event: MouseEvent<HTMLAnchorElement>, targetSlug: SceneSlug) => {
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

      if (targetSlug === currentScene.slug) {
        event.preventDefault();
        return;
      }

      event.preventDefault();

      const targetScene = runtimeScenes[targetSlug];

      if (targetScene) {
        transitionToScene(targetScene, "push");
      }
    },
    [currentScene.slug, runtimeScenes, transitionToScene],
  );

  const handleHotspotActionClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>, action: Hotspot["action"]) => {
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
    },
    [handleSceneNavigation, setCreditsOpen],
  );

  const primeHotspotAction = useCallback(
    (action: Hotspot["action"]) => {
      if (action.type !== "navigate") {
        return;
      }

      const targetScene = runtimeScenes[action.target];

      if (targetScene) {
        primeScenePlaylist(targetScene);
        primeSceneVideo(targetScene);
      }
    },
    [primeScenePlaylist, primeSceneVideo, runtimeScenes],
  );

  useEffect(() => {
    window.history.replaceState(
      { paperPlanetRoom: currentScene.slug },
      "",
      getRootHistoryHref(),
    );
  }, [currentScene.slug]);

  useEffect(() => {
    const handleRoomPopState = (event: PopStateEvent) => {
      const targetSlug = event.state?.paperPlanetRoom as SceneSlug | undefined;
      const targetScene = targetSlug
        ? runtimeScenes[targetSlug]
        : runtimeScenes.construction;

      if (!targetScene || targetScene.slug === currentScene.slug) {
        return;
      }

      transitionToScene(targetScene, "replace");
    };

    window.addEventListener("popstate", handleRoomPopState);

    return () => {
      window.removeEventListener("popstate", handleRoomPopState);
    };
  }, [currentScene.slug, runtimeScenes, transitionToScene]);

  return {
    getActionHref: getHotspotActionHref,
    handleHotspotActionClick,
    handleSceneNavigation,
    primeHotspotAction,
  };
}
