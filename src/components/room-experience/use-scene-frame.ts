import {
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Hotspot, Scene, SceneViewport } from "@/lib/scenes";
import { getSceneVideoSource, type SceneVideoSource } from "@/lib/scenes";
import {
  projectHotspotToSimulatedLandscape,
  SIMULATED_LANDSCAPE_LABEL,
  SIMULATED_LANDSCAPE_VIDEO_SOURCE,
} from "./landscape-simulation";
import { getSafeSquareMetrics } from "./safe-square";

function getHotspotZIndex(hotspot: Hotspot) {
  return hotspot.zIndex ?? 0;
}

function sortHotspotsByZOrder(hotspots: Hotspot[]) {
  return [...hotspots].sort(
    (a, b) => getHotspotZIndex(a) - getHotspotZIndex(b),
  );
}

function formatCssNumber(value: number) {
  return value.toFixed(6).replace(/\.?0+$/, "");
}

function getViewportSize() {
  if (typeof window === "undefined") {
    return null;
  }

  return {
    height: window.innerHeight,
    width: window.innerWidth,
  };
}

function getActiveVideoSource(
  scene: Scene,
  viewport: SceneViewport,
  simulateLandscapeVideo: boolean,
): SceneVideoSource {
  const source = getSceneVideoSource(scene, viewport);

  if (!simulateLandscapeVideo || viewport !== "desktop") {
    return source;
  }

  return {
    ...source,
    height: SIMULATED_LANDSCAPE_VIDEO_SOURCE.height,
    sourceFile: `simulated-${SIMULATED_LANDSCAPE_LABEL}-from-${source.sourceFile}`,
    width: SIMULATED_LANDSCAPE_VIDEO_SOURCE.width,
  };
}

export function useSceneFrame(
  scene: Scene,
  sceneViewport: SceneViewport | null,
  visibleSceneViewport: SceneViewport | null,
  fullBleedPreview: boolean,
  safeSquareRatio: number,
  simulateLandscapeVideo: boolean,
) {
  const [viewportSize, setViewportSize] = useState<ReturnType<
    typeof getViewportSize
  >>(null);
  const resolvedSceneViewport =
    visibleSceneViewport ?? sceneViewport ?? "desktop";
  const activeVideoSource = useMemo(
    () =>
      getActiveVideoSource(
        scene,
        resolvedSceneViewport,
        simulateLandscapeVideo,
      ),
    [resolvedSceneViewport, scene, simulateLandscapeVideo],
  );
  const activeHotspots =
    scene.hotspotVariants?.[resolvedSceneViewport] ?? scene.hotspots;
  const shouldProjectSquareContent =
    simulateLandscapeVideo && resolvedSceneViewport === "desktop";
  const orderedHotspots = useMemo(
    () =>
      sortHotspotsByZOrder(
        shouldProjectSquareContent
          ? activeHotspots.map(projectHotspotToSimulatedLandscape)
          : activeHotspots,
      ),
    [activeHotspots, shouldProjectSquareContent],
  );
  useEffect(() => {
    const updateViewportSize = () => {
      setViewportSize(getViewportSize());
    };

    updateViewportSize();
    window.addEventListener("resize", updateViewportSize);
    window.addEventListener("orientationchange", updateViewportSize);

    return () => {
      window.removeEventListener("resize", updateViewportSize);
      window.removeEventListener("orientationchange", updateViewportSize);
    };
  }, []);
  const aspectRatio = useMemo(
    () => `${activeVideoSource.width} / ${activeVideoSource.height}`,
    [activeVideoSource.height, activeVideoSource.width],
  );
  const stageFrameStyle = useMemo(
    () => {
      const sourceRatio = activeVideoSource.width / activeVideoSource.height;
      const inverseSourceRatio =
        activeVideoSource.height / activeVideoSource.width;
      const heightFromViewportWidth = `${formatCssNumber(
        inverseSourceRatio * 100,
      )}vw`;
      const widthFromViewportHeight = `${formatCssNumber(
        sourceRatio * 100,
      )}dvh`;

      if (fullBleedPreview && viewportSize) {
        const viewportRatio = viewportSize.width / viewportSize.height;
        const stageWidth =
          viewportRatio > sourceRatio
            ? viewportSize.width
            : viewportSize.height * sourceRatio;
        const stageHeight =
          viewportRatio > sourceRatio
            ? viewportSize.width / sourceRatio
            : viewportSize.height;

        return {
          aspectRatio,
          height: `${stageHeight}px`,
          maxWidth: "none",
          width: `${stageWidth}px`,
        };
      }

      if (fullBleedPreview) {
        return {
          aspectRatio,
          height: "100dvh",
          maxWidth: "none",
          width: "100vw",
        };
      }

      if (resolvedSceneViewport === "mobile") {
        return {
          aspectRatio,
          height: `min(100dvh, ${heightFromViewportWidth})`,
          maxWidth: "none",
          width: `min(100vw, ${widthFromViewportHeight})`,
        };
      }

      return {
        aspectRatio,
        maxWidth: `min(100%, calc(${widthFromViewportHeight} - ${formatCssNumber(
          sourceRatio * 2.5,
        )}rem))`,
      };
    },
    [
      activeVideoSource.height,
      activeVideoSource.width,
      aspectRatio,
      fullBleedPreview,
      resolvedSceneViewport,
      viewportSize,
    ],
  );
  const safeSquareMetrics = useMemo(
    () => getSafeSquareMetrics(activeVideoSource, safeSquareRatio),
    [activeVideoSource, safeSquareRatio],
  );

  return {
    activeVideoSource,
    orderedHotspots,
    resolvedSceneViewport,
    safeSquareMetrics,
    stageFrameStyle,
    viewportSize,
  };
}
