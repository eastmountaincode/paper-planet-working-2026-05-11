"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Hotspot, Scene } from "@/lib/scenes";
import { sceneSlugs, scenes } from "@/lib/scenes";

type RoomExperienceProps = {
  scene: Scene;
};

type PointerPosition = {
  x: number;
  y: number;
};

export function RoomExperience({ scene }: RoomExperienceProps) {
  const searchParams = useSearchParams();
  const videoRef = useRef<HTMLVideoElement>(null);
  const debugHotspots =
    searchParams.get("hotspots") === "1" || searchParams.get("debug") === "1";
  const [pointerPosition, setPointerPosition] =
    useState<PointerPosition | null>(null);

  const aspectRatio = useMemo(
    () => `${scene.video.width} / ${scene.video.height}`,
    [scene.video.height, scene.video.width],
  );

  const syncedPlayback = scene.video.sync?.enabled ?? false;

  const getSyncedTime = useMemo(
    () => () => {
      const offset = scene.video.sync?.epochOffsetSeconds ?? 0;
      const duration = scene.video.durationSeconds;

      return (((Date.now() / 1000 + offset) % duration) + duration) % duration;
    },
    [scene.video.durationSeconds, scene.video.sync?.epochOffsetSeconds],
  );

  useEffect(() => {
    if (!syncedPlayback) {
      return;
    }

    const video = videoRef.current;

    if (!video) {
      return;
    }

    const syncVideoTime = () => {
      const expectedTime = getSyncedTime();

      if (
        Number.isFinite(expectedTime) &&
        Math.abs(video.currentTime - expectedTime) > 1.5
      ) {
        video.currentTime = expectedTime;
      }
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        syncVideoTime();
      }
    };

    syncVideoTime();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", syncVideoTime);
    const interval = window.setInterval(syncVideoTime, 30_000);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", syncVideoTime);
      window.clearInterval(interval);
    };
  }, [getSyncedTime, syncedPlayback]);

  function getHotspotHref(hotspot: Hotspot) {
    if (hotspot.action.type === "navigate") {
      return `/rooms/${hotspot.action.target}`;
    }

    const subject = hotspot.action.subject
      ? `?subject=${encodeURIComponent(hotspot.action.subject)}`
      : "";
    return `mailto:${hotspot.action.email}${subject}`;
  }

  function getPolygonPoints(hotspot: Hotspot) {
    return hotspot.shape === "polygon"
      ? hotspot.points.map((point) => `${point.x},${point.y}`).join(" ")
      : "";
  }

  function handleFramePointer(event: React.PointerEvent<HTMLDivElement>) {
    if (!debugHotspots || event.target !== event.currentTarget) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    setPointerPosition({
      x: Number((((event.clientX - rect.left) / rect.width) * 100).toFixed(2)),
      y: Number((((event.clientY - rect.top) / rect.height) * 100).toFixed(2)),
    });
  }

  return (
    <main className="min-h-dvh bg-[#161410] text-[#f5efe2]">
      <div className="mx-auto flex min-h-dvh w-full max-w-[1540px] flex-col px-4 py-4 sm:px-6 lg:px-8">
        <nav className="flex h-12 shrink-0 items-center justify-between gap-4">
          <Link
            href="/rooms/construction"
            className="font-mono text-xs uppercase tracking-[0.24em] text-[#d9c9a3]"
          >
            Paper Planet
          </Link>
          <div className="flex items-center gap-2">
            {sceneSlugs.map((slug) => (
              <Link
                key={slug}
                href={`/rooms/${slug}`}
                aria-current={scene.slug === slug ? "page" : undefined}
                className="rounded-sm border border-[#f5efe2]/15 px-3 py-2 text-xs uppercase text-[#f5efe2]/70 transition hover:border-[#f5efe2]/45 hover:text-[#f5efe2] aria-[current=page]:border-[#d9c9a3] aria-[current=page]:text-[#d9c9a3]"
              >
                {scenes[slug].title}
              </Link>
            ))}
          </div>
        </nav>

        <section className="flex flex-1 items-center justify-center py-4">
          <div
            className="relative w-full max-w-[min(100%,calc(100dvh-6rem))] overflow-hidden bg-black shadow-2xl shadow-black/45"
            style={{ aspectRatio }}
            onPointerDown={handleFramePointer}
          >
            <video
              key={scene.video.src}
              ref={videoRef}
              className="absolute inset-0 z-0 h-full w-full object-cover"
              src={scene.video.src}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              aria-label={`${scene.title} room video`}
              onLoadedMetadata={(event) => {
                if (syncedPlayback) {
                  event.currentTarget.currentTime = getSyncedTime();
                }
              }}
            />

            {scene.hotspots
              .filter((hotspot) => hotspot.shape === "rect")
              .map((hotspot) => (
                <Link
                  key={hotspot.id}
                  href={getHotspotHref(hotspot)}
                  aria-label={hotspot.label}
                  title={debugHotspots ? hotspot.label : undefined}
                  className={[
                    "absolute z-10 cursor-pointer rounded-sm outline-none transition",
                    "focus-visible:ring-2 focus-visible:ring-[#f5efe2] focus-visible:ring-offset-2 focus-visible:ring-offset-black",
                    debugHotspots
                      ? "border border-[#f7d36a] bg-[#f7d36a]/20 hover:bg-[#f7d36a]/30"
                      : "bg-transparent",
                  ].join(" ")}
                  style={{
                    left: `${hotspot.rect.x}%`,
                    top: `${hotspot.rect.y}%`,
                    width: `${hotspot.rect.width}%`,
                    height: `${hotspot.rect.height}%`,
                  }}
                >
                  {debugHotspots ? (
                    <span className="absolute left-1 top-1 rounded-sm bg-black/70 px-1.5 py-1 font-mono text-[10px] uppercase text-[#f7d36a]">
                      {hotspot.id}
                    </span>
                  ) : (
                    <span className="sr-only">{hotspot.label}</span>
                  )}
                </Link>
              ))}

            <svg
              className="pointer-events-none absolute inset-0 z-20 h-full w-full"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden={!debugHotspots}
            >
              {scene.hotspots
                .filter((hotspot) => hotspot.shape === "polygon")
                .map((hotspot) => (
                  <a
                    key={hotspot.id}
                    href={getHotspotHref(hotspot)}
                    aria-label={hotspot.label}
                    className="pointer-events-auto outline-none"
                  >
                    <polygon
                      points={getPolygonPoints(hotspot)}
                      fill={
                        debugHotspots
                          ? "rgba(247, 211, 106, 0.22)"
                          : "transparent"
                      }
                      stroke={
                        debugHotspots ? "rgba(247, 211, 106, 0.95)" : "none"
                      }
                      strokeWidth={debugHotspots ? 0.3 : 0}
                      vectorEffect="non-scaling-stroke"
                      pointerEvents="all"
                    >
                      <title>{hotspot.label}</title>
                    </polygon>
                  </a>
                ))}
            </svg>
          </div>
        </section>

        {debugHotspots ? (
          <aside className="grid shrink-0 gap-2 border-t border-[#f5efe2]/10 py-3 font-mono text-xs text-[#f5efe2]/70 sm:grid-cols-[1fr_auto]">
            <p>
              {pointerPosition
                ? `Pointer: x ${pointerPosition.x}%, y ${pointerPosition.y}%`
                : "Click empty video space to read percentage coordinates."}
            </p>
            <p>
              Scene: {scene.slug} / Video: {scene.video.width}x
              {scene.video.height}
            </p>
          </aside>
        ) : null}
      </div>
    </main>
  );
}
