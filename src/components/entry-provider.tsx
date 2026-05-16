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

type PlayPlaylistTrackOptions = {
  src: string;
  startTime: number;
  volume: number;
  onEnded?: () => void;
};

type EntryContextValue = {
  hasEntered: boolean;
  markEntered: () => void;
  pausePlaylistAudio: () => void;
  playPlaylistTrack: (options: PlayPlaylistTrackOptions) => Promise<void>;
};

const EntryContext = createContext<EntryContextValue | null>(null);

export function EntryProvider({ children }: { children: ReactNode }) {
  const playlistAudioRef = useRef<HTMLAudioElement>(null);
  const playlistEndedHandlerRef = useRef<(() => void) | null>(null);
  const playlistRequestIdRef = useRef(0);
  const [hasEntered, setHasEntered] = useState(false);

  const markEntered = useCallback(() => {
    setHasEntered(true);
  }, []);

  const pausePlaylistAudio = useCallback(() => {
    playlistAudioRef.current?.pause();
  }, []);

  const playPlaylistTrack = useCallback(
    async ({ src, startTime, volume, onEnded }: PlayPlaylistTrackOptions) => {
      const audio = playlistAudioRef.current;

      if (!audio) {
        return;
      }

      const requestId = playlistRequestIdRef.current + 1;
      playlistRequestIdRef.current = requestId;
      playlistEndedHandlerRef.current = onEnded ?? null;
      audio.volume = volume;

      const absoluteSrc = new URL(src, window.location.href).href;
      const sourceChanged =
        audio.currentSrc !== absoluteSrc && audio.getAttribute("src") !== src;

      if (sourceChanged) {
        audio.src = src;
        audio.load();
      }

      const seekToStartTime = () => {
        if (
          playlistRequestIdRef.current !== requestId ||
          !Number.isFinite(startTime) ||
          !Number.isFinite(audio.duration)
        ) {
          return;
        }

        const nextTime = Math.min(
          startTime,
          Math.max(audio.duration - 0.25, 0),
        );

        if (sourceChanged || Math.abs(audio.currentTime - nextTime) > 1.5) {
          audio.currentTime = nextTime;
        }
      };

      if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
        seekToStartTime();
      } else {
        audio.addEventListener("loadedmetadata", seekToStartTime, {
          once: true,
        });
      }

      if (audio.paused || sourceChanged) {
        await audio.play();
      }
    },
    [],
  );

  const value = useMemo(
    () => ({
      hasEntered,
      markEntered,
      pausePlaylistAudio,
      playPlaylistTrack,
    }),
    [hasEntered, markEntered, pausePlaylistAudio, playPlaylistTrack],
  );

  return (
    <EntryContext.Provider value={value}>
      {children}
      <audio
        ref={playlistAudioRef}
        preload="metadata"
        onEnded={() => playlistEndedHandlerRef.current?.()}
      />
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
