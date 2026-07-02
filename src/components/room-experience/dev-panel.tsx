import type { MouseEvent } from "react";
import type { Scene, SceneSlug, SceneViewport } from "@/lib/scenes";
import { sceneSlugs } from "@/lib/scenes";
import { ROOT_HREF } from "./constants";
import {
  DevPanelSoundSection,
  type PlaylistStatusSummary,
} from "./dev-panel-sound-section";
import type { PlaylistTrack, PointerPosition } from "./types";
import { classNames, devOutline } from "./ui";

type VideoSourceSummary = {
  height: number;
  width: number;
};

type DevPanelProps = {
  activePlaylistTrack: PlaylistTrack | null;
  activeVideoSource: VideoSourceSummary;
  audioError: string | null;
  debugHotspots: boolean;
  devBorders: boolean;
  devPanelOpen: boolean;
  hasEntered: boolean;
  onEnter: () => void;
  onNavigate: (event: MouseEvent<HTMLAnchorElement>, slug: SceneSlug) => void;
  onPrimeScene: (scene: Scene) => void;
  onShowLoading: () => void;
  onShowMetadata: (title: string, album?: string, artist?: string) => void;
  onShowPlaylistMetadata: (track: PlaylistTrack | null) => void;
  onTogglePanel: () => void;
  onTogglePlaylistAudio: () => void;
  onToggleVideoAudio: () => void;
  playlistAudioActive: boolean;
  playlistEnabled: boolean;
  playlistGain: number;
  playlistStatus: PlaylistStatusSummary;
  playlistTrackIndex: number;
  playlistTracks: PlaylistTrack[];
  pointerPosition: PointerPosition | null;
  runtimeScenes: Record<SceneSlug, Scene>;
  scene: Scene;
  sceneViewport: SceneViewport | null;
  videoAudioActive: boolean;
  videoAudioEnabled: boolean;
  videoElementStatus: string;
  videoGain: number;
  videoVolume: number;
};

export function DevPanel({
  activePlaylistTrack,
  activeVideoSource,
  audioError,
  debugHotspots,
  devBorders,
  devPanelOpen,
  hasEntered,
  onEnter,
  onNavigate,
  onPrimeScene,
  onShowLoading,
  onShowMetadata,
  onShowPlaylistMetadata,
  onTogglePanel,
  onTogglePlaylistAudio,
  onToggleVideoAudio,
  playlistAudioActive,
  playlistEnabled,
  playlistGain,
  playlistStatus,
  playlistTrackIndex,
  playlistTracks,
  pointerPosition,
  runtimeScenes,
  scene,
  sceneViewport,
  videoAudioActive,
  videoAudioEnabled,
  videoElementStatus,
  videoGain,
  videoVolume,
}: DevPanelProps) {
  return (
    <aside
      className={classNames(
        "fixed right-3 top-3 z-50 max-h-[calc(100dvh-1.5rem)] w-[min(15rem,calc(100vw-1.5rem))] overflow-y-auto overscroll-contain border border-white/20 bg-black/85 font-mono text-[0.65rem] leading-snug text-white shadow-2xl backdrop-blur",
        devOutline(devBorders, 5),
      )}
    >
      <button
        type="button"
        onClick={onTogglePanel}
        className={classNames(
          "flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left uppercase tracking-[0.16em] text-white/80 hover:text-white",
          devOutline(devBorders, 0),
        )}
        aria-expanded={devPanelOpen}
      >
        <span>{scene.title}</span>
        <span aria-hidden="true">{devPanelOpen ? "-" : "+"}</span>
      </button>

      <div
        className={classNames(
          "grid gap-2 border-t border-white/15 p-2",
          devOutline(devBorders, 1),
        )}
      >
        <div
          className={classNames(
            "grid grid-cols-1 gap-1",
            devOutline(devBorders, 2),
          )}
        >
          {sceneSlugs.map((slug, index) => (
            <a
              key={slug}
              href={ROOT_HREF}
              onFocus={() => onPrimeScene(runtimeScenes[slug])}
              onPointerDown={() => onPrimeScene(runtimeScenes[slug])}
              onPointerEnter={() => onPrimeScene(runtimeScenes[slug])}
              onClick={(event) => onNavigate(event, slug)}
              aria-current={scene.slug === slug ? "page" : undefined}
              className={classNames(
                "truncate border border-white/20 px-2 py-1 text-center uppercase text-white/70 hover:border-white/70 hover:text-white aria-[current=page]:border-white aria-[current=page]:text-white",
                devOutline(devBorders, 3 + index),
              )}
            >
              {runtimeScenes[slug].title}
            </a>
          ))}
        </div>

        <DevPanelSoundSection
          activePlaylistTrack={activePlaylistTrack}
          audioError={audioError}
          devBorders={devBorders}
          hasEntered={hasEntered}
          onEnter={onEnter}
          onShowMetadata={onShowMetadata}
          onShowPlaylistMetadata={onShowPlaylistMetadata}
          onTogglePlaylistAudio={onTogglePlaylistAudio}
          onToggleVideoAudio={onToggleVideoAudio}
          playlistAudioActive={playlistAudioActive}
          playlistEnabled={playlistEnabled}
          playlistGain={playlistGain}
          playlistStatus={playlistStatus}
          playlistTrackIndex={playlistTrackIndex}
          playlistTracks={playlistTracks}
          scene={scene}
          videoAudioActive={videoAudioActive}
          videoAudioEnabled={videoAudioEnabled}
          videoElementStatus={videoElementStatus}
          videoGain={videoGain}
          videoVolume={videoVolume}
        />

        <div
          className={classNames(
            "grid gap-0.5 border border-white/15 p-2 text-white/60",
            devOutline(devBorders, 2),
          )}
        >
          <p>Scene: {scene.slug}</p>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onShowLoading}
              className={classNames(
                "cursor-pointer border border-white/30 px-1.5 py-1 uppercase text-white hover:border-white",
                devOutline(devBorders, 3),
              )}
            >
              Show loading
            </button>
          </div>
          <p>
            Video: {sceneViewport ?? "detecting"} / {activeVideoSource.width}x
            {activeVideoSource.height} /{" "}
            {scene.video.durationSeconds.toFixed(3)}s
          </p>
          <p>Borders: {devBorders ? "visible" : "hidden"}</p>
          <p>
            Hotspots:{" "}
            {debugHotspots
              ? pointerPosition
                ? `x ${pointerPosition.x}%, y ${pointerPosition.y}%`
                : "visible"
              : "add ?hotspots=1"}
          </p>
        </div>
      </div>
    </aside>
  );
}
