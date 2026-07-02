import { useMemo } from "react";
import type { Hotspot, Scene, SceneViewport } from "@/lib/scenes";
import { getSceneVideoSource } from "@/lib/scenes";

function getHotspotZIndex(hotspot: Hotspot) {
  return hotspot.zIndex ?? 0;
}

function sortHotspotsByZOrder(hotspots: Hotspot[]) {
  return [...hotspots].sort(
    (a, b) => getHotspotZIndex(a) - getHotspotZIndex(b),
  );
}

export function useSceneFrame(
  scene: Scene,
  sceneViewport: SceneViewport | null,
  visibleSceneViewport: SceneViewport | null,
) {
  const resolvedSceneViewport =
    visibleSceneViewport ?? sceneViewport ?? "desktop";
  const activeVideoSource = useMemo(
    () => getSceneVideoSource(scene, resolvedSceneViewport),
    [resolvedSceneViewport, scene],
  );
  const activeHotspots =
    scene.hotspotVariants?.[resolvedSceneViewport] ?? scene.hotspots;
  const orderedHotspots = useMemo(
    () => sortHotspotsByZOrder(activeHotspots),
    [activeHotspots],
  );
  const aspectRatio = useMemo(
    () => `${activeVideoSource.width} / ${activeVideoSource.height}`,
    [activeVideoSource.height, activeVideoSource.width],
  );
  const stageFrameStyle = useMemo(
    () => {
      const sourceRatio = activeVideoSource.width / activeVideoSource.height;

      if (resolvedSceneViewport === "mobile") {
        return {
          aspectRatio,
          height: `min(100dvh, calc(100vw / ${sourceRatio}))`,
          maxWidth: "none",
          width: `min(100vw, calc(100dvh * ${sourceRatio}))`,
        };
      }

      return {
        aspectRatio,
        maxWidth: `min(100%, calc((100dvh - 2.5rem) * ${sourceRatio}))`,
      };
    },
    [
      activeVideoSource.height,
      activeVideoSource.width,
      aspectRatio,
      resolvedSceneViewport,
    ],
  );

  return {
    activeVideoSource,
    orderedHotspots,
    resolvedSceneViewport,
    stageFrameStyle,
  };
}
