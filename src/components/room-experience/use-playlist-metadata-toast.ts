import { useCallback, useEffect, useRef, useState } from "react";
import { PLAYLIST_METADATA_TOAST_MS } from "./constants";
import {
  createPlaylistMetadataFrame,
  type PlaylistMetadataToast,
} from "./metadata-toast";
import type { PlaylistTrack } from "./types";

type UsePlaylistMetadataToastOptions = {
  activePlaylistTrack: PlaylistTrack | null;
  playlistAudioActive: boolean;
  playlistTrackIndex: number;
  sceneSlug: string;
};

export function usePlaylistMetadataToast({
  activePlaylistTrack,
  playlistAudioActive,
  playlistTrackIndex,
  sceneSlug,
}: UsePlaylistMetadataToastOptions) {
  const [metadataToast, setMetadataToast] =
    useState<PlaylistMetadataToast | null>(null);
  const metadataToastIdRef = useRef(0);
  const metadataToastTimeoutRef = useRef<number | null>(null);
  const lastMetadataToastKeyRef = useRef<string | null>(null);

  const showMetadataToast = useCallback(
    (title: string, album?: string, artist?: string) => {
      const nextId = metadataToastIdRef.current + 1;
      metadataToastIdRef.current = nextId;
      setMetadataToast({
        id: nextId,
        title,
        ...(artist ? { artist } : {}),
        ...(album ? { album } : {}),
        frame: createPlaylistMetadataFrame(
          `${nextId}:${title}:${artist ?? ""}:${album ?? ""}`,
        ),
      });

      if (metadataToastTimeoutRef.current) {
        window.clearTimeout(metadataToastTimeoutRef.current);
      }

      metadataToastTimeoutRef.current = window.setTimeout(() => {
        setMetadataToast((current) => (current?.id === nextId ? null : current));
        metadataToastTimeoutRef.current = null;
      }, PLAYLIST_METADATA_TOAST_MS);
    },
    [],
  );

  const showPlaylistMetadataToast = useCallback(
    (track: PlaylistTrack | null = activePlaylistTrack) => {
      if (!track) {
        return;
      }

      showMetadataToast(track.title, track.album, track.artist);
    },
    [activePlaylistTrack, showMetadataToast],
  );

  useEffect(() => {
    return () => {
      if (metadataToastTimeoutRef.current) {
        window.clearTimeout(metadataToastTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!playlistAudioActive || !activePlaylistTrack) {
      return;
    }

    const toastKey = `${sceneSlug}:${playlistTrackIndex}:${activePlaylistTrack.src}`;
    const previousToastKey = lastMetadataToastKeyRef.current;

    lastMetadataToastKeyRef.current = toastKey;

    if (
      !previousToastKey ||
      previousToastKey === toastKey ||
      !previousToastKey.startsWith(`${sceneSlug}:`)
    ) {
      return;
    }

    showPlaylistMetadataToast(activePlaylistTrack);
  }, [
    activePlaylistTrack,
    playlistAudioActive,
    playlistTrackIndex,
    sceneSlug,
    showPlaylistMetadataToast,
  ]);

  return {
    metadataToast,
    showMetadataToast,
    showPlaylistMetadataToast,
  };
}
