import type { MouseEvent } from "react";
import type { Hotspot } from "@/lib/scenes";
import { classNames, devOutline } from "./ui";

type HotspotLayerProps = {
  debugHotspots: boolean;
  devBorders: boolean;
  getActionHref: (action: Hotspot["action"]) => string;
  hotspots: Hotspot[];
  onActionClick: (
    event: MouseEvent<HTMLAnchorElement>,
    action: Hotspot["action"],
  ) => void;
  onPrimeAction: (action: Hotspot["action"]) => void;
};

function getPolygonPoints(hotspot: Hotspot) {
  return hotspot.shape === "polygon"
    ? hotspot.points.map((point) => `${point.x},${point.y}`).join(" ")
    : "";
}

export function HotspotLayer({
  debugHotspots,
  devBorders,
  getActionHref,
  hotspots,
  onActionClick,
  onPrimeAction,
}: HotspotLayerProps) {
  return (
    <svg
      className={classNames(
        "pointer-events-none absolute inset-0 z-10 h-full w-full",
        devOutline(devBorders, 5),
      )}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      {hotspots.map((hotspot) => {
        const action = hotspot.action;

        return (
          <a
            key={hotspot.id}
            href={getActionHref(action)}
            target={action.type === "externalLink" ? "_blank" : undefined}
            rel={
              action.type === "externalLink"
                ? "noopener noreferrer"
                : undefined
            }
            onFocus={() => onPrimeAction(action)}
            onPointerDown={() => onPrimeAction(action)}
            onPointerEnter={() => onPrimeAction(action)}
            onClick={(event) => onActionClick(event, action)}
            aria-label={hotspot.label}
            className="pointer-events-auto outline-none"
          >
            {hotspot.shape === "rect" ? (
              <rect
                x={hotspot.rect.x}
                y={hotspot.rect.y}
                width={hotspot.rect.width}
                height={hotspot.rect.height}
                fill={
                  debugHotspots ? "rgba(253, 224, 71, 0.22)" : "transparent"
                }
                stroke={debugHotspots ? "rgba(253, 224, 71, 0.95)" : "none"}
                strokeWidth={debugHotspots ? 0.3 : 0}
                vectorEffect="non-scaling-stroke"
                pointerEvents="all"
              >
                <title>{hotspot.label}</title>
              </rect>
            ) : (
              <polygon
                points={getPolygonPoints(hotspot)}
                fill={
                  debugHotspots ? "rgba(253, 224, 71, 0.22)" : "transparent"
                }
                stroke={debugHotspots ? "rgba(253, 224, 71, 0.95)" : "none"}
                strokeWidth={debugHotspots ? 0.3 : 0}
                vectorEffect="non-scaling-stroke"
                pointerEvents="all"
              >
                <title>{hotspot.label}</title>
              </polygon>
            )}
          </a>
        );
      })}
    </svg>
  );
}
