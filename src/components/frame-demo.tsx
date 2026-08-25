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
  poster?: string;
  spec: VideoFrameSpec;
  src: string;
};

const GREEN_ROOM_SWITCH_ASPECT = 0.75;
const MIN_SUPPORTED_ASPECT = 0.46;
const MIN_SUPPORTED_WIDTH = 320;
const MAX_SUPPORTED_ASPECT = 2;
const PAN_MAX_VIEWPORT_WIDTH = 768;

const HOME_SOURCE: DemoSource = {
  key: "home-landscape",
  poster: "/tools/frame-demo/home-landscape-poster.webp",
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

function centerPanSurface(panSurface: HTMLDivElement | null) {
  if (!panSurface) {
    return;
  }

  panSurface.scrollLeft =
    (panSurface.scrollWidth - panSurface.clientWidth) / 2;
}

export function FrameDemo({ demo }: { demo: FrameDemoId }) {
  const frameRef = useRef<HTMLElement>(null);
  const panRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playbackTimeRef = useRef(0);
  const sourceKeyRef = useRef<DemoSource["key"]>(HOME_SOURCE.key);
  const [viewport, setViewport] = useState({
    height: 900,
    width: 1600,
  });
  const viewportAspect = viewport.width / viewport.height;
  const source = getSource(demo, viewportAspect);
  const sourceAspect = source.spec.videoWidth / source.spec.videoHeight;
  const isPanEnabled =
    demo === "full-bleed" &&
    viewport.width <= PAN_MAX_VIEWPORT_WIDTH &&
    viewportAspect < sourceAspect;
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
    demo === "full-bleed" ? visibleRect : source.spec.safeRect;
  const safeZoneVisible = containsRect(visibleRect, safeRect);

  useEffect(() => {
    sourceKeyRef.current = getSource(demo, 16 / 9).key;

    let animationFrame = 0;
    const measureViewport = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        const frame = frameRef.current?.getBoundingClientRect();
        const width = frame?.width ?? window.innerWidth;
        const height = frame?.height ?? window.innerHeight;
        const nextAspect = width / Math.max(height, 1);
        const nextSource = getSource(demo, nextAspect);

        if (nextSource.key !== sourceKeyRef.current) {
          const currentTime = videoRef.current?.currentTime;

          if (Number.isFinite(currentTime)) {
            playbackTimeRef.current = currentTime ?? 0;
          }

          sourceKeyRef.current = nextSource.key;
        }

        setViewport((current) => {
          if (current.height === height && current.width === width) {
            return current;
          }

          return { height, width };
        });
      });
    };

    measureViewport();
    const resizeObserver = new ResizeObserver(measureViewport);

    if (frameRef.current) {
      resizeObserver.observe(frameRef.current);
    }

    window.addEventListener("resize", measureViewport);
    window.addEventListener("orientationchange", measureViewport);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", measureViewport);
      window.removeEventListener("orientationchange", measureViewport);
    };
  }, [demo]);

  useEffect(() => {
    if (!isPanEnabled) {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      centerPanSurface(panRef.current);
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [isPanEnabled, source.key]);

  const resumePlayback = (event: SyntheticEvent<HTMLVideoElement>) => {
    const video = event.currentTarget;
    const savedTime = playbackTimeRef.current;

    if (savedTime > 0 && Number.isFinite(video.duration)) {
      video.currentTime = Math.min(savedTime, Math.max(video.duration - 0.05, 0));
    }

    if (isPanEnabled) {
      window.requestAnimationFrame(() => {
        centerPanSurface(panRef.current);
      });
    }

    void video.play().catch(() => {
      // The demo is muted, so modern browsers permit autoplay. If a browser
      // still blocks it, the first user interaction will let native playback
      // policy resume it without adding visible controls to the demo.
    });
  };

  const demoLabel = getDemoLabel(demo);

  return (
    <>
      <main
        ref={frameRef}
        aria-label={`${demoLabel} responsive video safe-zone demo`}
        className={
          demo === "full-bleed"
            ? "frame-demo-full-bleed-stage relative w-full overflow-hidden"
            : "frame-demo-full-height fixed left-0 top-0 w-screen overflow-hidden bg-black"
        }
        data-demo={demo}
        data-layout-mode={
          demo === "full-bleed"
            ? "visible-source-frame"
            : "fixed-safe-zone"
        }
        data-pan-enabled={String(isPanEnabled)}
        data-viewport-height="dynamic"
        data-safe-zone-visible={String(safeZoneVisible)}
        data-safe-zone-source-height={String(Math.round(safeRect.height))}
        data-safe-zone-source-width={String(Math.round(safeRect.width))}
        data-source={source.key}
        data-supported={String(isSupported)}
      >
        <div
          ref={panRef}
          aria-label={isPanEnabled ? "Scrollable video panorama" : undefined}
          className={`absolute inset-0 bg-black focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-cyan-300 ${
            isPanEnabled
              ? "touch-pan-x overflow-x-auto overflow-y-hidden overscroll-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              : "overflow-hidden"
          }`}
          data-pan-surface="true"
          role={isPanEnabled ? "region" : undefined}
          tabIndex={isPanEnabled ? 0 : undefined}
        >
          <video
            key={source.key}
            ref={videoRef}
            aria-label={`${demoLabel} video`}
            autoPlay
            className={
              isPanEnabled
                ? "pointer-events-none block h-full w-auto max-w-none select-none object-contain"
                : "pointer-events-none absolute inset-0 size-full select-none object-cover"
            }
            draggable={false}
            loop
            muted
            playsInline
            poster={source.poster}
            preload="auto"
            src={source.src}
            onLoadedMetadata={resumePlayback}
            onTimeUpdate={(event) => {
              playbackTimeRef.current = event.currentTarget.currentTime;
            }}
          />
        </div>

        {demo !== "full-bleed" ? (
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute border-2 bg-amber-300/8 shadow-[inset_0_0_0_1px_rgba(69,26,3,0.7)] ${
              safeZoneVisible && isSupported
                ? "border-amber-300"
                : "border-red-400"
            }`}
            data-safe-zone="true"
            style={safeRectStyle(safeRect, visibleRect)}
          />
        ) : null}
      </main>
    </>
  );
}
