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

      playlistEndedHandlerRef.current = onEnded ?? null;
      audio.volume = volume;

      if (audio.currentSrc !== src && audio.getAttribute("src") !== src) {
        audio.src = src;
        audio.load();
      }

      const seekToStartTime = () => {
        if (!Number.isFinite(startTime) || !Number.isFinite(audio.duration)) {
          return;
        }

        audio.currentTime = Math.min(
          startTime,
          Math.max(audio.duration - 0.25, 0),
        );
      };

      if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
        seekToStartTime();
      } else {
        await new Promise<void>((resolve) => {
          const handleMetadata = () => {
            audio.removeEventListener("loadedmetadata", handleMetadata);
            seekToStartTime();
            resolve();
          };

          audio.addEventListener("loadedmetadata", handleMetadata);
        });
      }

      await audio.play();
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
