"use client";

import {
  useEffect,
  useMemo,
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

export type FrameDemoId = "green-room" | "home";

type DemoSource = {
  key: "green-landscape" | "green-portrait" | "home-landscape";
  spec: VideoFrameSpec;
  src: string;
};

const GREEN_ROOM_SWITCH_ASPECT = 0.75;

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
  if (demo === "home") {
    return HOME_SOURCE;
  }

  return viewportAspect <= GREEN_ROOM_SWITCH_ASPECT
    ? GREEN_PORTRAIT_SOURCE
    : GREEN_LANDSCAPE_SOURCE;
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

export function FrameDemo({ demo }: { demo: FrameDemoId }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playbackTimeRef = useRef(0);
  const sourceKeyRef = useRef<DemoSource["key"]>(HOME_SOURCE.key);
  const [viewportAspect, setViewportAspect] = useState(16 / 9);
  const source = getSource(demo, viewportAspect);

  const visibleRect = useMemo(
    () =>
      getVisibleSourceRect(
        source.spec.videoWidth,
        source.spec.videoHeight,
        viewportAspect,
      ),
    [source.spec, viewportAspect],
  );
  const safeZoneVisible = containsRect(visibleRect, source.spec.safeRect);

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

        setViewportAspect(nextAspect);
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

  return (
    <main
      aria-label={`${demo === "home" ? "Home" : "Green Room"} responsive video safe-zone demo`}
      className="fixed inset-0 overflow-hidden bg-black"
      data-demo={demo}
      data-safe-zone-visible={String(safeZoneVisible)}
      data-source={source.key}
    >
      <video
        key={source.key}
        ref={videoRef}
        aria-label={`${demo === "home" ? "Home" : "Green Room"} video`}
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
          safeZoneVisible ? "border-amber-300" : "border-red-400"
        }`}
        data-safe-zone="true"
        style={safeRectStyle(source.spec.safeRect, visibleRect)}
      />
    </main>
  );
}
