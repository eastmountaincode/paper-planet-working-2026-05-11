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
  attachVideoAudio: (video: HTMLVideoElement, volume: number) => Promise<void>;
  detachVideoAudio: (video: HTMLVideoElement) => void;
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
  buffer: AudioBuffer;
  duration: number;
  offset: number;
  requestId: number;
  room: SceneSlug;
  source: AudioBufferSourceNode;
  src: string;
  startedAt: number;
};

const EntryContext = createContext<EntryContextValue | null>(null);
const KEEP_ALIVE_GAIN = 0.00001;
const AUDIO_RAMP_SECONDS = 0.2;

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

function getCurrentPlaybackTime(
  context: AudioContext | null,
  playback: PlaylistPlayback | null,
) {
  if (!context || !playback) {
    return 0;
  }

  return Math.min(
    playback.duration,
    Math.max(0, context.currentTime - playback.startedAt + playback.offset),
  );
}

function rampGain(gain: GainNode, value: number) {
  const now = gain.context.currentTime;

  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.linearRampToValueAtTime(value, now + AUDIO_RAMP_SECONDS);
}

export function EntryProvider({ children }: { children: ReactNode }) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferPromisesRef = useRef(new Map<string, Promise<AudioBuffer>>());
  const keepAliveRef = useRef<{
    gain: GainNode;
    oscillator: OscillatorNode;
  } | null>(null);
  const playlistPlaybackRef = useRef<PlaylistPlayback | null>(null);
  const playlistGainRef = useRef<GainNode | null>(null);
  const playlistEndedHandlerRef = useRef<(() => void) | null>(null);
  const playlistRequestIdRef = useRef(0);
  const videoSourcesRef = useRef(
    new WeakMap<HTMLVideoElement, MediaElementAudioSourceNode>(),
  );
  const videoGainRef = useRef<GainNode | null>(null);
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

  const ensureAudioContext = useCallback(() => {
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
      void audioContextRef.current.resume().catch(() => undefined);
    }

    return audioContextRef.current;
  }, []);

  const ensureKeepAlive = useCallback((context: AudioContext) => {
    if (keepAliveRef.current) {
      return;
    }

    const gain = context.createGain();
    const oscillator = context.createOscillator();

    gain.gain.value = KEEP_ALIVE_GAIN;
    oscillator.frequency.value = 20;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    keepAliveRef.current = { gain, oscillator };
  }, []);

  const ensurePlaylistGain = useCallback(() => {
    const context = ensureAudioContext();

    if (!context) {
      return null;
    }

    ensureKeepAlive(context);

    if (!playlistGainRef.current) {
      playlistGainRef.current = context.createGain();
      playlistGainRef.current.gain.value = 0;
      playlistGainRef.current.connect(context.destination);
    }

    return {
      context,
      gain: playlistGainRef.current,
    };
  }, [ensureAudioContext, ensureKeepAlive]);

  const updatePlaylistStatus = useCallback(
    (
      eventName: string,
      overrides: Partial<PlaylistStatus> = {},
    ) => {
      const context = audioContextRef.current;
      const playback = playlistPlaybackRef.current;
      const activeRoom = activePlaylistRoomRef.current;
      const nextStatus: PlaylistStatus = {
        currentSrc: playback?.src ?? "",
        currentTime: getCurrentPlaybackTime(context, playback),
        error: null,
        lastEvent: eventName,
        networkState: playback ? 1 : 0,
        paused: !playback,
        readyState: playback ? 4 : 0,
        room: activeRoom ?? "",
        ...overrides,
      };

      setPlaylistStatus(nextStatus);
    },
    [],
  );

  const preloadAudioBuffer = useCallback(
    (src: string) => {
      const mixer = ensurePlaylistGain();

      if (!mixer) {
        return Promise.reject(new Error("Web Audio is not available"));
      }

      const { context } = mixer;
      const absoluteSrc = new URL(src, window.location.href).href;
      const cachedPromise = audioBufferPromisesRef.current.get(absoluteSrc);

      if (cachedPromise) {
        return cachedPromise;
      }

      const bufferPromise = fetch(absoluteSrc)
        .then((response) => {
          if (!response.ok) {
            throw new Error(
              `Audio request failed: ${response.status} ${response.statusText}`,
            );
          }

          return response.arrayBuffer();
        })
        .then((arrayBuffer) => context.decodeAudioData(arrayBuffer.slice(0)));

      audioBufferPromisesRef.current.set(absoluteSrc, bufferPromise);
      return bufferPromise;
    },
    [ensurePlaylistGain],
  );

  const stopPlaylistSource = useCallback(() => {
    const playback = playlistPlaybackRef.current;

    if (!playback) {
      return;
    }

    playback.source.onended = null;

    try {
      playback.source.stop();
    } catch {
      // Already stopped.
    }

    playlistPlaybackRef.current = null;
  }, []);

  const setVideoAudioLevel = useCallback((volume: number, muted: boolean) => {
    const nextGain = muted ? 0 : volume;
    setVideoGain(nextGain);

    if (!videoGainRef.current) {
      return;
    }

    rampGain(videoGainRef.current, nextGain);
  }, []);

  const setRoomPlaylistAudioLevel = useCallback(
    (room: SceneSlug, volume: number, muted: boolean) => {
      const nextGain = muted ? 0 : volume;

      if (activePlaylistRoomRef.current === room) {
        setPlaylistGain(nextGain);
      }

      if (!playlistGainRef.current || activePlaylistRoomRef.current !== room) {
        return;
      }

      rampGain(playlistGainRef.current, nextGain);
    },
    [],
  );

  const setActivePlaylistRoom = useCallback(
    (room: SceneSlug, volume: number, muted: boolean) => {
      const mixer = ensurePlaylistGain();
      const nextGain = muted ? 0 : volume;

      activePlaylistRoomRef.current = room;
      setPlaylistGain(nextGain);

      if (mixer) {
        rampGain(mixer.gain, nextGain);
      }

      updatePlaylistStatus("active-room", { room });
    },
    [ensurePlaylistGain, updatePlaylistStatus],
  );

  const attachVideoAudio = useCallback(
    async (video: HTMLVideoElement, volume: number) => {
      const context = ensureAudioContext();

      if (!context) {
        return;
      }

      ensureKeepAlive(context);

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
    [ensureAudioContext, ensureKeepAlive, setVideoAudioLevel],
  );

  const detachVideoAudio = useCallback((video: HTMLVideoElement) => {
    const source = videoSourcesRef.current.get(video);

    if (!source) {
      return;
    }

    video.muted = true;
  }, []);

  const playRoomPlaylistTrack = useCallback(
    async ({
      room,
      src,
      startTime,
      volume,
      muted = false,
      onEnded,
    }: PlayRoomPlaylistTrackOptions) => {
      const mixer = ensurePlaylistGain();

      if (!mixer) {
        return;
      }

      const { context, gain } = mixer;
      const requestId = playlistRequestIdRef.current + 1;
      const absoluteSrc = new URL(src, window.location.href).href;
      const currentPlayback = playlistPlaybackRef.current;
      const nextGain = muted ? 0 : volume;

      playlistRequestIdRef.current = requestId;
      playlistEndedHandlerRef.current = onEnded ?? null;

      if (currentPlayback?.src === absoluteSrc && currentPlayback.room === room) {
        const currentTime = getCurrentPlaybackTime(context, currentPlayback);

        if (Math.abs(currentTime - startTime) <= 1.5) {
          activePlaylistRoomRef.current = room;
          setPlaylistGain(nextGain);
          rampGain(gain, nextGain);
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
        const buffer = await preloadAudioBuffer(absoluteSrc);

        if (playlistRequestIdRef.current !== requestId) {
          return;
        }

        const offset = Math.min(
          Math.max(0, Number.isFinite(startTime) ? startTime : 0),
          Math.max(buffer.duration - 0.05, 0),
        );
        const source = context.createBufferSource();
        const playback: PlaylistPlayback = {
          buffer,
          duration: buffer.duration,
          offset,
          requestId,
          room,
          source,
          src: absoluteSrc,
          startedAt: context.currentTime,
        };

        activePlaylistRoomRef.current = room;
        setPlaylistGain(nextGain);
        rampGain(gain, nextGain);
        stopPlaylistSource();
        source.buffer = buffer;
        source.connect(gain);
        source.onended = () => {
          if (
            playlistPlaybackRef.current?.requestId !== requestId ||
            getCurrentPlaybackTime(context, playback) < playback.duration - 0.25
          ) {
            return;
          }

          playlistPlaybackRef.current = null;
          updatePlaylistStatus("ended", {
            currentSrc: absoluteSrc,
            currentTime: playback.duration,
            paused: true,
            room,
          });
          playlistEndedHandlerRef.current?.();
        };
        playlistPlaybackRef.current = playback;
        source.start(0, offset);
        updatePlaylistStatus("playing", { room });
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
    [ensurePlaylistGain, preloadAudioBuffer, stopPlaylistSource, updatePlaylistStatus],
  );

  const primeRoomPlaylistTrack = useCallback(
    (room: SceneSlug, src: string) => {
      const absoluteSrc = new URL(src, window.location.href).href;

      void preloadAudioBuffer(absoluteSrc)
        .then(() => {
          if (activePlaylistRoomRef.current === room) {
            updatePlaylistStatus("primed", { currentSrc: absoluteSrc, room });
          }
        })
        .catch((error: unknown) => {
          if (activePlaylistRoomRef.current === room) {
            updatePlaylistStatus("prime-error", {
              currentSrc: absoluteSrc,
              error:
                error instanceof Error
                  ? error.message
                  : "Playlist preload failed",
              networkState: 3,
              room,
            });
          }
        });
    },
    [preloadAudioBuffer, updatePlaylistStatus],
  );

  const resumeRoomPlaylistAudio = useCallback(
    async (room: SceneSlug, volume: number, muted: boolean) => {
      const context = ensureAudioContext();

      if (!context) {
        return;
      }

      ensureKeepAlive(context);
      setRoomPlaylistAudioLevel(room, volume, muted);
      updatePlaylistStatus("resume-request", { room });
    },
    [
      ensureAudioContext,
      ensureKeepAlive,
      setRoomPlaylistAudioLevel,
      updatePlaylistStatus,
    ],
  );

  const unlockRoomPlaylists = useCallback(
    async (options: UnlockRoomPlaylistOptions[]) => {
      const mixer = ensurePlaylistGain();

      if (!mixer) {
        return;
      }

      ensureKeepAlive(mixer.context);

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
    [
      ensureKeepAlive,
      ensurePlaylistGain,
      playRoomPlaylistTrack,
      primeRoomPlaylistTrack,
    ],
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
      attachVideoAudio,
      detachVideoAudio,
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
      attachVideoAudio,
      detachVideoAudio,
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
    <EntryContext.Provider value={value}>{children}</EntryContext.Provider>
  );
}

export function useEntryState() {
  const value = useContext(EntryContext);

  if (!value) {
    throw new Error("useEntryState must be used inside EntryProvider");
  }

  return value;
}
