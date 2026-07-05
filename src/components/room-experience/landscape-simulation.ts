import type { Hotspot, SceneIconOverlay } from "@/lib/scenes";

export const SIMULATED_LANDSCAPE_VIDEO_SOURCE = {
  height: 1080,
  width: 1728,
};

export const SIMULATED_LANDSCAPE_LABEL =
  `${SIMULATED_LANDSCAPE_VIDEO_SOURCE.width}x${SIMULATED_LANDSCAPE_VIDEO_SOURCE.height}`;

export const CENTERED_SOURCE_WIDTH_PERCENT =
  (SIMULATED_LANDSCAPE_VIDEO_SOURCE.height /
    SIMULATED_LANDSCAPE_VIDEO_SOURCE.width) *
  100;
export const CENTERED_SOURCE_X_PERCENT =
  (100 - CENTERED_SOURCE_WIDTH_PERCENT) / 2;
const CENTERED_SOURCE_X_SCALE = CENTERED_SOURCE_WIDTH_PERCENT / 100;

export function projectSquareXToSimulatedLandscape(value: number) {
  return CENTERED_SOURCE_X_PERCENT + value * CENTERED_SOURCE_X_SCALE;
}

export function projectSquareWidthToSimulatedLandscape(value: number) {
  return value * CENTERED_SOURCE_X_SCALE;
}

export function projectHotspotToSimulatedLandscape(hotspot: Hotspot): Hotspot {
  if (hotspot.shape === "rect") {
    return {
      ...hotspot,
      rect: {
        ...hotspot.rect,
        width: projectSquareWidthToSimulatedLandscape(hotspot.rect.width),
        x: projectSquareXToSimulatedLandscape(hotspot.rect.x),
      },
    };
  }

  return {
    ...hotspot,
    points: hotspot.points.map((point) => ({
      ...point,
      x: projectSquareXToSimulatedLandscape(point.x),
    })),
  };
}

export function projectOverlayPositionToSimulatedLandscape(
  position: SceneIconOverlay["position"],
) {
  return {
    ...position,
    width: projectSquareWidthToSimulatedLandscape(position.width),
    x: projectSquareXToSimulatedLandscape(position.x),
  };
}
