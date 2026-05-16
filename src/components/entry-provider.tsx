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

type PlayPlaylistTrackOptions = {
  src: string;
  startTime: number;
  volume: number;
  onEnded?: () => void;
};

type EntryContextValue = {
  attachVideoAudio: (video: HTMLVideoElement, volume: number) => Promise<void>;
  detachVideoAudio: (video: HTMLVideoElement) => void;
  hasEntered: boolean;
  markEntered: () => void;
  playPlaylistTrack: (options: PlayPlaylistTrackOptions) => Promise<void>;
  playlistGain: number;
  playlistStatus: PlaylistStatus;
  resumePlaylistAudio: (volume: number, muted: boolean) => Promise<void>;
  setPlaylistAudioLevel: (volume: number, muted: boolean) => void;
  setVideoAudioLevel: (volume: number, muted: boolean) => void;
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
};

const EntryContext = createContext<EntryContextValue | null>(null);

export function EntryProvider({ children }: { children: ReactNode }) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const playlistAudioRef = useRef<HTMLAudioElement>(null);
  const playlistSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const playlistGainRef = useRef<GainNode | null>(null);
  const playlistEndedHandlerRef = useRef<(() => void) | null>(null);
  const playlistRequestIdRef = useRef(0);
  const videoSourcesRef = useRef(
    new WeakMap<HTMLVideoElement, MediaElementAudioSourceNode>(),
  );
  const videoGainRef = useRef<GainNode | null>(null);
  const [hasEntered, setHasEntered] = useState(false);
  const [playlistStatus, setPlaylistStatus] = useState<PlaylistStatus>({
    currentSrc: "",
    currentTime: 0,
    error: null,
    lastEvent: "init",
    networkState: 0,
    paused: true,
    readyState: 0,
  });
  const [playlistGain, setPlaylistGain] = useState(0);
  const [videoGain, setVideoGain] = useState(0);

  const markEntered = useCallback(() => {
    setHasEntered(true);
  }, []);

  const ensureAudioContext = useCallback(async () => {
    if (!audioContextRef.current) {
      const AudioContextConstructor =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;

      if (!AudioContextConstructor) {
        return null;
      }

      audioContextRef.current = new AudioContextConstructor();
    }

    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }

    return audioContextRef.current;
  }, []);

  const ensurePlaylistMixer = useCallback(async () => {
    const audio = playlistAudioRef.current;
    const context = await ensureAudioContext();

    if (!audio || !context) {
      return null;
    }

    if (!playlistGainRef.current) {
      playlistGainRef.current = context.createGain();
      playlistGainRef.current.connect(context.destination);
    }

    if (!playlistSourceRef.current) {
      playlistSourceRef.current = context.createMediaElementSource(audio);
      playlistSourceRef.current.connect(playlistGainRef.current);
    }

    return {
      audio,
      gain: playlistGainRef.current,
    };
  }, [ensureAudioContext]);

  const setVideoAudioLevel = useCallback((volume: number, muted: boolean) => {
    const nextGain = muted ? 0 : volume;
    setVideoGain(nextGain);

    if (!videoGainRef.current) {
      return;
    }

    videoGainRef.current.gain.value = nextGain;
  }, []);

  const setPlaylistAudioLevel = useCallback(
    (volume: number, muted: boolean) => {
      const nextGain = muted ? 0 : volume;
      setPlaylistGain(nextGain);

      if (!playlistGainRef.current) {
        return;
      }

      playlistGainRef.current.gain.value = nextGain;
    },
    [],
  );

  const attachVideoAudio = useCallback(
    async (video: HTMLVideoElement, volume: number) => {
      const context = await ensureAudioContext();

      if (!context) {
        return;
      }

      if (!videoGainRef.current) {
        videoGainRef.current = context.createGain();
        videoGainRef.current.connect(context.destination);
      }

      if (!videoSourcesRef.current.has(video)) {
        const source = context.createMediaElementSource(video);
        source.connect(videoGainRef.current);
        videoSourcesRef.current.set(video, source);
      }

      setVideoAudioLevel(volume, false);
    },
    [ensureAudioContext, setVideoAudioLevel],
  );

  const detachVideoAudio = useCallback((video: HTMLVideoElement) => {
    const source = videoSourcesRef.current.get(video);

    if (!source) {
      return;
    }

    video.muted = true;
  }, []);

  const playPlaylistTrack = useCallback(
    async ({ src, startTime, volume, onEnded }: PlayPlaylistTrackOptions) => {
      const mixer = await ensurePlaylistMixer();

      if (!mixer) {
        return;
      }

      const { audio } = mixer;
      const requestId = playlistRequestIdRef.current + 1;
      playlistRequestIdRef.current = requestId;
      playlistEndedHandlerRef.current = onEnded ?? null;
      audio.muted = false;
      audio.volume = 1;
      setPlaylistAudioLevel(volume, false);

      const absoluteSrc = new URL(src, window.location.href).href;
      const currentOrPendingSrc =
        audio.currentSrc || audio.getAttribute("src") || "";
      const sourceChanged = currentOrPendingSrc !== absoluteSrc;

      if (sourceChanged) {
        audio.pause();
        audio.src = absoluteSrc;
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

        const nextTime = Math.min(startTime, Math.max(audio.duration - 0.25, 0));

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
    [ensurePlaylistMixer, setPlaylistAudioLevel],
  );

  const resumePlaylistAudio = useCallback(
    async (volume: number, muted: boolean) => {
      const mixer = await ensurePlaylistMixer();

      if (!mixer) {
        return;
      }

      const { audio } = mixer;
      audio.muted = false;
      audio.volume = 1;
      setPlaylistAudioLevel(volume, muted);

      if (!muted && audio.currentSrc && audio.paused) {
        await audio.play();
      }
    },
    [ensurePlaylistMixer, setPlaylistAudioLevel],
  );

  useEffect(() => {
    const audio = playlistAudioRef.current;

    if (!audio) {
      return;
    }

    const updateStatus = (eventName: string) => {
      setPlaylistStatus({
        currentSrc: audio.currentSrc || audio.getAttribute("src") || "",
        currentTime: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
        error: audio.error
          ? `${audio.error.code}${audio.error.message ? ` ${audio.error.message}` : ""}`
          : null,
        lastEvent: eventName,
        networkState: audio.networkState,
        paused: audio.paused,
        readyState: audio.readyState,
      });
    };

    const eventNames = [
      "abort",
      "canplay",
      "emptied",
      "ended",
      "error",
      "loadedmetadata",
      "pause",
      "play",
      "playing",
      "stalled",
      "suspend",
      "waiting",
    ] as const;
    const listeners = eventNames.map((eventName) => {
      const listener = () => updateStatus(eventName);
      audio.addEventListener(eventName, listener);
      return [eventName, listener] as const;
    });

    const interval = window.setInterval(() => updateStatus("tick"), 1000);
    updateStatus("mounted");

    return () => {
      window.clearInterval(interval);
      for (const [eventName, listener] of listeners) {
        audio.removeEventListener(eventName, listener);
      }
    };
  }, []);

  const value = useMemo(
    () => ({
      hasEntered,
      markEntered,
      attachVideoAudio,
      detachVideoAudio,
      playPlaylistTrack,
      playlistGain,
      playlistStatus,
      resumePlaylistAudio,
      setPlaylistAudioLevel,
      setVideoAudioLevel,
      videoGain,
    }),
    [
      attachVideoAudio,
      detachVideoAudio,
      hasEntered,
      markEntered,
      playPlaylistTrack,
      playlistGain,
      playlistStatus,
      resumePlaylistAudio,
      setPlaylistAudioLevel,
      setVideoAudioLevel,
      videoGain,
    ],
  );

  return (
    <EntryContext.Provider value={value}>
      {children}
      <audio
        crossOrigin="anonymous"
        ref={playlistAudioRef}
        preload="auto"
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
