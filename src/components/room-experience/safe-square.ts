import type { SceneVideoSource } from "@/lib/scenes";

export const DEFAULT_SAFE_SQUARE_SHORT_SIDE_RATIO = 0.8;
export const MAX_SAFE_SQUARE_SHORT_SIDE_RATIO = 0.95;
export const MIN_SAFE_SQUARE_SHORT_SIDE_RATIO = 0.7;
export const MOBILE_SCENE_VIEWPORT_MAX_ASPECT = 0.75;

export type SafeSquareMetrics = {
  heightPixels: number;
  heightPercent: number;
  horizontalMarginPixels: number;
  maxAspect: number;
  minAspect: number;
  mode: "portrait-safe-area" | "square";
  shortSideRatio: number;
  sidePixels: number;
  sourceHeight: number;
  sourceWidth: number;
  verticalMarginPixels: number;
  widthPixels: number;
  widthPercent: number;
  xPercent: number;
  yPercent: number;
};

export function clampSafeSquareRatio(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_SAFE_SQUARE_SHORT_SIDE_RATIO;
  }

  return Math.min(
    MAX_SAFE_SQUARE_SHORT_SIDE_RATIO,
    Math.max(MIN_SAFE_SQUARE_SHORT_SIDE_RATIO, value),
  );
}

export function getSafeSquareMetrics(
  videoSource: Pick<SceneVideoSource, "height" | "width">,
  shortSideRatio = DEFAULT_SAFE_SQUARE_SHORT_SIDE_RATIO,
): SafeSquareMetrics {
  const clampedRatio = clampSafeSquareRatio(shortSideRatio);
  const isPortrait = videoSource.height > videoSource.width;

  if (isPortrait) {
    const sourceAspect = videoSource.width / videoSource.height;
    const widthPixels = Math.round(videoSource.width * clampedRatio);
    const heightRatio = Math.min(
      1,
      sourceAspect / MOBILE_SCENE_VIEWPORT_MAX_ASPECT,
    );
    const heightPixels = Math.round(videoSource.height * heightRatio);
    const horizontalMarginPixels = Math.round(
      (videoSource.width - widthPixels) / 2,
    );
    const verticalMarginPixels = Math.round(
      (videoSource.height - heightPixels) / 2,
    );

    return {
      heightPixels,
      heightPercent: (heightPixels / videoSource.height) * 100,
      horizontalMarginPixels,
      maxAspect: MOBILE_SCENE_VIEWPORT_MAX_ASPECT,
      minAspect: widthPixels / videoSource.height,
      mode: "portrait-safe-area",
      shortSideRatio: clampedRatio,
      sidePixels: Math.min(widthPixels, heightPixels),
      sourceHeight: videoSource.height,
      sourceWidth: videoSource.width,
      verticalMarginPixels,
      widthPixels,
      widthPercent: (widthPixels / videoSource.width) * 100,
      xPercent: (horizontalMarginPixels / videoSource.width) * 100,
      yPercent: (verticalMarginPixels / videoSource.height) * 100,
    };
  }

  const sidePixels = Math.round(
    Math.min(videoSource.width, videoSource.height) * clampedRatio,
  );
  const horizontalMarginPixels = Math.round(
    (videoSource.width - sidePixels) / 2,
  );
  const verticalMarginPixels = Math.round(
    (videoSource.height - sidePixels) / 2,
  );

  return {
    heightPixels: sidePixels,
    heightPercent: (sidePixels / videoSource.height) * 100,
    horizontalMarginPixels,
    maxAspect: videoSource.width / sidePixels,
    minAspect: sidePixels / videoSource.height,
    mode: "square",
    shortSideRatio: clampedRatio,
    sidePixels,
    sourceHeight: videoSource.height,
    sourceWidth: videoSource.width,
    verticalMarginPixels,
    widthPixels: sidePixels,
    widthPercent: (sidePixels / videoSource.width) * 100,
    xPercent: (horizontalMarginPixels / videoSource.width) * 100,
    yPercent: (verticalMarginPixels / videoSource.height) * 100,
  };
}

export function formatAspect(value: number) {
  return value.toFixed(2).replace(/\.?0+$/, "");
}

export function formatSafeSquareRatio(value: number) {
  return `${Math.round(clampSafeSquareRatio(value) * 100)}%`;
}
