import {
  useCallback,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { SceneSlug } from "@/lib/scenes";
import {
  getMediaErrorMessage,
  isExpectedMediaInterruption,
} from "./media-utils";

type UseRoomEntryControlsOptions = {
  getRoomPlaylistUnlockOptions: () => {
    active: boolean;
    onEnded?: () => void;
    room: SceneSlug;
    src: string;
    startTime: number;
    volume: number;
  }[];
  hasEntered: boolean;
  markEntered: () => void;
  playVisibleVideoOnEnter: () => Promise<unknown> | null;
  resumeActivePlaylistAudio: () => void;
  setAudioError: (message: string | null) => void;
  setPlaylistAudioMuted: Dispatch<SetStateAction<boolean>>;
  setVideoAudioMuted: Dispatch<SetStateAction<boolean>>;
  toggleVisibleVideoAudio: (muted: boolean) => void;
  unlockRoomPlaylists: (
    options: ReturnType<UseRoomEntryControlsOptions["getRoomPlaylistUnlockOptions"]>,
  ) => Promise<unknown>;
  videoAudioMuted: boolean;
};

export function useRoomEntryControls({
  getRoomPlaylistUnlockOptions,
  hasEntered,
  markEntered,
  playVisibleVideoOnEnter,
  resumeActivePlaylistAudio,
  setAudioError,
  setPlaylistAudioMuted,
  setVideoAudioMuted,
  toggleVisibleVideoAudio,
  unlockRoomPlaylists,
  videoAudioMuted,
}: UseRoomEntryControlsOptions) {
  const enterPlanet = useCallback(async () => {
    const playPromises: Promise<unknown>[] = [];

    setAudioError(null);
    markEntered();
    setVideoAudioMuted(false);
    setPlaylistAudioMuted(false);

    const roomPlaylistOptions = getRoomPlaylistUnlockOptions();

    if (roomPlaylistOptions.length > 0) {
      playPromises.push(unlockRoomPlaylists(roomPlaylistOptions));
    }

    const videoPlayPromise = playVisibleVideoOnEnter();

    if (videoPlayPromise) {
      playPromises.push(videoPlayPromise);
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
  }, [
    getRoomPlaylistUnlockOptions,
    markEntered,
    playVisibleVideoOnEnter,
    setAudioError,
    setPlaylistAudioMuted,
    setVideoAudioMuted,
    unlockRoomPlaylists,
  ]);

  const toggleVideoAudio = useCallback(() => {
    if (!hasEntered) {
      void enterPlanet();
      return;
    }

    const nextMuted = !videoAudioMuted;
    setVideoAudioMuted(nextMuted);
    toggleVisibleVideoAudio(nextMuted);
    resumeActivePlaylistAudio();
  }, [
    enterPlanet,
    hasEntered,
    resumeActivePlaylistAudio,
    setVideoAudioMuted,
    toggleVisibleVideoAudio,
    videoAudioMuted,
  ]);

  const togglePlaylistAudio = useCallback(() => {
    if (!hasEntered) {
      void enterPlanet();
      return;
    }

    setPlaylistAudioMuted((current) => !current);
  }, [enterPlanet, hasEntered, setPlaylistAudioMuted]);

  return {
    enterPlanet,
    togglePlaylistAudio,
    toggleVideoAudio,
  };
}
