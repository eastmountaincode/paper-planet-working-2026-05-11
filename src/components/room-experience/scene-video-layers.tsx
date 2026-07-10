import type { Scene, SceneViewport } from "@/lib/scenes";
import { getSceneVideoSource, sceneViewports } from "@/lib/scenes";
import { classNames, devOutline } from "./ui";
import type { VideoPlaybackEvent } from "./use-room-video-controller";

type SceneVideoLayersProps = {
  devBorders: boolean;
  landscapeSimulationActive: boolean;
  onLoadedMetadata: (element: HTMLVideoElement, isVisible: boolean) => void;
  onPlaybackEvent: (
    viewport: SceneViewport,
    element: HTMLVideoElement,
    event: VideoPlaybackEvent,
  ) => void;
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
  landscapeSimulationActive,
  onLoadedMetadata,
  onPlaybackEvent,
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
        const containsSimulatedLandscape =
          landscapeSimulationActive && viewport === "desktop";

        return (
          <video
            key={`${scene.slug}:${viewport}:embedded-audio`}
            ref={(element) => setVideoElement(viewport, element)}
            className={classNames(
              "absolute inset-0 z-0 h-full w-full bg-transparent",
              containsSimulatedLandscape ? "object-contain" : "object-cover",
              isVisible ? "opacity-100" : "opacity-0",
              devOutline(devBorders, 4),
            )}
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
            onAbort={(event) =>
              onPlaybackEvent(viewport, event.currentTarget, "abort")
            }
            onEmptied={(event) =>
              onPlaybackEvent(viewport, event.currentTarget, "emptied")
            }
            onEnded={(event) =>
              onPlaybackEvent(viewport, event.currentTarget, "ended")
            }
            onError={(event) =>
              onPlaybackEvent(viewport, event.currentTarget, "error")
            }
            onPause={(event) =>
              onPlaybackEvent(viewport, event.currentTarget, "pause")
            }
            onTimeUpdate={(event) => {
              if (isVisible) {
                onVisibleTimeUpdate(event.currentTarget.currentTime);
              }
            }}
            onLoadedData={() => onVariantReady(viewport)}
            onCanPlay={() => onVariantReady(viewport)}
            onSeeked={() => onVariantReady(viewport)}
            onPlaying={(event) => {
              onPlaybackEvent(viewport, event.currentTarget, "playing");
              onVariantReady(viewport);
            }}
            onStalled={(event) =>
              onPlaybackEvent(viewport, event.currentTarget, "stalled")
            }
            onSuspend={(event) =>
              onPlaybackEvent(viewport, event.currentTarget, "suspend")
            }
            onWaiting={(event) =>
              onPlaybackEvent(viewport, event.currentTarget, "waiting")
            }
          />
        );
      })}
    </>
  );
}
