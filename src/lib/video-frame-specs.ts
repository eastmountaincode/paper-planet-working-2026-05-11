export type VideoFrameSpecKey =
  | "single-source"
  | "portrait-export"
  | "landscape-export";

export type SourceRect = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export type VideoFrameSpec = {
  description: string;
  key: VideoFrameSpecKey;
  label: string;
  maxViewportAspect: number;
  minViewportAspect: number;
  safeRect: SourceRect;
  videoHeight: number;
  videoWidth: number;
};

export const VIDEO_FRAME_SPECS: Record<VideoFrameSpecKey, VideoFrameSpec> = {
  "single-source": {
    description:
      "One centered source for every screen. Ambient action can extend outside the square, but all essential content stays inside it.",
    key: "single-source",
    label: "One video",
    minViewportAspect: 0.46,
    maxViewportAspect: 2,
    videoWidth: 1728,
    videoHeight: 1920,
    safeRect: {
      x: 432,
      y: 528,
      width: 864,
      height: 864,
    },
  },
  "portrait-export": {
    description:
      "The existing tall export. It preserves a larger vertical interaction area on phones.",
    key: "portrait-export",
    label: "Portrait export",
    minViewportAspect: 0.46,
    maxViewportAspect: 0.75,
    videoWidth: 1080,
    videoHeight: 1920,
    safeRect: {
      x: 108,
      y: 240,
      width: 864,
      height: 1440,
    },
  },
  "landscape-export": {
    description:
      "The existing wide export. Its 864-pixel square is fully protected from aspect ratio 0.80 through 2.00.",
    key: "landscape-export",
    label: "Landscape export",
    minViewportAspect: 0.8,
    maxViewportAspect: 2,
    videoWidth: 1728,
    videoHeight: 1080,
    safeRect: {
      x: 432,
      y: 108,
      width: 864,
      height: 864,
    },
  },
};

export const VIEWPORT_PRESETS = [
  { aspect: 0.46, label: "Tall phone", detail: "0.46" },
  { aspect: 9 / 16, label: "Phone", detail: "9:16" },
  { aspect: 0.75, label: "Switch point", detail: "3:4" },
  { aspect: 1, label: "Square", detail: "1:1" },
  { aspect: 16 / 10, label: "Laptop", detail: "16:10" },
  { aspect: 2, label: "Wide limit", detail: "2:1" },
] as const;

export function getVisibleSourceRect(
  sourceWidth: number,
  sourceHeight: number,
  viewportAspect: number,
): SourceRect {
  const safeSourceWidth = Math.max(sourceWidth, 1);
  const safeSourceHeight = Math.max(sourceHeight, 1);
  const safeViewportAspect = Math.max(viewportAspect, 0.01);
  const sourceAspect = safeSourceWidth / safeSourceHeight;

  if (safeViewportAspect < sourceAspect) {
    const width = safeSourceHeight * safeViewportAspect;

    return {
      x: (safeSourceWidth - width) / 2,
      y: 0,
      width,
      height: safeSourceHeight,
    };
  }

  const height = safeSourceWidth / safeViewportAspect;

  return {
    x: 0,
    y: (safeSourceHeight - height) / 2,
    width: safeSourceWidth,
    height,
  };
}

export function scaleSpecRect(
  rect: SourceRect,
  spec: VideoFrameSpec,
  sourceWidth: number,
  sourceHeight: number,
): SourceRect {
  return {
    x: (rect.x / spec.videoWidth) * sourceWidth,
    y: (rect.y / spec.videoHeight) * sourceHeight,
    width: (rect.width / spec.videoWidth) * sourceWidth,
    height: (rect.height / spec.videoHeight) * sourceHeight,
  };
}

export function containsRect(container: SourceRect, child: SourceRect) {
  const epsilon = 0.01;

  return (
    child.x >= container.x - epsilon &&
    child.y >= container.y - epsilon &&
    child.x + child.width <= container.x + container.width + epsilon &&
    child.y + child.height <= container.y + container.height + epsilon
  );
}

export function getSpecMargins(spec: VideoFrameSpec) {
  return {
    bottom: spec.videoHeight - spec.safeRect.y - spec.safeRect.height,
    left: spec.safeRect.x,
    right: spec.videoWidth - spec.safeRect.x - spec.safeRect.width,
    top: spec.safeRect.y,
  };
}

export function formatAspect(aspect: number) {
  return aspect.toFixed(2).replace(/\.00$/, "");
}

export function formatPixels(value: number) {
  return Math.round(value).toLocaleString("en-US");
}
