import type { Scene, SceneViewport } from "@/lib/scenes";
import { getSceneVideoSource, sceneViewports } from "@/lib/scenes";
import { classNames, devOutline } from "./ui";

type SceneVideoLayersProps = {
  devBorders: boolean;
  onLoadedMetadata: (element: HTMLVideoElement, isVisible: boolean) => void;
  onVariantReady: (viewport: SceneViewport) => void;
  onVisibleTimeUpdate: (timeSeconds: number) => void;
  resolvedSceneViewport: SceneViewport;
  scene: Scene;
  sceneViewport: SceneViewport | null;
  setVideoElement: (
    viewport: SceneViewport,
    element: HTMLVideoElement | null,
  ) => void;
  videoAudioActive: boolean;
  videoAudioEnabled: boolean;
};

export function SceneVideoLayers({
  devBorders,
  onLoadedMetadata,
  onVariantReady,
  onVisibleTimeUpdate,
  resolvedSceneViewport,
  scene,
  sceneViewport,
  setVideoElement,
  videoAudioActive,
  videoAudioEnabled,
}: SceneVideoLayersProps) {
  if (!sceneViewport) {
    return null;
  }

  return (
    <>
      {sceneViewports.map((viewport) => {
        const videoSource = getSceneVideoSource(scene, viewport);
        const isVisible = viewport === resolvedSceneViewport;

        return (
          <video
            key={`${scene.slug}:${viewport}:embedded-audio`}
            ref={(element) => setVideoElement(viewport, element)}
            className={classNames(
              "absolute inset-0 z-0 h-full w-full object-cover",
              isVisible ? "opacity-100" : "opacity-0",
              devOutline(devBorders, 4),
            )}
            crossOrigin="anonymous"
            src={videoSource.src}
            autoPlay={isVisible}
            muted={!isVisible || !videoAudioActive || !videoAudioEnabled}
            loop
            playsInline
            preload={isVisible ? "auto" : "metadata"}
            aria-hidden={!isVisible}
            aria-label={isVisible ? `${scene.title} room video` : undefined}
            onLoadedMetadata={(event) => {
              onLoadedMetadata(event.currentTarget, isVisible);
            }}
            onTimeUpdate={(event) => {
              if (isVisible) {
                onVisibleTimeUpdate(event.currentTarget.currentTime);
              }
            }}
            onLoadedData={() => onVariantReady(viewport)}
            onCanPlay={() => onVariantReady(viewport)}
            onSeeked={() => onVariantReady(viewport)}
            onPlaying={() => onVariantReady(viewport)}
          />
        );
      })}
    </>
  );
}
