"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { SceneSlug } from "@/lib/scenes";

type PlayRoomPlaylistTrackOptions = {
  forceReload?: boolean;
  room: SceneSlug;
  src: string;
  startTime: number;
  volume: number;
  muted?: boolean;
  onEnded?: () => void;
};

type UnlockRoomPlaylistOptions = PlayRoomPlaylistTrackOptions & {
  active: boolean;
};

type EntryContextValue = {
  hasEntered: boolean;
  markEntered: () => void;
  getPlaylistStatusSnapshot: () => PlaylistStatus;
  playRoomPlaylistTrack: (
    options: PlayRoomPlaylistTrackOptions,
  ) => Promise<void>;
  playlistGain: number;
  playlistStatus: PlaylistStatus;
  primeRoomPlaylistTrack: (room: SceneSlug, src: string) => void;
  resumeRoomPlaylistAudio: (
    room: SceneSlug,
    volume: number,
    muted: boolean,
  ) => Promise<void>;
  setActivePlaylistRoom: (
    room: SceneSlug,
    volume: number,
    muted: boolean,
  ) => void;
  setRoomPlaylistAudioLevel: (
    room: SceneSlug,
    volume: number,
    muted: boolean,
  ) => void;
  setVideoAudioLevel: (volume: number, muted: boolean) => void;
  stopRoomPlaylistAudio: (room: SceneSlug) => void;
  unlockRoomPlaylists: (options: UnlockRoomPlaylistOptions[]) => Promise<void>;
  videoGain: number;
};

type PlaylistStatus = {
  currentSrc: string;
  currentTime: number;
  error: string | null;
  lastEvent: string;
  networkState: number;
  paused: boolean;
  readyState: number;
  room: SceneSlug | "";
};

type PlaylistPlayback = {
  requestId: number;
  room: SceneSlug;
  src: string;
};

const MAX_PRIMED_PLAYLIST_TRACKS = 8;

const EntryContext = createContext<EntryContextValue | null>(null);

const initialPlaylistStatus: PlaylistStatus = {
  currentSrc: "",
  currentTime: 0,
  error: null,
  lastEvent: "init",
  networkState: 0,
  paused: true,
  readyState: 0,
  room: "",
};

function getMediaErrorMessage(audio: HTMLAudioElement | null) {
  if (!audio?.error) {
    return "Playlist audio failed";
  }

  switch (audio.error.code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return "Playlist audio request was aborted";
    case MediaError.MEDIA_ERR_NETWORK:
      return "Playlist audio failed because of a network error";
    case MediaError.MEDIA_ERR_DECODE:
      return "Playlist audio could not be decoded";
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return "Playlist audio source is not supported";
    default:
      return "Playlist audio failed";
  }
}

function clampMediaTime(audio: HTMLAudioElement, time: number) {
  const safeTime = Number.isFinite(time) ? Math.max(0, time) : 0;

  if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
    return safeTime;
  }

  return Math.min(safeTime, Math.max(audio.duration - 0.05, 0));
}

function waitForPlaylistMetadata(
  audio: HTMLAudioElement,
  isCurrentRequest: () => boolean,
) {
  if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      audio.removeEventListener("abort", handleInterruption);
      audio.removeEventListener("emptied", handleInterruption);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("error", handleError);
    };
    const handleLoadedMetadata = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();

      if (!isCurrentRequest()) {
        resolve();
        return;
      }

      reject(new Error(getMediaErrorMessage(audio)));
    };
    const handleInterruption = () => {
      if (isCurrentRequest()) {
        return;
      }

      cleanup();
      resolve();
    };

    audio.addEventListener("abort", handleInterruption);
    audio.addEventListener("emptied", handleInterruption);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata, {
      once: true,
    });
    audio.addEventListener("error", handleError, { once: true });
  });
}

export function EntryProvider({ children }: { children: ReactNode }) {
  const playlistAudioRef = useRef<HTMLAudioElement | null>(null);
  const primedPlaylistAudioRef = useRef(new Map<string, HTMLAudioElement>());
  const playlistPlaybackRef = useRef<PlaylistPlayback | null>(null);
  const playlistEndedHandlerRef = useRef<(() => void) | null>(null);
  const playlistRequestIdRef = useRef(0);
  const activePlaylistRoomRef = useRef<SceneSlug | null>(null);
  const playlistStatusRef = useRef<PlaylistStatus>(initialPlaylistStatus);
  const [hasEntered, setHasEntered] = useState(false);
  const [playlistStatus, setPlaylistStatus] = useState<PlaylistStatus>(
    initialPlaylistStatus,
  );
  const [playlistGain, setPlaylistGain] = useState(0);
  const [videoGain, setVideoGain] = useState(0);

  const markEntered = useCallback(() => {
    setHasEntered(true);
  }, []);

  const updatePlaylistStatus = useCallback(
    (
      eventName: string,
      overrides: Partial<PlaylistStatus> = {},
    ) => {
      const audio = playlistAudioRef.current;
      const playback = playlistPlaybackRef.current;
      const activeRoom = activePlaylistRoomRef.current;
      const audioCurrentSrc =
        audio && audio.hasAttribute("src") ? audio.currentSrc : "";
      const nextStatus: PlaylistStatus = {
        currentSrc: audioCurrentSrc || playback?.src || "",
        currentTime: audio?.currentTime ?? 0,
        error: null,
        lastEvent: eventName,
        networkState: audio?.networkState ?? 0,
        paused: audio?.paused ?? true,
        readyState: audio?.readyState ?? 0,
        room: activeRoom ?? "",
        ...overrides,
      };

      playlistStatusRef.current = nextStatus;
      setPlaylistStatus(nextStatus);
    },
    [],
  );

  const getPlaylistStatusSnapshot = useCallback((): PlaylistStatus => {
    const audio = playlistAudioRef.current;
    const playback = playlistPlaybackRef.current;
    const activeRoom = activePlaylistRoomRef.current;
    const current = playlistStatusRef.current;
    const audioCurrentSrc =
      audio && audio.hasAttribute("src") ? audio.currentSrc : "";

    return {
      ...current,
      currentSrc: audioCurrentSrc || playback?.src || "",
      currentTime: audio?.currentTime ?? current.currentTime,
      networkState: audio?.networkState ?? current.networkState,
      paused: audio?.paused ?? current.paused,
      readyState: audio?.readyState ?? current.readyState,
      room: activeRoom ?? current.room,
    };
  }, []);

  const primeRoomPlaylistTrack = useCallback(
    (room: SceneSlug, src: string) => {
      const absoluteSrc = new URL(src, window.location.href).href;

      if (primedPlaylistAudioRef.current.has(absoluteSrc)) {
        return;
      }

      const audio = new Audio();
      primedPlaylistAudioRef.current.set(absoluteSrc, audio);

      audio.preload = "auto";
      audio.crossOrigin = "anonymous";
      audio.src = absoluteSrc;
      audio.addEventListener(
        "loadedmetadata",
        () => {
          if (activePlaylistRoomRef.current === room) {
            updatePlaylistStatus("primed", { currentSrc: absoluteSrc, room });
          }
        },
        { once: true },
      );
      audio.addEventListener(
        "error",
        () => {
          primedPlaylistAudioRef.current.delete(absoluteSrc);

          if (activePlaylistRoomRef.current === room) {
            updatePlaylistStatus("prime-error", {
              currentSrc: absoluteSrc,
              error: getMediaErrorMessage(audio),
              networkState: audio.networkState,
              readyState: audio.readyState,
              room,
            });
          }
        },
        { once: true },
      );
      audio.load();

      while (primedPlaylistAudioRef.current.size > MAX_PRIMED_PLAYLIST_TRACKS) {
        const oldestSrc = primedPlaylistAudioRef.current.keys().next().value;

        if (!oldestSrc) {
          break;
        }

        const oldestAudio = primedPlaylistAudioRef.current.get(oldestSrc);
        oldestAudio?.pause();
        oldestAudio?.removeAttribute("src");
        oldestAudio?.load();
        primedPlaylistAudioRef.current.delete(oldestSrc);
      }
    },
    [updatePlaylistStatus],
  );

  const setVideoAudioLevel = useCallback((volume: number, muted: boolean) => {
    const nextGain = muted ? 0 : volume;
    setVideoGain(nextGain);
  }, []);

  const setRoomPlaylistAudioLevel = useCallback(
    (room: SceneSlug, volume: number, muted: boolean) => {
      const nextGain = muted ? 0 : volume;
      const audio = playlistAudioRef.current;

      if (activePlaylistRoomRef.current === room) {
        setPlaylistGain(nextGain);
      }

      if (!audio || activePlaylistRoomRef.current !== room) {
        return;
      }

      audio.volume = volume;
      audio.muted = muted;
      updatePlaylistStatus("level", { room });
    },
    [updatePlaylistStatus],
  );

  const setActivePlaylistRoom = useCallback(
    (room: SceneSlug, volume: number, muted: boolean) => {
      const nextGain = muted ? 0 : volume;
      const audio = playlistAudioRef.current;

      activePlaylistRoomRef.current = room;
      setPlaylistGain(nextGain);

      if (audio) {
        audio.volume = volume;
        audio.muted = muted;
      }

      updatePlaylistStatus("active-room", { room });
    },
    [updatePlaylistStatus],
  );

  const stopRoomPlaylistAudio = useCallback(
    (room: SceneSlug) => {
      const audio = playlistAudioRef.current;

      playlistRequestIdRef.current += 1;
      playlistEndedHandlerRef.current = null;
      playlistPlaybackRef.current = null;
      activePlaylistRoomRef.current = room;
      setPlaylistGain(0);

      if (audio) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
        audio.volume = 0;
        audio.muted = true;
      }

      updatePlaylistStatus("stopped", {
        currentSrc: "",
        currentTime: 0,
        networkState: audio?.networkState ?? 0,
        paused: true,
        readyState: audio?.readyState ?? 0,
        room,
      });
    },
    [updatePlaylistStatus],
  );

  const playRoomPlaylistTrack = useCallback(
    async ({
      forceReload = false,
      room,
      src,
      startTime,
      volume,
      muted = false,
      onEnded,
    }: PlayRoomPlaylistTrackOptions) => {
      const audio = playlistAudioRef.current;

      if (!audio) {
        return;
      }

      const requestId = playlistRequestIdRef.current + 1;
      const absoluteSrc = new URL(src, window.location.href).href;
      const currentPlayback = playlistPlaybackRef.current;
      const nextGain = muted ? 0 : volume;
      const primedAudio = primedPlaylistAudioRef.current.get(absoluteSrc);

      if (primedAudio) {
        primedAudio.pause();
        primedAudio.removeAttribute("src");
        primedAudio.load();
        primedPlaylistAudioRef.current.delete(absoluteSrc);
      }

      playlistRequestIdRef.current = requestId;
      playlistEndedHandlerRef.current = onEnded ?? null;

      if (
        !forceReload &&
        currentPlayback?.src === absoluteSrc &&
        currentPlayback.room === room
      ) {
        if (Math.abs(audio.currentTime - startTime) <= 1.5) {
          activePlaylistRoomRef.current = room;
          setPlaylistGain(nextGain);
          audio.volume = volume;
          audio.muted = muted;

          if (audio.paused) {
            await audio.play();
          }

          updatePlaylistStatus("play-reused", { room });
          return;
        }
      }

      updatePlaylistStatus("buffering", {
        currentSrc: absoluteSrc,
        networkState: 2,
        paused: !currentPlayback,
        readyState: 0,
        room,
      });

      try {
        activePlaylistRoomRef.current = room;
        setPlaylistGain(nextGain);
        // Claim playback synchronously while an Enter/click gesture is still
        // active, including when metadata is slow. Keep the element silent
        // until it has been moved to the synchronized position.
        audio.volume = 0;
        audio.muted = muted;
        audio.preload = "auto";
        audio.crossOrigin = "anonymous";

        if (forceReload || audio.src !== absoluteSrc) {
          audio.src = absoluteSrc;
          audio.load();
        }

        const playback: PlaylistPlayback = {
          requestId,
          room,
          src: absoluteSrc,
        };

        if (playlistRequestIdRef.current !== requestId) {
          return;
        }

        playlistPlaybackRef.current = playback;

        let initialPlayError: unknown = null;
        const initialPlayPromise = audio.play().catch((error: unknown) => {
          initialPlayError = error;
        });

        await waitForPlaylistMetadata(
          audio,
          () => playlistRequestIdRef.current === requestId,
        );

        if (playlistRequestIdRef.current !== requestId) {
          return;
        }

        const offset = clampMediaTime(audio, startTime);

        if (Math.abs(audio.currentTime - offset) > 0.5) {
          audio.currentTime = offset;
        }

        if (playlistRequestIdRef.current !== requestId) {
          return;
        }

        audio.volume = volume;
        audio.muted = muted;

        await initialPlayPromise;

        if (initialPlayError) {
          throw initialPlayError;
        }

        if (playlistRequestIdRef.current !== requestId) {
          return;
        }

        if (audio.paused) {
          await audio.play();
        }

        if (playlistRequestIdRef.current !== requestId) {
          return;
        }

        updatePlaylistStatus("playing", {
          currentSrc: absoluteSrc,
          currentTime: audio.currentTime,
          room,
        });
      } catch (error: unknown) {
        if (playlistRequestIdRef.current === requestId) {
          if (playlistPlaybackRef.current?.requestId === requestId) {
            playlistPlaybackRef.current = null;
          }

          updatePlaylistStatus("error", {
            currentSrc: absoluteSrc,
            error:
              error instanceof Error ? error.message : "Playlist audio failed",
            networkState: 3,
            paused: true,
            readyState: 0,
            room,
          });
        }

        throw error;
      }
    },
    [updatePlaylistStatus],
  );

  const resumeRoomPlaylistAudio = useCallback(
    async (room: SceneSlug, volume: number, muted: boolean) => {
      const audio = playlistAudioRef.current;

      if (!audio) {
        return;
      }

      setRoomPlaylistAudioLevel(room, volume, muted);
      updatePlaylistStatus("resume-request", { room });

      if (!muted && audio.src && audio.paused) {
        await audio.play();
        updatePlaylistStatus("resumed", { room });
      }
    },
    [setRoomPlaylistAudioLevel, updatePlaylistStatus],
  );

  const unlockRoomPlaylists = useCallback(
    async (options: UnlockRoomPlaylistOptions[]) => {
      if (!playlistAudioRef.current) {
        return;
      }

      for (const option of options) {
        if (!option.active) {
          primeRoomPlaylistTrack(option.room, option.src);
        }
      }

      const activeOption = options.find((option) => option.active);

      if (!activeOption) {
        return;
      }

      await playRoomPlaylistTrack({
        ...activeOption,
        muted: Boolean(activeOption.muted),
      });
    },
    [playRoomPlaylistTrack, primeRoomPlaylistTrack],
  );

  const value = useMemo(
    () => ({
      getPlaylistStatusSnapshot,
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
      stopRoomPlaylistAudio,
      unlockRoomPlaylists,
      videoGain,
    }),
    [
      getPlaylistStatusSnapshot,
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
      stopRoomPlaylistAudio,
      unlockRoomPlaylists,
      videoGain,
    ],
  );

  return (
    <EntryContext.Provider value={value}>
      <audio
        ref={playlistAudioRef}
        preload="auto"
        crossOrigin="anonymous"
        onEnded={(event) => {
          const playback = playlistPlaybackRef.current;

          if (!playback) {
            return;
          }

          playlistPlaybackRef.current = null;
          updatePlaylistStatus("ended", {
            currentSrc: event.currentTarget.currentSrc,
            currentTime: event.currentTarget.duration,
            paused: true,
            room: playback.room,
          });
          playlistEndedHandlerRef.current?.();
        }}
        onAbort={() => updatePlaylistStatus("abort")}
        onCanPlay={() => updatePlaylistStatus("canplay")}
        onEmptied={() => updatePlaylistStatus("emptied")}
        onError={(event) => {
          const playback = playlistPlaybackRef.current;

          updatePlaylistStatus("error", {
            currentSrc: event.currentTarget.currentSrc,
            error: getMediaErrorMessage(event.currentTarget),
            networkState: event.currentTarget.networkState,
            paused: event.currentTarget.paused,
            readyState: event.currentTarget.readyState,
            room: playback?.room ?? activePlaylistRoomRef.current ?? "",
          });
        }}
        onPause={() => updatePlaylistStatus("pause")}
        onPlaying={() => updatePlaylistStatus("playing")}
        onStalled={() => updatePlaylistStatus("stalled")}
        onSuspend={() => updatePlaylistStatus("suspend")}
        onWaiting={() => updatePlaylistStatus("waiting")}
      />
      {children}
    </EntryContext.Provider>
  );
}

export function useEntryState() {
  const value = useContext(EntryContext);

  if (!value) {
    throw new Error("useEntryState must be used inside EntryProvider");
  }

  return value;
}
