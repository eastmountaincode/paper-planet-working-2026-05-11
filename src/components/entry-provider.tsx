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
import { sceneSlugs, type SceneSlug } from "@/lib/scenes";

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

type RoomPlaylistMixer = {
  audio: HTMLAudioElement;
  gain: GainNode;
};

const EntryContext = createContext<EntryContextValue | null>(null);

function getMediaError(error: MediaError | null) {
  if (!error) {
    return null;
  }

  return `${error.code}${error.message ? ` ${error.message}` : ""}`;
}

export function EntryProvider({ children }: { children: ReactNode }) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const roomAudioRefs = useRef(
    new Map<SceneSlug, HTMLAudioElement>(),
  );
  const roomSourceRefs = useRef(
    new Map<SceneSlug, MediaElementAudioSourceNode>(),
  );
  const roomGainRefs = useRef(new Map<SceneSlug, GainNode>());
  const roomEndedHandlerRefs = useRef(new Map<SceneSlug, () => void>());
  const roomRequestIdsRef = useRef(new Map<SceneSlug, number>());
  const videoSourcesRef = useRef(
    new WeakMap<HTMLVideoElement, MediaElementAudioSourceNode>(),
  );
  const videoGainRef = useRef<GainNode | null>(null);
  const activePlaylistRoomRef = useRef<SceneSlug | null>(null);
  const [hasEntered, setHasEntered] = useState(false);
  const [, setActivePlaylistRoomState] = useState<SceneSlug | null>(null);
  const [playlistStatus, setPlaylistStatus] = useState<PlaylistStatus>({
    currentSrc: "",
    currentTime: 0,
    error: null,
    lastEvent: "init",
    networkState: 0,
    paused: true,
    readyState: 0,
    room: "",
  });
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

  const ensureRoomPlaylistMixer = useCallback(
    (room: SceneSlug): RoomPlaylistMixer | null => {
      const audio = roomAudioRefs.current.get(room);
      const context = ensureAudioContext();

      if (!audio || !context) {
        return null;
      }

      let gain = roomGainRefs.current.get(room);

      if (!gain) {
        gain = context.createGain();
        gain.gain.value = 0;
        gain.connect(context.destination);
        roomGainRefs.current.set(room, gain);
      }

      if (!roomSourceRefs.current.has(room)) {
        const source = context.createMediaElementSource(audio);
        source.connect(gain);
        roomSourceRefs.current.set(room, source);
      }

      return {
        audio,
        gain,
      };
    },
    [ensureAudioContext],
  );

  const updatePlaylistStatus = useCallback(
    (room: SceneSlug | null, eventName: string) => {
      const activeRoom = room ?? activePlaylistRoomRef.current;
      const audio = activeRoom
        ? roomAudioRefs.current.get(activeRoom)
        : undefined;

      if (!activeRoom || !audio) {
        setPlaylistStatus({
          currentSrc: "",
          currentTime: 0,
          error: null,
          lastEvent: eventName,
          networkState: 0,
          paused: true,
          readyState: 0,
          room: "",
        });
        return;
      }

      setPlaylistStatus({
        currentSrc: audio.currentSrc || audio.getAttribute("src") || "",
        currentTime: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
        error: getMediaError(audio.error),
        lastEvent: eventName,
        networkState: audio.networkState,
        paused: audio.paused,
        readyState: audio.readyState,
        room: activeRoom,
      });
    },
    [],
  );

  const setVideoAudioLevel = useCallback((volume: number, muted: boolean) => {
    const nextGain = muted ? 0 : volume;
    setVideoGain(nextGain);

    if (!videoGainRef.current) {
      return;
    }

    videoGainRef.current.gain.value = nextGain;
  }, []);

  const setRoomPlaylistAudioLevel = useCallback(
    (room: SceneSlug, volume: number, muted: boolean) => {
      const nextGain = muted ? 0 : volume;
      const gain = roomGainRefs.current.get(room);

      if (activePlaylistRoomRef.current === room) {
        setPlaylistGain(nextGain);
      }

      if (!gain) {
        return;
      }

      gain.gain.value = nextGain;
    },
    [],
  );

  const setActivePlaylistRoom = useCallback(
    (room: SceneSlug, volume: number, muted: boolean) => {
      const nextGain = muted ? 0 : volume;
      activePlaylistRoomRef.current = room;
      setActivePlaylistRoomState(room);
      setPlaylistGain(nextGain);

      for (const [gainRoom, gain] of roomGainRefs.current.entries()) {
        gain.gain.value = gainRoom === room ? nextGain : 0;
      }

      updatePlaylistStatus(room, "active-room");
    },
    [updatePlaylistStatus],
  );

  const attachVideoAudio = useCallback(
    async (video: HTMLVideoElement, volume: number) => {
      const context = ensureAudioContext();

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

  const playRoomPlaylistTrack = useCallback(
    async ({
      room,
      src,
      startTime,
      volume,
      muted = false,
      onEnded,
    }: PlayRoomPlaylistTrackOptions) => {
      const mixer = ensureRoomPlaylistMixer(room);

      if (!mixer) {
        return;
      }

      const { audio } = mixer;
      const requestId = (roomRequestIdsRef.current.get(room) ?? 0) + 1;
      roomRequestIdsRef.current.set(room, requestId);

      if (onEnded) {
        roomEndedHandlerRefs.current.set(room, onEnded);
      } else {
        roomEndedHandlerRefs.current.delete(room);
      }

      audio.muted = false;
      audio.volume = 1;
      setRoomPlaylistAudioLevel(room, volume, muted);

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
          roomRequestIdsRef.current.get(room) !== requestId ||
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

      updatePlaylistStatus(room, "play-request");
    },
    [ensureRoomPlaylistMixer, setRoomPlaylistAudioLevel, updatePlaylistStatus],
  );

  const primeRoomPlaylistTrack = useCallback(
    (room: SceneSlug, src: string) => {
      const audio = roomAudioRefs.current.get(room);

      if (!audio) {
        return;
      }

      const absoluteSrc = new URL(src, window.location.href).href;
      const currentOrPendingSrc =
        audio.currentSrc || audio.getAttribute("src") || "";

      if (currentOrPendingSrc === absoluteSrc) {
        return;
      }

      audio.preload = "auto";
      audio.src = absoluteSrc;
      audio.load();
      updatePlaylistStatus(room, "prime");
    },
    [updatePlaylistStatus],
  );

  const resumeRoomPlaylistAudio = useCallback(
    async (room: SceneSlug, volume: number, muted: boolean) => {
      const mixer = ensureRoomPlaylistMixer(room);

      if (!mixer) {
        return;
      }

      const { audio } = mixer;
      audio.muted = false;
      audio.volume = 1;
      setRoomPlaylistAudioLevel(room, volume, muted);

      if (!muted && audio.currentSrc && audio.paused) {
        await audio.play();
      }

      updatePlaylistStatus(room, "resume-request");
    },
    [ensureRoomPlaylistMixer, setRoomPlaylistAudioLevel, updatePlaylistStatus],
  );

  const unlockRoomPlaylists = useCallback(
    async (options: UnlockRoomPlaylistOptions[]) => {
      const results = await Promise.allSettled(
        options.map((option) =>
          playRoomPlaylistTrack({
            ...option,
            muted: !option.active || option.muted,
            volume: option.active ? option.volume : 0,
          }),
        ),
      );
      const activeOption = options.find((option) => option.active);

      if (activeOption) {
        setActivePlaylistRoom(
          activeOption.room,
          activeOption.volume,
          Boolean(activeOption.muted),
        );
      }

      const failedResult = results.find(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected",
      );

      if (failedResult) {
        throw failedResult.reason;
      }
    },
    [playRoomPlaylistTrack, setActivePlaylistRoom],
  );

  useEffect(() => {
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
    const listeners: Array<{
      audio: HTMLAudioElement;
      eventName: (typeof eventNames)[number];
      listener: () => void;
    }> = [];

    for (const room of sceneSlugs) {
      const audio = roomAudioRefs.current.get(room);

      if (!audio) {
        continue;
      }

      for (const eventName of eventNames) {
        const listener = () => {
          if (room === activePlaylistRoomRef.current) {
            updatePlaylistStatus(room, eventName);
          }
        };
        audio.addEventListener(eventName, listener);
        listeners.push({ audio, eventName, listener });
      }
    }

    const interval = window.setInterval(
      () => updatePlaylistStatus(activePlaylistRoomRef.current, "tick"),
      1000,
    );
    updatePlaylistStatus(activePlaylistRoomRef.current, "mounted");

    return () => {
      window.clearInterval(interval);
      for (const { audio, eventName, listener } of listeners) {
        audio.removeEventListener(eventName, listener);
      }
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
    <EntryContext.Provider value={value}>
      {children}
      {sceneSlugs.map((room) => (
        <audio
          crossOrigin="anonymous"
          key={room}
          preload="auto"
          ref={(audio) => {
            if (audio) {
              roomAudioRefs.current.set(room, audio);
            } else {
              roomAudioRefs.current.delete(room);
            }
          }}
          onEnded={() => roomEndedHandlerRefs.current.get(room)?.()}
        />
      ))}
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
