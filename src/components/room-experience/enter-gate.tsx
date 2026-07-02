import { EnterArtworkButton } from "@/components/enter-artwork-button";
import type { SceneSlug } from "@/lib/scenes";
import type { PlaylistTrack } from "./types";
import { classNames, devOutline } from "./ui";

type EnterGateProps = {
  activePlaylistTrack: PlaylistTrack | null;
  devBorders: boolean;
  onEnter: () => void;
  onPrimePlaylistTrack: (sceneSlug: SceneSlug, trackSrc: string) => void;
  sceneSlug: SceneSlug;
};

export function EnterGate({
  activePlaylistTrack,
  devBorders,
  onEnter,
  onPrimePlaylistTrack,
  sceneSlug,
}: EnterGateProps) {
  return (
    <div
      className={classNames(
        "fixed inset-0 z-50 flex touch-none items-center justify-center bg-black text-white",
        devOutline(devBorders, 4),
      )}
    >
      <EnterArtworkButton
        onPointerPrime={() => {
          if (activePlaylistTrack) {
            onPrimePlaylistTrack(sceneSlug, activePlaylistTrack.src);
          }
        }}
        onEnter={onEnter}
        className={devOutline(devBorders, 5)}
      />
    </div>
  );
}
