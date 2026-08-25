"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type SyntheticEvent,
} from "react";
import {
  containsRect,
  getVisibleSourceRect,
  VIDEO_FRAME_SPECS,
  type SourceRect,
  type VideoFrameSpec,
} from "@/lib/video-frame-specs";

export type FrameDemoId = "full-bleed" | "green-room" | "home";

type DemoSource = {
  key: "green-landscape" | "green-portrait" | "home-landscape";
  spec: VideoFrameSpec;
  src: string;
};

const GREEN_ROOM_SWITCH_ASPECT = 0.75;
const MIN_SUPPORTED_ASPECT = 0.46;
const MIN_SUPPORTED_WIDTH = 320;
const MAX_SUPPORTED_ASPECT = 2;

const HOME_SOURCE: DemoSource = {
  key: "home-landscape",
  spec: VIDEO_FRAME_SPECS["landscape-export"],
  src: "/api/tools/frame-demo/home-landscape",
};

const GREEN_LANDSCAPE_SOURCE: DemoSource = {
  key: "green-landscape",
  spec: VIDEO_FRAME_SPECS["landscape-export"],
  src: "/api/tools/frame-demo/green-landscape",
};

const GREEN_PORTRAIT_SOURCE: DemoSource = {
  key: "green-portrait",
  spec: VIDEO_FRAME_SPECS["portrait-export"],
  src: "/api/tools/frame-demo/green-portrait",
};

function getSource(demo: FrameDemoId, viewportAspect: number) {
  if (demo === "home" || demo === "full-bleed") {
    return HOME_SOURCE;
  }

  return viewportAspect <= GREEN_ROOM_SWITCH_ASPECT
    ? GREEN_PORTRAIT_SOURCE
    : GREEN_LANDSCAPE_SOURCE;
}

function getDemoLabel(demo: FrameDemoId) {
  if (demo === "green-room") {
    return "Green Room";
  }

  if (demo === "full-bleed") {
    return "Single-video full-bleed";
  }

  return "Home";
}

function percent(value: number, total: number) {
  return `${(value / Math.max(total, 1)) * 100}%`;
}

function safeRectStyle(
  safeRect: SourceRect,
  visibleRect: SourceRect,
): CSSProperties {
  return {
    left: percent(safeRect.x - visibleRect.x, visibleRect.width),
    top: percent(safeRect.y - visibleRect.y, visibleRect.height),
    width: percent(safeRect.width, visibleRect.width),
    height: percent(safeRect.height, visibleRect.height),
  };
}

function getFullBleedSafeRect(
  visibleRect: SourceRect,
  source: DemoSource,
) {
  return {
    height: source.spec.safeRect.height,
    width: visibleRect.width,
    x: visibleRect.x,
    y: source.spec.safeRect.y,
  } satisfies SourceRect;
}

function getMinimumSafeRect(source: DemoSource) {
  const width = Math.min(
    source.spec.safeRect.width,
    source.spec.videoHeight * MIN_SUPPORTED_ASPECT,
  );

  return {
    height: source.spec.safeRect.height,
    width,
    x: (source.spec.videoWidth - width) / 2,
    y: source.spec.safeRect.y,
  } satisfies SourceRect;
}

export function FrameDemo({ demo }: { demo: FrameDemoId }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playbackTimeRef = useRef(0);
  const sourceKeyRef = useRef<DemoSource["key"]>(HOME_SOURCE.key);
  const [viewport, setViewport] = useState({ height: 900, width: 1600 });
  const viewportAspect = viewport.width / viewport.height;
  const source = getSource(demo, viewportAspect);
  const isSupported =
    demo !== "full-bleed" ||
    (viewport.width >= MIN_SUPPORTED_WIDTH &&
      viewportAspect >= MIN_SUPPORTED_ASPECT &&
      viewportAspect <= MAX_SUPPORTED_ASPECT);
  const visibleRect = getVisibleSourceRect(
    source.spec.videoWidth,
    source.spec.videoHeight,
    viewportAspect,
  );
  const safeRect =
    demo === "full-bleed"
      ? getFullBleedSafeRect(visibleRect, source)
      : source.spec.safeRect;
  const minimumSafeRect =
    demo === "full-bleed" ? getMinimumSafeRect(source) : null;
  const safeZoneVisible = containsRect(visibleRect, safeRect);

  useEffect(() => {
    sourceKeyRef.current = getSource(demo, 16 / 9).key;

    let animationFrame = 0;
    const measureViewport = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        const nextAspect = window.innerWidth / Math.max(window.innerHeight, 1);
        const nextSource = getSource(demo, nextAspect);

        if (nextSource.key !== sourceKeyRef.current) {
          const currentTime = videoRef.current?.currentTime;

          if (Number.isFinite(currentTime)) {
            playbackTimeRef.current = currentTime ?? 0;
          }

          sourceKeyRef.current = nextSource.key;
        }

        setViewport({ height: window.innerHeight, width: window.innerWidth });
      });
    };

    measureViewport();
    window.addEventListener("resize", measureViewport);
    window.addEventListener("orientationchange", measureViewport);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", measureViewport);
      window.removeEventListener("orientationchange", measureViewport);
    };
  }, [demo]);

  const resumePlayback = (event: SyntheticEvent<HTMLVideoElement>) => {
    const video = event.currentTarget;
    const savedTime = playbackTimeRef.current;

    if (savedTime > 0 && Number.isFinite(video.duration)) {
      video.currentTime = Math.min(savedTime, Math.max(video.duration - 0.05, 0));
    }

    void video.play().catch(() => {
      // The demo is muted, so modern browsers permit autoplay. If a browser
      // still blocks it, the first user interaction will let native playback
      // policy resume it without adding visible controls to the demo.
    });
  };

  const demoLabel = getDemoLabel(demo);

  return (
    <main
      aria-label={`${demoLabel} responsive video safe-zone demo`}
      className="fixed inset-0 overflow-hidden bg-black"
      data-demo={demo}
      data-layout-mode={
        demo === "full-bleed"
          ? "viewport-width-safe-zone"
          : "fixed-safe-zone"
      }
      data-safe-zone-visible={String(safeZoneVisible)}
      data-safe-zone-source-height={String(Math.round(safeRect.height))}
      data-safe-zone-source-width={String(Math.round(safeRect.width))}
      data-source={source.key}
      data-supported={String(isSupported)}
    >
      <video
        key={source.key}
        ref={videoRef}
        aria-label={`${demoLabel} video`}
        autoPlay
        className="absolute inset-0 size-full object-cover"
        loop
        muted
        playsInline
        preload="auto"
        src={source.src}
        onLoadedMetadata={resumePlayback}
        onTimeUpdate={(event) => {
          playbackTimeRef.current = event.currentTarget.currentTime;
        }}
      />

      <div
        aria-hidden="true"
        className={`pointer-events-none absolute border-2 bg-amber-300/8 shadow-[inset_0_0_0_1px_rgba(69,26,3,0.7)] ${
          safeZoneVisible && isSupported
            ? "border-amber-300"
            : "border-red-400"
        }`}
        data-safe-zone="true"
        style={safeRectStyle(safeRect, visibleRect)}
      >
        {demo === "full-bleed" ? (
          <span className="absolute left-2 top-2 whitespace-nowrap bg-slate-950/75 px-2 py-1 font-mono text-[10px] text-amber-100 backdrop-blur-sm">
            {Math.round(safeRect.width)} × {Math.round(safeRect.height)}
          </span>
        ) : null}
      </div>

      {minimumSafeRect ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute border-x-2 border-dashed border-cyan-300 bg-cyan-300/5"
          data-minimum-safe-zone="true"
          data-source-height={String(Math.round(minimumSafeRect.height))}
          data-source-width={String(Math.round(minimumSafeRect.width))}
          style={safeRectStyle(minimumSafeRect, visibleRect)}
        >
          <span className="absolute right-2 top-2 whitespace-nowrap bg-slate-950/75 px-2 py-1 font-mono text-[10px] text-cyan-100 backdrop-blur-sm">
            {Math.round(minimumSafeRect.width)} ×{" "}
            {Math.round(minimumSafeRect.height)}
          </span>
        </div>
      ) : null}
    </main>
  );
}
