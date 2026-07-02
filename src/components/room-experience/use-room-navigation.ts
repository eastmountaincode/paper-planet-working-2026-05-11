import {
  useCallback,
  useEffect,
  useRef,
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
import {
  ROOM_TRANSITION_MS,
  ROOT_HREF,
} from "./constants";
import {
  getMediaErrorMessage,
  isExpectedMediaInterruption,
} from "./media-utils";
import { wait } from "./stage-utils";
import type { PointerPosition } from "./types";

type UseRoomNavigationOptions = {
  currentScene: Scene;
  fadeOutInProgressRef: { current: boolean };
  hasEntered: boolean;
  muteAllVideosForTransition: () => void;
  playPlaylistForScene: (targetScene: Scene, muted?: boolean) => Promise<void>;
  playlistAudioMuted: boolean;
  playlistVolume: number;
  primeScenePlaylist: (targetScene: Scene) => void;
  resetStageTransform: () => void;
  resetVideoForSceneSwitch: () => void;
  runtimeScenes: Record<SceneSlug, Scene>;
  setActiveScene: Dispatch<SetStateAction<Scene>>;
  setAudioError: (message: string | null) => void;
  setAudioTransitionMuted: Dispatch<SetStateAction<boolean>>;
  setCreditsOpen: Dispatch<SetStateAction<boolean>>;
  setIsExiting: Dispatch<SetStateAction<boolean>>;
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

  if (action.type === "credits") {
    return "#credits";
  }

  const subject = action.subject
    ? `?subject=${encodeURIComponent(action.subject)}`
    : "";
  return `mailto:${action.email}${subject}`;
}

export function useRoomNavigation({
  currentScene,
  fadeOutInProgressRef,
  hasEntered,
  muteAllVideosForTransition,
  playPlaylistForScene,
  playlistAudioMuted,
  playlistVolume,
  primeScenePlaylist,
  resetStageTransform,
  resetVideoForSceneSwitch,
  runtimeScenes,
  setActiveScene,
  setAudioError,
  setAudioTransitionMuted,
  setCreditsOpen,
  setIsExiting,
  setPlaylistStartTime,
  setPlaylistTrackIndex,
  setPointerPosition,
  setRoomPlaylistAudioLevel,
  setVideoAudioLevel,
  videoVolume,
}: UseRoomNavigationOptions) {
  const navigationIdRef = useRef(0);

  const switchScene = useCallback(
    (targetScene: Scene, mode: "push" | "replace") => {
      const position = getInitialPlaylistPosition(targetScene);

      fadeOutInProgressRef.current = false;
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
      setActiveScene,
      setCreditsOpen,
      setPlaylistStartTime,
      setPlaylistTrackIndex,
      setPointerPosition,
    ],
  );

  const transitionToScene = useCallback(
    async (targetScene: Scene, mode: "push" | "replace") => {
      const navigationId = navigationIdRef.current + 1;
      navigationIdRef.current = navigationId;
      fadeOutInProgressRef.current = true;

      setAudioError(null);
      setAudioTransitionMuted(true);
      setVideoAudioLevel(videoVolume, true);
      setRoomPlaylistAudioLevel(currentScene.slug, playlistVolume, true);
      setIsExiting(true);
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

      await wait(ROOM_TRANSITION_MS);

      if (navigationIdRef.current !== navigationId) {
        return;
      }

      switchScene(targetScene, mode);
      void playlistPromise;
    },
    [
      currentScene.slug,
      fadeOutInProgressRef,
      hasEntered,
      muteAllVideosForTransition,
      playPlaylistForScene,
      playlistAudioMuted,
      playlistVolume,
      setAudioError,
      setAudioTransitionMuted,
      setIsExiting,
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
        void transitionToScene(targetScene, "push");
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
      }
    },
    [primeScenePlaylist, runtimeScenes],
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

      void transitionToScene(targetScene, "replace");
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
