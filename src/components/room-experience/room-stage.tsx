import type { CSSProperties, MouseEvent, PointerEvent, Ref } from "react";
import type { Hotspot, Scene, SceneViewport } from "@/lib/scenes";
import { HotspotLayer } from "./hotspot-layer";
import { SceneOverlayLinks } from "./scene-overlay-links";
import { SceneVideoLayers } from "./scene-video-layers";
import { SceneTickerOverlay } from "./ticker-overlay";
import { classNames, devOutline } from "./ui";

type RoomStageProps = {
  debugHotspots: boolean;
  devBorders: boolean;
  getActionHref: (action: Hotspot["action"]) => string;
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
  getActionHref,
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
  scene,
  sceneViewport,
  setVideoElement,
  stageFrameStyle,
  stageRef,
  stageTransformStyle,
  videoAudioActive,
  videoAudioEnabled,
}: RoomStageProps) {
  return (
    <section
      className={classNames(
        "flex h-dvh touch-none justify-center overflow-hidden",
        resolvedSceneViewport === "mobile" ? "p-0" : "p-3 sm:p-5",
        "items-center",
        devOutline(devBorders, 1),
      )}
    >
      <div
        ref={stageRef}
        className={classNames(
          "relative w-full touch-none overflow-hidden bg-black",
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
          <SceneVideoLayers
            devBorders={devBorders}
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
            onActionClick={onHotspotActionClick}
            onPrimeAction={onPrimeHotspotAction}
            scene={scene}
          />
        </div>
      </div>
    </section>
  );
}
