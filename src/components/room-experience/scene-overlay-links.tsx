import type { MouseEvent } from "react";
import type { Hotspot, Scene } from "@/lib/scenes";
import { classNames, devOutline } from "./ui";

type SceneOverlayLinksProps = {
  debugHotspots: boolean;
  devBorders: boolean;
  getActionHref: (action: Hotspot["action"]) => string;
  onActionClick: (
    event: MouseEvent<HTMLAnchorElement>,
    action: Hotspot["action"],
  ) => void;
  onPrimeAction: (action: Hotspot["action"]) => void;
  scene: Scene;
};

export function SceneOverlayLinks({
  debugHotspots,
  devBorders,
  getActionHref,
  onActionClick,
  onPrimeAction,
  scene,
}: SceneOverlayLinksProps) {
  return (
    <>
      {scene.overlays?.map((overlay) => {
        const action = overlay.action;

        return (
          <a
            key={overlay.id}
            href={getActionHref(action)}
            onFocus={() => onPrimeAction(action)}
            onPointerDown={() => onPrimeAction(action)}
            onPointerEnter={() => onPrimeAction(action)}
            onClick={(event) => onActionClick(event, action)}
            aria-label={overlay.label}
            title={debugHotspots ? overlay.label : undefined}
            className={classNames(
              "absolute z-30 block outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black",
              devOutline(devBorders, overlay.zIndex ?? 6),
            )}
            style={{
              left: `${overlay.position.x}%`,
              top: `${overlay.position.y}%`,
              width: `${overlay.position.width}%`,
            }}
          >
            {/* Use a plain img for local hand-drawn UI sprites; Next image optimization can be brittle in dev previews. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={overlay.src}
              alt=""
              className="block h-auto w-full select-none"
              draggable={false}
            />
            <span className="sr-only">{overlay.label}</span>
          </a>
        );
      })}
    </>
  );
}
