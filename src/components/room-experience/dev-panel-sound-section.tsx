import type { Scene } from "@/lib/scenes";
import type { PlaylistTrack } from "./types";
import { classNames, devOutline } from "./ui";

export type PlaylistStatusSummary = {
  currentSrc: string;
  error: string | null;
  lastEvent: string;
  networkState: number;
  paused: boolean;
  readyState: number;
};

type DevPanelSoundSectionProps = {
  activePlaylistTrack: PlaylistTrack | null;
  audioError: string | null;
  devBorders: boolean;
  hasEntered: boolean;
  onEnter: () => void;
  onShowMetadata: (title: string, album?: string, artist?: string) => void;
  onShowPlaylistMetadata: (track: PlaylistTrack | null) => void;
  onTogglePlaylistAudio: () => void;
  onToggleVideoAudio: () => void;
  playlistAudioActive: boolean;
  playlistEnabled: boolean;
  playlistGain: number;
  playlistStatus: PlaylistStatusSummary;
  playlistTrackIndex: number;
  playlistTracks: PlaylistTrack[];
  scene: Scene;
  videoAudioActive: boolean;
  videoAudioEnabled: boolean;
  videoElementStatus: string;
  videoGain: number;
  videoVolume: number;
};

function formatPlaylistTrackDisplayTitle(track: PlaylistTrack) {
  return track.album ? `${track.album} - ${track.title}` : track.title;
}

export function DevPanelSoundSection({
  activePlaylistTrack,
  audioError,
  devBorders,
  hasEntered,
  onEnter,
  onShowMetadata,
  onShowPlaylistMetadata,
  onTogglePlaylistAudio,
  onToggleVideoAudio,
  playlistAudioActive,
  playlistEnabled,
  playlistGain,
  playlistStatus,
  playlistTrackIndex,
  playlistTracks,
  scene,
  videoAudioActive,
  videoAudioEnabled,
  videoElementStatus,
  videoGain,
  videoVolume,
}: DevPanelSoundSectionProps) {
  return (
    <div
      className={classNames(
        "grid gap-1.5 border border-white/15 p-2",
        devOutline(devBorders, 2),
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="uppercase text-white/60">Sound</span>
        {!hasEntered ? (
          <button
            type="button"
            onClick={onEnter}
            className={classNames(
              "border border-white/30 px-1.5 py-1 uppercase text-white hover:border-white",
              devOutline(devBorders, 3),
            )}
          >
            Enter
          </button>
        ) : (
          <span className="uppercase text-white/50">Unlocked</span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 text-white/60">
        <span>
          Video audio:{" "}
          {videoAudioEnabled
            ? videoAudioActive
              ? `on / volume ${videoVolume}`
              : "muted"
            : "off"}
        </span>
        {videoAudioEnabled ? (
          <button
            type="button"
            onClick={onToggleVideoAudio}
            className={classNames(
              "border border-white/30 px-1.5 py-1 uppercase text-white hover:border-white",
              devOutline(devBorders, 3),
            )}
          >
            {videoAudioActive ? "Mute" : "Unmute"}
          </button>
        ) : null}
      </div>

      <p className="break-words text-white/45">
        Video element: {videoElementStatus}
      </p>
      <p className="text-white/60">
        Playlist:{" "}
        {playlistEnabled
          ? playlistTracks.length > 0
            ? `${scene.playlist?.name} (${playlistTracks.length}) / ${
                playlistAudioActive ? "on" : "muted"
              }`
            : `${scene.playlist?.name} / tracks not published yet`
          : "off"}
      </p>

      {playlistEnabled && playlistTracks.length > 0 ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onTogglePlaylistAudio}
            className={classNames(
              "border border-white/30 px-1.5 py-1 uppercase text-white hover:border-white",
              devOutline(devBorders, 3),
            )}
          >
            {playlistAudioActive ? "Mute playlist" : "Unmute playlist"}
          </button>
        </div>
      ) : null}

      {playlistEnabled && activePlaylistTrack ? (
        <div className="grid gap-1">
          <p className="text-white/80">
            Now playing: {playlistTrackIndex + 1}/{playlistTracks.length}{" "}
            {formatPlaylistTrackDisplayTitle(activePlaylistTrack)}
          </p>
          <div className="flex flex-wrap justify-end gap-1">
            <button
              type="button"
              onClick={() => onShowPlaylistMetadata(activePlaylistTrack)}
              className={classNames(
                "cursor-pointer border border-white/30 px-1.5 py-1 uppercase text-white hover:border-white",
                devOutline(devBorders, 3),
              )}
            >
              Show metadata
            </button>
            <button
              type="button"
              onClick={() =>
                onShowMetadata(
                  "The Extraordinary Paper Planet Construction Parade",
                  activePlaylistTrack.album,
                  "Paper Planet Players",
                )
              }
              className={classNames(
                "cursor-pointer border border-white/30 px-1.5 py-1 uppercase text-white hover:border-white",
                devOutline(devBorders, 3),
              )}
            >
              Long title
            </button>
            <button
              type="button"
              onClick={() =>
                onShowMetadata(
                  activePlaylistTrack.title,
                  "The Complete Songs From The Long Walk Through Paper Planet",
                  "Connor W.",
                )
              }
              className={classNames(
                "cursor-pointer border border-white/30 px-1.5 py-1 uppercase text-white hover:border-white",
                devOutline(devBorders, 3),
              )}
            >
              Long album
            </button>
            <button
              type="button"
              onClick={() =>
                onShowMetadata("Conito's Way", "Alpaulccino", "Connor Wilson")
              }
              className={classNames(
                "cursor-pointer border border-white/30 px-1.5 py-1 uppercase text-white hover:border-white",
                devOutline(devBorders, 3),
              )}
            >
              Conito&apos;s
            </button>
          </div>
        </div>
      ) : null}

      <p className="text-white/55">
        Playlist state: {playlistStatus.lastEvent} /{" "}
        {playlistStatus.paused ? "paused" : "playing"} / ready{" "}
        {playlistStatus.readyState} / net {playlistStatus.networkState}
      </p>
      <p className="text-white/55">
        Mixer gain: video {videoGain.toFixed(2)} / playlist{" "}
        {playlistGain.toFixed(2)}
      </p>
      <p className="truncate text-white/45">
        Playlist source:{" "}
        {playlistStatus.currentSrc
          ? playlistStatus.currentSrc.split("/").at(-1)
          : "none"}
      </p>
      {audioError ? <p className="text-red-300">{audioError}</p> : null}
      {playlistStatus.error ? (
        <p className="text-red-300">{playlistStatus.error}</p>
      ) : null}
    </div>
  );
}
