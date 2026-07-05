import type { CSSProperties, MouseEvent, PointerEvent, Ref } from "react";
import type { Hotspot, Scene, SceneViewport } from "@/lib/scenes";
import { HotspotLayer } from "./hotspot-layer";
import {
  CENTERED_SOURCE_WIDTH_PERCENT,
  CENTERED_SOURCE_X_PERCENT,
} from "./landscape-simulation";
import type { SafeSquareMetrics } from "./safe-square";
import { SceneOverlayLinks } from "./scene-overlay-links";
import { SceneVideoLayers } from "./scene-video-layers";
import { SceneTickerOverlay } from "./ticker-overlay";
import { classNames, devOutline } from "./ui";

type RoomStageProps = {
  debugHotspots: boolean;
  devBorders: boolean;
  fullBleedPreview: boolean;
  getActionHref: (action: Hotspot["action"]) => string;
  landscapeSimulationActive: boolean;
  onHotspotActionClick: (
    event: MouseEvent<HTMLAnchorElement>,
    action: Hotspot["action"],
  ) => void;
  onPrimeHotspotAction: (action: Hotspot["action"]) => void;
  onStagePointerCancel: (event: PointerEvent<HTMLDivElement>) => void;
  onStagePointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onStagePointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onStagePointerUp: (event: PointerEvent<HTMLDivElement>) => void;
  onVideoLoadedMetadata: (
    element: HTMLVideoElement,
    isVisible: boolean,
  ) => void;
  onVideoTimeUpdate: (timeSeconds: number) => void;
  onVideoVariantReady: (viewport: SceneViewport) => void;
  orderedHotspots: Hotspot[];
  resolvedSceneViewport: SceneViewport;
  safeSquareMetrics: SafeSquareMetrics;
  safeSquareVisible: boolean;
  scene: Scene;
  sceneViewport: SceneViewport | null;
  setVideoElement: (
    viewport: SceneViewport,
    element: HTMLVideoElement | null,
  ) => void;
  stageFrameStyle: CSSProperties;
  stageRef: Ref<HTMLDivElement>;
  stageTransformStyle: CSSProperties;
  videoAudioActive: boolean;
  videoAudioEnabled: boolean;
};

export function RoomStage({
  debugHotspots,
  devBorders,
  fullBleedPreview,
  getActionHref,
  landscapeSimulationActive,
  onHotspotActionClick,
  onPrimeHotspotAction,
  onStagePointerCancel,
  onStagePointerDown,
  onStagePointerMove,
  onStagePointerUp,
  onVideoLoadedMetadata,
  onVideoTimeUpdate,
  onVideoVariantReady,
  orderedHotspots,
  resolvedSceneViewport,
  safeSquareMetrics,
  safeSquareVisible,
  scene,
  sceneViewport,
  setVideoElement,
  stageFrameStyle,
  stageRef,
  stageTransformStyle,
  videoAudioActive,
  videoAudioEnabled,
}: RoomStageProps) {
  const centeredSourceRightPercent =
    CENTERED_SOURCE_X_PERCENT + CENTERED_SOURCE_WIDTH_PERCENT;

  return (
    <section
      className={classNames(
        "flex h-dvh touch-none justify-center overflow-hidden",
        fullBleedPreview || resolvedSceneViewport === "mobile"
          ? "p-0"
          : "p-3 sm:p-5",
        "items-center",
        devOutline(devBorders, 1),
      )}
    >
      <div
        ref={stageRef}
        className={classNames(
          "relative w-full shrink-0 touch-none overflow-hidden bg-black",
          devOutline(devBorders, 2),
        )}
        style={stageFrameStyle}
        onPointerDown={onStagePointerDown}
        onPointerMove={onStagePointerMove}
        onPointerUp={onStagePointerUp}
        onPointerCancel={onStagePointerCancel}
      >
        <div
          className={classNames(
            "absolute inset-0 origin-center will-change-transform",
            devOutline(devBorders, 3),
          )}
          style={stageTransformStyle}
        >
          {landscapeSimulationActive && resolvedSceneViewport === "desktop" ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-0"
              style={{
                background: `linear-gradient(90deg, rgba(8, 47, 73, 0.75) 0%, rgba(8, 47, 73, 0.75) ${CENTERED_SOURCE_X_PERCENT}%, rgba(0, 0, 0, 0.25) ${CENTERED_SOURCE_X_PERCENT}%, rgba(0, 0, 0, 0.25) ${centeredSourceRightPercent}%, rgba(8, 47, 73, 0.75) ${centeredSourceRightPercent}%, rgba(8, 47, 73, 0.75) 100%)`,
              }}
            />
          ) : null}

          <SceneVideoLayers
            devBorders={devBorders}
            landscapeSimulationActive={landscapeSimulationActive}
            onLoadedMetadata={onVideoLoadedMetadata}
            onVariantReady={onVideoVariantReady}
            onVisibleTimeUpdate={onVideoTimeUpdate}
            resolvedSceneViewport={resolvedSceneViewport}
            scene={scene}
            sceneViewport={sceneViewport}
            setVideoElement={setVideoElement}
            videoAudioActive={videoAudioActive}
            videoAudioEnabled={videoAudioEnabled}
          />

          {scene.ticker ? (
            <SceneTickerOverlay ticker={scene.ticker} devBorders={devBorders} />
          ) : null}

          {safeSquareVisible ? (
            <div
              data-safe-square-overlay="true"
              className="pointer-events-none absolute z-20 border border-dashed border-cyan-200/95 bg-cyan-300/5 shadow-[0_0_0_9999px_rgba(0,0,0,0.18),0_0_24px_rgba(103,232,249,0.45)]"
              style={{
                height: `${safeSquareMetrics.heightPercent}%`,
                left: `${safeSquareMetrics.xPercent}%`,
                top: `${safeSquareMetrics.yPercent}%`,
                width: `${safeSquareMetrics.widthPercent}%`,
              }}
              aria-hidden="true"
            >
              <span className="absolute left-1.5 top-1.5 bg-black/70 px-1.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-100">
                Safe zone
              </span>
            </div>
          ) : null}

          <HotspotLayer
            debugHotspots={debugHotspots}
            devBorders={devBorders}
            getActionHref={getActionHref}
            hotspots={orderedHotspots}
            onActionClick={onHotspotActionClick}
            onPrimeAction={onPrimeHotspotAction}
          />

          <SceneOverlayLinks
            debugHotspots={debugHotspots}
            devBorders={devBorders}
            getActionHref={getActionHref}
            landscapeSimulationActive={
              landscapeSimulationActive && resolvedSceneViewport === "desktop"
            }
            onActionClick={onHotspotActionClick}
            onPrimeAction={onPrimeHotspotAction}
            scene={scene}
          />
        </div>
      </div>
    </section>
  );
}
