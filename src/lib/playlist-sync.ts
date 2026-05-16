import type { Scene, SceneSlug } from "@/lib/scenes";

export type SyncedPlaylistPosition = {
  trackIndex: number;
  currentTime: number;
};

type PlaylistTrack = {
  durationSeconds: number;
};

export function getSyncedPlaylistPositionForTracks(
  tracks: PlaylistTrack[],
  epochOffsetSeconds = 0,
): SyncedPlaylistPosition | null {
  if (tracks.length === 0) {
    return null;
  }

  const totalDuration = tracks.reduce(
    (total, track) => total + track.durationSeconds,
    0,
  );

  if (totalDuration <= 0) {
    return null;
  }

  let playlistTime =
    (((Date.now() / 1000 + epochOffsetSeconds) % totalDuration) +
      totalDuration) %
    totalDuration;

  for (let index = 0; index < tracks.length; index += 1) {
    const track = tracks[index];

    if (playlistTime < track.durationSeconds) {
      return {
        trackIndex: index,
        currentTime: playlistTime,
      };
    }

    playlistTime -= track.durationSeconds;
  }

  return {
    trackIndex: 0,
    currentTime: 0,
  };
}

export function getInitialPlaylistPosition(scene: Scene) {
  const playlist = scene.playlist;

  if (!playlist?.sync?.enabled || playlist.tracks.length === 0) {
    return {
      trackIndex: 0,
      currentTime: 0,
    };
  }

  return (
    getSyncedPlaylistPositionForTracks(
      playlist.tracks,
      playlist.sync.epochOffsetSeconds ?? 0,
    ) ?? {
      trackIndex: 0,
      currentTime: 0,
    }
  );
}

export function getScenePlaylistPlayback(scene: Scene) {
  const playlist = scene.playlist;

  if (!playlist?.enabled || playlist.tracks.length === 0) {
    return null;
  }

  const position = getInitialPlaylistPosition(scene);
  const track = playlist.tracks[position.trackIndex] ?? playlist.tracks[0];

  if (!track) {
    return null;
  }

  return {
    room: scene.slug as SceneSlug,
    track,
    trackIndex: position.trackIndex,
    currentTime: position.currentTime,
    volume: playlist.volume,
  };
}
