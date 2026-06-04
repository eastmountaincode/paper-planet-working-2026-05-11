"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { SceneSlug } from "@/lib/scenes";

type PlayRoomPlaylistTrackOptions = {
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

function waitForPlaylistMetadata(audio: HTMLAudioElement) {
  if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("error", handleError);
    };
    const handleLoadedMetadata = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error(getMediaErrorMessage(audio)));
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata, {
      once: true,
    });
    audio.addEventListener("error", handleError, { once: true });
  });
}

export function EntryProvider({ children }: { children: ReactNode }) {
  const playlistAudioRef = useRef<HTMLAudioElement | null>(null);
  const primedPlaylistSourcesRef = useRef(new Set<string>());
  const playlistPlaybackRef = useRef<PlaylistPlayback | null>(null);
  const playlistEndedHandlerRef = useRef<(() => void) | null>(null);
  const playlistRequestIdRef = useRef(0);
  const activePlaylistRoomRef = useRef<SceneSlug | null>(null);
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
      const nextStatus: PlaylistStatus = {
        currentSrc: audio?.currentSrc || playback?.src || "",
        currentTime: audio?.currentTime ?? 0,
        error: null,
        lastEvent: eventName,
        networkState: audio?.networkState ?? 0,
        paused: audio?.paused ?? true,
        readyState: audio?.readyState ?? 0,
        room: activeRoom ?? "",
        ...overrides,
      };

      setPlaylistStatus(nextStatus);
    },
    [],
  );

  const primeRoomPlaylistTrack = useCallback(
    (room: SceneSlug, src: string) => {
      const absoluteSrc = new URL(src, window.location.href).href;

      if (primedPlaylistSourcesRef.current.has(absoluteSrc)) {
        return;
      }

      primedPlaylistSourcesRef.current.add(absoluteSrc);

      const audio = new Audio();
      audio.preload = "metadata";
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
          primedPlaylistSourcesRef.current.delete(absoluteSrc);

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

  const playRoomPlaylistTrack = useCallback(
    async ({
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

      playlistRequestIdRef.current = requestId;
      playlistEndedHandlerRef.current = onEnded ?? null;

      if (currentPlayback?.src === absoluteSrc && currentPlayback.room === room) {
        if (Math.abs(audio.currentTime - startTime) <= 1.5) {
          activePlaylistRoomRef.current = room;
          setPlaylistGain(nextGain);
          audio.volume = volume;
          audio.muted = muted;

          if (!muted && audio.paused) {
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
        audio.volume = volume;
        audio.muted = muted;
        audio.preload = "auto";
        audio.crossOrigin = "anonymous";

        if (audio.src !== absoluteSrc) {
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

        await waitForPlaylistMetadata(audio);

        if (playlistRequestIdRef.current !== requestId) {
          return;
        }

        const offset = clampMediaTime(audio, startTime);

        if (Math.abs(audio.currentTime - offset) > 0.5) {
          audio.currentTime = offset;
        }

        playlistPlaybackRef.current = playback;
        await audio.play();
        updatePlaylistStatus("playing", {
          currentSrc: absoluteSrc,
          currentTime: audio.currentTime,
          room,
        });
      } catch (error: unknown) {
        if (playlistRequestIdRef.current === requestId) {
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

  useEffect(() => {
    const interval = window.setInterval(
      () => updatePlaylistStatus("tick"),
      1000,
    );

    return () => {
      window.clearInterval(interval);
    };
  }, [updatePlaylistStatus]);

  const value = useMemo(
    () => ({
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
    }),
    [
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
