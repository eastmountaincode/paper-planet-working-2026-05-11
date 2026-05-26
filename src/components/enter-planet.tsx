"use client";

import { useRouter } from "next/navigation";
import { EnterArtworkButton } from "@/components/enter-artwork-button";
import { useEntryState } from "@/components/entry-provider";
import { getScenePlaylistPlayback } from "@/lib/playlist-sync";
import { sceneSlugs, scenes } from "@/lib/scenes";

export function EnterPlanet() {
  const router = useRouter();
  const { markEntered, unlockRoomPlaylists } = useEntryState();

  async function enter() {
    markEntered();
    const targetSlug = "construction";
    const playlistOptions = sceneSlugs.flatMap((slug) => {
      const playback = getScenePlaylistPlayback(scenes[slug]);

      if (!playback) {
        return [];
      }

      return [
        {
          active: slug === targetSlug,
          room: slug,
          src: playback.track.src,
          startTime: playback.currentTime,
          volume: playback.volume,
        },
      ];
    });

    try {
      await unlockRoomPlaylists(playlistOptions);
    } catch {
      // Still enter the room; the in-room sound controls can retry playback.
    }

    router.push("/");
  }

  return (
    <main className="flex h-dvh items-center justify-center overflow-hidden bg-black text-white">
      <EnterArtworkButton onEnter={enter} />
    </main>
  );
}
