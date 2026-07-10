import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Scene, SceneSlug } from "@/lib/scenes";
import { sceneSlugs } from "@/lib/scenes";
import {
  getScenePlaylistPlayback,
  getSyncedPlaylistPositionForTracks,
  type SyncedPlaylistPosition,
} from "@/lib/playlist-sync";
import {
  getMediaErrorMessage,
  isExpectedMediaInterruption,
} from "./media-utils";

type PlaylistStatus = {
  currentSrc: string;
  currentTime: number;
  error: string | null;
  lastEvent: string;
  networkState: number;
  paused: boolean;
  readyState: number;
};

type PlayRoomPlaylistTrack = (options: {
  forceReload?: boolean;
  muted?: boolean;
  onEnded?: () => void;
  room: SceneSlug;
  src: string;
  startTime: number;
  volume: number;
}) => Promise<unknown>;

type PlaylistRecoveryWatch = {
  attempts: number;
  key: string;
  lastAttemptAt: number;
  lastObservedTime: number;
  lastProgressAt: number;
};

const PLAYLIST_HEALTH_CHECK_MS = 2_000;
const PLAYLIST_STALL_THRESHOLD_MS = 5_000;
const PLAYLIST_RECOVERY_BACKOFF_MS = [0, 1_000, 3_000, 8_000, 15_000];

function createPlaylistRecoveryWatch(key = ""): PlaylistRecoveryWatch {
  return {
    attempts: 0,
    key,
    lastAttemptAt: 0,
    lastObservedTime: 0,
    lastProgressAt: performance.now(),
  };
}

type UseScenePlaylistControllerOptions = {
  audioTransitionMuted: boolean;
  hasEntered: boolean;
  playRoomPlaylistTrack: PlayRoomPlaylistTrack;
  playlistStatus: PlaylistStatus;
  primeRoomPlaylistTrack: (room: SceneSlug, src: string) => void;
  resumeRoomPlaylistAudio: (
    room: SceneSlug,
    volume: number,
    muted: boolean,
  ) => Promise<unknown>;
  runtimeScenes: Record<SceneSlug, Scene>;
  scene: Scene;
  sceneSlugRef: { current: SceneSlug };
  setActivePlaylistRoom: (
    room: SceneSlug,
    volume: number,
    muted: boolean,
  ) => void;
  setAudioError: (message: string | null) => void;
  stopRoomPlaylistAudio: (room: SceneSlug) => void;
};

export function useScenePlaylistController({
  audioTransitionMuted,
  hasEntered,
  playRoomPlaylistTrack,
  playlistStatus,
  primeRoomPlaylistTrack,
  resumeRoomPlaylistAudio,
  runtimeScenes,
  scene,
  sceneSlugRef,
  setActivePlaylistRoom,
  setAudioError,
  stopRoomPlaylistAudio,
}: UseScenePlaylistControllerOptions) {
  const [playlistAudioMuted, setPlaylistAudioMuted] = useState(false);
  const [playlistTrackIndex, setPlaylistTrackIndex] = useState(0);
  const [playlistStartTime, setPlaylistStartTime] = useState(0);
  const playlistAudioActiveRef = useRef(false);
  const playlistStatusRef = useRef(playlistStatus);
  const playlistRecoveryRef = useRef<PlaylistRecoveryWatch | null>(null);

  const playlistEnabled = scene.playlist?.enabled ?? false;
  const playlistTracks = useMemo(
    () => scene.playlist?.tracks ?? [],
    [scene.playlist?.tracks],
  );
  const playlistSyncEnabled = scene.playlist?.sync?.enabled ?? false;
  const playlistEpochOffset = scene.playlist?.sync?.epochOffsetSeconds ?? 0;
  const playlistVolume = scene.playlist?.volume ?? 0.65;
  const activePlaylistTrack = playlistTracks[playlistTrackIndex] ?? null;
  const playlistAudioActive =
    hasEntered &&
    playlistEnabled &&
    Boolean(activePlaylistTrack) &&
    !playlistAudioMuted &&
    !audioTransitionMuted;

  useEffect(() => {
    playlistAudioActiveRef.current = playlistAudioActive;
  }, [playlistAudioActive]);

  useEffect(() => {
    playlistStatusRef.current = playlistStatus;
  }, [playlistStatus]);

  const getSyncedPlaylistPosition = useCallback(
    (): SyncedPlaylistPosition | null => {
      if (!playlistSyncEnabled || playlistTracks.length === 0) {
        return null;
      }

      return getSyncedPlaylistPositionForTracks(
        playlistTracks,
        playlistEpochOffset,
      );
    },
    [playlistEpochOffset, playlistSyncEnabled, playlistTracks],
  );

  const resumeActivePlaylistAudio = useCallback(
    (label = "Playlist audio blocked") => {
      if (!playlistAudioActive || !activePlaylistTrack) {
        return;
      }

      void resumeRoomPlaylistAudio(scene.slug, playlistVolume, false).catch(
        (error: unknown) => {
          if (isExpectedMediaInterruption(error)) {
            return;
          }

          setAudioError(getMediaErrorMessage(error, label));
        },
      );
    },
    [
      activePlaylistTrack,
      playlistAudioActive,
      playlistVolume,
      resumeRoomPlaylistAudio,
      scene.slug,
      setAudioError,
    ],
  );

  useEffect(() => {
    playlistRecoveryRef.current = null;
  }, [activePlaylistTrack?.src, scene.slug]);

  useEffect(() => {
    if (!playlistAudioActive || !activePlaylistTrack) {
      playlistRecoveryRef.current = null;
      return undefined;
    }

    const recoveryKey = `${scene.slug}:${activePlaylistTrack.src}`;

    const checkPlaylistHealth = () => {
      if (document.hidden || !navigator.onLine) {
        return;
      }

      const status = playlistStatusRef.current;
      const now = performance.now();
      let watch = playlistRecoveryRef.current;

      if (!watch || watch.key !== recoveryKey) {
        watch = createPlaylistRecoveryWatch(recoveryKey);
        watch.lastObservedTime = status.currentTime;
        playlistRecoveryRef.current = watch;
      }

      const progressed =
        status.currentTime > watch.lastObservedTime + 0.05 ||
        status.currentTime < watch.lastObservedTime - 0.5;

      if (progressed) {
        watch.attempts = 0;
        watch.lastProgressAt = now;
        watch.lastObservedTime = status.currentTime;
        return;
      }

      watch.lastObservedTime = status.currentTime;

      const explicitlyUnhealthy =
        Boolean(status.error) ||
        status.paused ||
        status.networkState === HTMLMediaElement.NETWORK_NO_SOURCE;
      const stoppedProgressing =
        now - watch.lastProgressAt >= PLAYLIST_STALL_THRESHOLD_MS &&
        status.readyState < HTMLMediaElement.HAVE_FUTURE_DATA;

      if (!explicitlyUnhealthy && !stoppedProgressing) {
        return;
      }

      const backoffIndex = Math.min(
        watch.attempts,
        PLAYLIST_RECOVERY_BACKOFF_MS.length - 1,
      );
      const recoveryDelay = PLAYLIST_RECOVERY_BACKOFF_MS[backoffIndex];

      if (now - watch.lastAttemptAt < recoveryDelay) {
        return;
      }

      watch.attempts += 1;
      watch.lastAttemptAt = now;

      const position = getSyncedPlaylistPosition();
      const targetTrack = position
        ? playlistTracks[position.trackIndex]
        : activePlaylistTrack;

      if (!targetTrack) {
        return;
      }

      if (position) {
        setPlaylistTrackIndex(position.trackIndex);
        setPlaylistStartTime(position.currentTime);
      }

      void playRoomPlaylistTrack({
        forceReload: watch.attempts >= 2,
        room: scene.slug,
        src: targetTrack.src,
        startTime: position?.currentTime ?? status.currentTime,
        volume: playlistVolume,
        onEnded: () => {
          setPlaylistTrackIndex(
            (current) => (current + 1) % playlistTracks.length,
          );
          setPlaylistStartTime(0);
        },
      })
        .catch((error: unknown) => {
          if (!isExpectedMediaInterruption(error)) {
            setAudioError(
              getMediaErrorMessage(error, "Playlist audio recovery failed"),
            );
          }
        });
    };

    const handleReturn = () => {
      if (!document.hidden) {
        checkPlaylistHealth();
      }
    };
    const interval = window.setInterval(
      checkPlaylistHealth,
      PLAYLIST_HEALTH_CHECK_MS,
    );

    window.addEventListener("focus", handleReturn);
    window.addEventListener("online", handleReturn);
    document.addEventListener("visibilitychange", handleReturn);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleReturn);
      window.removeEventListener("online", handleReturn);
      document.removeEventListener("visibilitychange", handleReturn);
    };
  }, [
    activePlaylistTrack,
    getSyncedPlaylistPosition,
    playRoomPlaylistTrack,
    playlistAudioActive,
    playlistTracks,
    playlistVolume,
    scene.slug,
    setActivePlaylistRoom,
    setAudioError,
  ]);

  const playPlaylistForScene = useCallback(
    async (targetScene: Scene, muted = false) => {
      if (!hasEntered || playlistAudioMuted) {
        return;
      }

      const targetPlaylist = targetScene.playlist;

      if (!targetPlaylist?.enabled || targetPlaylist.tracks.length === 0) {
        stopRoomPlaylistAudio(targetScene.slug);
        return;
      }

      const position = getSyncedPlaylistPositionForTracks(
        targetPlaylist.tracks,
        targetPlaylist.sync?.epochOffsetSeconds ?? 0,
      );
      const targetTrack = position
        ? targetPlaylist.tracks[position.trackIndex]
        : targetPlaylist.tracks[0];

      if (!targetTrack) {
        return;
      }

      await playRoomPlaylistTrack({
        room: targetScene.slug,
        src: targetTrack.src,
        startTime: position?.currentTime ?? 0,
        volume: targetPlaylist.volume,
        muted,
        onEnded: () => {
          if (targetScene.slug !== sceneSlugRef.current) {
            return;
          }

          setPlaylistTrackIndex(
            (current) => (current + 1) % targetPlaylist.tracks.length,
          );
          setPlaylistStartTime(0);
        },
      });
    },
    [
      hasEntered,
      playRoomPlaylistTrack,
      playlistAudioMuted,
      sceneSlugRef,
      stopRoomPlaylistAudio,
    ],
  );

  const primeScenePlaylist = useCallback(
    (targetScene: Scene) => {
      const playback = getScenePlaylistPlayback(targetScene);

      if (!playback) {
        return;
      }

      primeRoomPlaylistTrack(targetScene.slug, playback.track.src);
    },
    [primeRoomPlaylistTrack],
  );

  const getRoomPlaylistUnlockOptions = useCallback(
    () =>
      sceneSlugs.flatMap((slug) => {
        const targetScene = runtimeScenes[slug];
        const playback = getScenePlaylistPlayback(targetScene);

        if (!playback) {
          return [];
        }

        return [
          {
            active: slug === scene.slug,
            room: slug,
            src: playback.track.src,
            startTime: playback.currentTime,
            volume: playback.volume,
            onEnded:
              slug === scene.slug
                ? () => {
                    setPlaylistTrackIndex(
                      (current) => (current + 1) % playlistTracks.length,
                    );
                    setPlaylistStartTime(0);
                  }
                : undefined,
          },
        ];
      }),
    [playlistTracks.length, runtimeScenes, scene.slug],
  );

  useEffect(() => {
    if (hasEntered || !activePlaylistTrack) {
      return;
    }

    primeRoomPlaylistTrack(scene.slug, activePlaylistTrack.src);
  }, [activePlaylistTrack, hasEntered, primeRoomPlaylistTrack, scene.slug]);

  useEffect(() => {
    if (!playlistEnabled || playlistTracks.length === 0) {
      return;
    }

    const syncPlaylist = () => {
      const position = getSyncedPlaylistPosition();

      if (!position) {
        return;
      }

      const status = playlistStatusRef.current;
      const activePlaybackIsHealthy =
        playlistAudioActiveRef.current &&
        !status.paused &&
        status.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;

      if (activePlaybackIsHealthy) {
        return;
      }

      setPlaylistTrackIndex(position.trackIndex);
      setPlaylistStartTime(position.currentTime);
    };

    syncPlaylist();
    const interval = window.setInterval(syncPlaylist, 30_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [
    getSyncedPlaylistPosition,
    playlistEnabled,
    playlistTracks.length,
  ]);

  useEffect(() => {
    if (!playlistAudioActive || !activePlaylistTrack) {
      return;
    }

    const playCurrentTrack = () =>
      playRoomPlaylistTrack({
        room: scene.slug,
        src: activePlaylistTrack.src,
        startTime: playlistStartTime,
        volume: playlistVolume,
        onEnded: () => {
          setPlaylistTrackIndex(
            (current) => (current + 1) % playlistTracks.length,
          );
          setPlaylistStartTime(0);
        },
      });

    void playCurrentTrack().catch((error: unknown) => {
      if (isExpectedMediaInterruption(error)) {
        return;
      }

      setAudioError(getMediaErrorMessage(error, "Playlist audio blocked"));
    });

    return undefined;
  }, [
    activePlaylistTrack,
    playRoomPlaylistTrack,
    playlistAudioActive,
    playlistStartTime,
    playlistTracks.length,
    playlistVolume,
    scene.slug,
    setAudioError,
  ]);

  useEffect(() => {
    if (!playlistEnabled) {
      stopRoomPlaylistAudio(scene.slug);
      return;
    }

    setActivePlaylistRoom(scene.slug, playlistVolume, !playlistAudioActive);
  }, [
    playlistAudioActive,
    playlistEnabled,
    playlistVolume,
    scene.slug,
    setActivePlaylistRoom,
    stopRoomPlaylistAudio,
  ]);

  return {
    activePlaylistTrack,
    getRoomPlaylistUnlockOptions,
    playPlaylistForScene,
    playlistAudioActive,
    playlistAudioMuted,
    playlistEnabled,
    playlistStartTime,
    playlistTrackIndex,
    playlistTracks,
    playlistVolume,
    primeScenePlaylist,
    resumeActivePlaylistAudio,
    setPlaylistAudioMuted,
    setPlaylistStartTime,
    setPlaylistTrackIndex,
  };
}
