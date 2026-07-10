import { useMemo } from "react";
import type { Scene, SceneViewport } from "@/lib/scenes";
import { getSceneVideoSource } from "@/lib/scenes";
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
  retainedSceneViewport: SceneViewport | null;
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
  retainedSceneViewport,
  resolvedSceneViewport,
  scene,
  sceneViewport,
  setVideoElement,
  videoAudioActive,
  videoAudioEnabled,
}: SceneVideoLayersProps) {
  const videoRefCallbacks = useMemo(
    () => ({
      desktop: (element: HTMLVideoElement | null) =>
        setVideoElement("desktop", element),
      mobile: (element: HTMLVideoElement | null) =>
        setVideoElement("mobile", element),
    }),
    [setVideoElement],
  );

  if (!sceneViewport) {
    return null;
  }

  // Keep one playing pipeline in steady state. During an orientation/viewport
  // change, preserve the replaced element briefly (paused and muted) so a
  // quick rotation bounce can reuse its decoded range instead of redownloading.
  const mountedViewports = Array.from(
    new Set<SceneViewport>(
      [resolvedSceneViewport, sceneViewport, retainedSceneViewport].filter(
        (viewport): viewport is SceneViewport => viewport !== null,
      ),
    ),
  );

  return (
    <>
      {mountedViewports.map((viewport) => {
        const videoSource = getSceneVideoSource(scene, viewport);
        const isVisible = viewport === resolvedSceneViewport;
        const containsSimulatedLandscape =
          landscapeSimulationActive && viewport === "desktop";

        return (
          <video
            key={`${scene.slug}:${viewport}:embedded-audio`}
            ref={videoRefCallbacks[viewport]}
            className={classNames(
              "absolute inset-0 z-0 h-full w-full bg-transparent",
              containsSimulatedLandscape ? "object-contain" : "object-cover",
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
