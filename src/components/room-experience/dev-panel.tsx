import type { MouseEvent } from "react";
import type { Scene, SceneSlug, SceneViewport } from "@/lib/scenes";
import { sceneSlugs } from "@/lib/scenes";
import { ROOT_HREF } from "./constants";
import {
  DevPanelSoundSection,
  type PlaylistStatusSummary,
} from "./dev-panel-sound-section";
import {
  formatAspect,
  formatSafeSquareRatio,
  MAX_SAFE_SQUARE_SHORT_SIDE_RATIO,
  MIN_SAFE_SQUARE_SHORT_SIDE_RATIO,
  type SafeSquareMetrics,
} from "./safe-square";
import { SIMULATED_LANDSCAPE_LABEL } from "./landscape-simulation";
import type { PlaylistTrack, PointerPosition } from "./types";
import { classNames, devOutline } from "./ui";

type VideoSourceSummary = {
  height: number;
  width: number;
};

type BrowserViewportSummary = {
  height: number;
  width: number;
};

type DevPanelProps = {
  activePlaylistTrack: PlaylistTrack | null;
  activeVideoSource: VideoSourceSummary;
  audioError: string | null;
  browserViewport: BrowserViewportSummary | null;
  debugHotspots: boolean;
  devBorders: boolean;
  devPanelOpen: boolean;
  fullBleedPreview: boolean;
  hasEntered: boolean;
  landscapeSimulationActive: boolean;
  onEnter: () => void;
  onNavigate: (event: MouseEvent<HTMLAnchorElement>, slug: SceneSlug) => void;
  onPrimeScene: (scene: Scene) => void;
  onShowLoading: () => void;
  onShowMetadata: (title: string, album?: string, artist?: string) => void;
  onShowPlaylistMetadata: (track: PlaylistTrack | null) => void;
  onSafeSquareRatioChange: (value: number) => void;
  onToggleFullBleedPreview: () => void;
  onToggleLandscapeSimulation: () => void;
  onTogglePanel: () => void;
  onTogglePlaylistAudio: () => void;
  onToggleSafeSquare: () => void;
  onToggleVideoAudio: () => void;
  playlistAudioActive: boolean;
  playlistEnabled: boolean;
  playlistGain: number;
  playlistStatus: PlaylistStatusSummary;
  playlistTrackIndex: number;
  playlistTracks: PlaylistTrack[];
  pointerPosition: PointerPosition | null;
  runtimeScenes: Record<SceneSlug, Scene>;
  safeSquareMetrics: SafeSquareMetrics;
  safeSquareRatio: number;
  safeSquareVisible: boolean;
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
  browserViewport,
  debugHotspots,
  devBorders,
  devPanelOpen,
  fullBleedPreview,
  hasEntered,
  landscapeSimulationActive,
  onEnter,
  onNavigate,
  onPrimeScene,
  onShowLoading,
  onShowMetadata,
  onShowPlaylistMetadata,
  onSafeSquareRatioChange,
  onToggleFullBleedPreview,
  onToggleLandscapeSimulation,
  onTogglePanel,
  onTogglePlaylistAudio,
  onToggleSafeSquare,
  onToggleVideoAudio,
  playlistAudioActive,
  playlistEnabled,
  playlistGain,
  playlistStatus,
  playlistTrackIndex,
  playlistTracks,
  pointerPosition,
  runtimeScenes,
  safeSquareMetrics,
  safeSquareRatio,
  safeSquareVisible,
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
          <p>
            Browser:{" "}
            {browserViewport
              ? `${browserViewport.width}x${browserViewport.height} / ${(
                  browserViewport.width / browserViewport.height
                ).toFixed(2)}`
              : "detecting"}
          </p>
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
          <div className="grid grid-cols-2 gap-1 py-1">
            <button
              type="button"
              onClick={onToggleFullBleedPreview}
              className={classNames(
                "cursor-pointer border px-1.5 py-1 uppercase hover:border-white",
                fullBleedPreview
                  ? "border-cyan-200 text-cyan-100"
                  : "border-white/30 text-white",
                devOutline(devBorders, 3),
              )}
            >
              Full bleed
            </button>
            <button
              type="button"
              onClick={onToggleSafeSquare}
              className={classNames(
                "cursor-pointer border px-1.5 py-1 uppercase hover:border-white",
                safeSquareVisible
                  ? "border-cyan-200 text-cyan-100"
                  : "border-white/30 text-white",
                devOutline(devBorders, 4),
              )}
            >
              Safe zone
            </button>
            <button
              type="button"
              onClick={onToggleLandscapeSimulation}
              className={classNames(
                "col-span-2 cursor-pointer border px-1.5 py-1 uppercase hover:border-white",
                landscapeSimulationActive
                  ? "border-cyan-200 text-cyan-100"
                  : "border-white/30 text-white",
                devOutline(devBorders, 5),
              )}
            >
              {SIMULATED_LANDSCAPE_LABEL} sim
            </button>
          </div>
          {safeSquareMetrics.mode === "portrait-safe-area" ? (
            <>
              <p>
                Safe: {safeSquareMetrics.widthPixels}x
                {safeSquareMetrics.heightPixels}px /{" "}
                {safeSquareMetrics.horizontalMarginPixels}px side /{" "}
                {safeSquareMetrics.verticalMarginPixels}px top
              </p>
              <p>
                Portrait range: {formatAspect(safeSquareMetrics.minAspect)}-
                {formatAspect(safeSquareMetrics.maxAspect)}
              </p>
            </>
          ) : (
            <p>
              Safe: {safeSquareMetrics.widthPixels}x
              {safeSquareMetrics.heightPixels}px /{" "}
              {safeSquareMetrics.horizontalMarginPixels}px side margins
            </p>
          )}
          <label className="grid gap-1 py-1">
            <span className="flex items-center justify-between gap-2">
              <span>Safe size</span>
              <span>{formatSafeSquareRatio(safeSquareRatio)}</span>
            </span>
            <input
              aria-label="Safe zone size"
              data-safe-square-ratio="true"
              type="range"
              min={MIN_SAFE_SQUARE_SHORT_SIDE_RATIO}
              max={MAX_SAFE_SQUARE_SHORT_SIDE_RATIO}
              step="0.01"
              value={safeSquareRatio}
              onChange={(event) =>
                onSafeSquareRatioChange(Number(event.target.value))
              }
              className="cursor-pointer accent-cyan-200"
            />
            <input
              aria-label="Safe zone ratio value"
              data-safe-square-ratio-number="true"
              type="number"
              min={MIN_SAFE_SQUARE_SHORT_SIDE_RATIO}
              max={MAX_SAFE_SQUARE_SHORT_SIDE_RATIO}
              step="0.01"
              value={safeSquareRatio}
              onChange={(event) =>
                onSafeSquareRatioChange(Number(event.target.value))
              }
              className="w-16 border border-white/20 bg-black px-1.5 py-1 font-mono text-white outline-none focus:border-cyan-200"
            />
          </label>
          {safeSquareMetrics.mode === "square" ? (
            <p>
              Safe aspect: {formatAspect(safeSquareMetrics.minAspect)}-
              {formatAspect(safeSquareMetrics.maxAspect)}
            </p>
          ) : null}
          <p>Borders: {devBorders ? "visible" : "hidden"}</p>
          <p>
            Hotspots:{" "}
            {debugHotspots
              ? pointerPosition
                ? `x ${pointerPosition.x}%, y ${pointerPosition.y}%`
                : "visible"
              : "hidden"}
          </p>
        </div>
      </div>
    </aside>
  );
}
