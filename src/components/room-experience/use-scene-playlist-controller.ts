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
  error: string | null;
  lastEvent: string;
  networkState: number;
  paused: boolean;
  readyState: number;
};

type PlayRoomPlaylistTrack = (options: {
  muted?: boolean;
  onEnded?: () => void;
  room: SceneSlug;
  src: string;
  startTime: number;
  volume: number;
}) => Promise<unknown>;

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
      setActivePlaylistRoom(targetScene.slug, targetPlaylist.volume, muted);
    },
    [
      hasEntered,
      playRoomPlaylistTrack,
      playlistAudioMuted,
      sceneSlugRef,
      setActivePlaylistRoom,
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
