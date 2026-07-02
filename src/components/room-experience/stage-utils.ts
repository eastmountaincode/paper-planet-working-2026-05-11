import {
  DEFAULT_STAGE_TRANSFORM,
  MAX_STAGE_SCALE,
  WHEEL_LINE_PIXELS,
} from "./constants";
import type { StagePointer, StageTransform } from "./types";

export function wait(milliseconds: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function getPointerDistance(first: StagePointer, second: StagePointer) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

export function getPointerCenter(first: StagePointer, second: StagePointer) {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };
}

export function clampStageTransform(
  transform: StageTransform,
  rect: DOMRect | null,
): StageTransform {
  const scale = clamp(transform.scale, 1, MAX_STAGE_SCALE);

  if (!rect || scale <= 1.001) {
    return DEFAULT_STAGE_TRANSFORM;
  }

  const maxX = (rect.width * (scale - 1)) / 2;
  const maxY = (rect.height * (scale - 1)) / 2;

  return {
    scale,
    x: clamp(transform.x, -maxX, maxX),
    y: clamp(transform.y, -maxY, maxY),
  };
}

export function getStageZoomTransform(
  startTransform: StageTransform,
  startPoint: StagePointer,
  currentPoint: StagePointer,
  nextScale: number,
): StageTransform {
  const scale = clamp(nextScale, 1, MAX_STAGE_SCALE);
  const startScale = startTransform.scale || 1;
  const contentX = (startPoint.x - startTransform.x) / startScale;
  const contentY = (startPoint.y - startTransform.y) / startScale;

  return {
    scale,
    x: currentPoint.x - contentX * scale,
    y: currentPoint.y - contentY * scale,
  };
}

export function getNormalizedWheelDelta(event: WheelEvent) {
  const multiplier =
    event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? WHEEL_LINE_PIXELS
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? window.innerHeight
        : 1;

  return {
    x: event.deltaX * multiplier,
    y: event.deltaY * multiplier,
  };
}
