"use client";

import type { KeyboardEvent, PointerEvent } from "react";
import { useEffect, useState } from "react";
import enterHotspotsData from "@/lib/enter-hotspots.json";
import { normalizeHotspotManifest } from "@/lib/hotspot-manifest";
import { fetchRuntimeManifestBundle } from "@/lib/runtime-manifest-client";
import type { Hotspot, PercentPoint, RectHotspot } from "@/lib/scenes";

const ENTER_ARTWORK_SRC = "/enter/paper-planet-enter.webp";
const staticEnterHotspots = enterHotspotsData as Hotspot[];

type EnterArtworkButtonProps = {
  className?: string;
  onEnter: () => void | Promise<void>;
  onPointerPrime?: () => void;
};

function classNames(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function pointsToString(points: PercentPoint[]) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function rectToPoints({ rect }: RectHotspot) {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
}

function getHotspotPoints(hotspot: Hotspot) {
  return hotspot.shape === "polygon" ? hotspot.points : rectToPoints(hotspot);
}

export function EnterArtworkButton({
  className,
  onEnter,
  onPointerPrime,
}: EnterArtworkButtonProps) {
  const [activeHotspotId, setActiveHotspotId] = useState<string | null>(null);
  const [enterHotspots, setEnterHotspots] = useState(staticEnterHotspots);
  const isPointingAtHotspot = activeHotspotId !== null;

  useEffect(() => {
    let isCanceled = false;

    async function loadRuntimeHotspots() {
      const result = await fetchRuntimeManifestBundle();
      const manifest = normalizeHotspotManifest(result.hotspots?.manifest);

      if (!isCanceled) {
        setEnterHotspots(manifest.enter);
      }
    }

    void loadRuntimeHotspots().catch(() => undefined);

    return () => {
      isCanceled = true;
    };
  }, []);

  function handlePointerEnter(hotspotId: string) {
    setActiveHotspotId(hotspotId);
  }

  function handlePointerLeave() {
    setActiveHotspotId(null);
  }

  function handlePointerDown(event: PointerEvent<SVGPolygonElement>) {
    event.stopPropagation();
    onPointerPrime?.();
  }

  function handleClick() {
    void onEnter();
  }

  function handleKeyDown(event: KeyboardEvent<SVGPolygonElement>) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    void onEnter();
  }

  return (
    <div
      className={classNames(
        "relative touch-none select-none bg-transparent p-0 focus-within:outline-none focus-within:ring-2 focus-within:ring-white focus-within:ring-offset-4 focus-within:ring-offset-black",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={ENTER_ARTWORK_SRC}
        alt=""
        className={classNames(
          "block max-h-[86dvh] w-[min(77vw,48.6rem)] select-none object-contain",
          isPointingAtHotspot && "opacity-80",
        )}
        draggable={false}
      />
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-label="Enter Paper Planet"
      >
        {enterHotspots.map((hotspot, index) => (
          <polygon
            key={hotspot.id}
            points={pointsToString(getHotspotPoints(hotspot))}
            fill="transparent"
            pointerEvents="all"
            role={index === 0 ? "button" : undefined}
            tabIndex={index === 0 ? 0 : undefined}
            aria-label={index === 0 ? hotspot.label : undefined}
            className="cursor-pointer outline-none focus-visible:stroke-white"
            stroke="transparent"
            strokeWidth="0.45"
            vectorEffect="non-scaling-stroke"
            onPointerEnter={() => handlePointerEnter(hotspot.id)}
            onPointerLeave={handlePointerLeave}
            onPointerDown={handlePointerDown}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
          />
        ))}
      </svg>
    </div>
  );
}
