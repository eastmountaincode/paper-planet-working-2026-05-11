import type { Dispatch, SetStateAction } from "react";
import { useEffect } from "react";
import { getInitialPlaylistPosition } from "@/lib/playlist-sync";
import {
  normalizePlaylistManifest,
  playlistManifestToScenePlaylists,
} from "@/lib/playlist-manifest";
import {
  hotspotManifestToSceneHotspots,
  normalizeHotspotManifest,
} from "@/lib/hotspot-manifest";
import {
  fetchRuntimeManifestBundle,
  type RuntimeManifestBundle,
} from "@/lib/runtime-manifest-client";
import { createScenes, type Scene, type SceneSlug } from "@/lib/scenes";
import { normalizeSiteSettingsManifest } from "@/lib/site-settings";

type SceneSlugRef = {
  current: SceneSlug;
};

type UseRuntimeSceneManifestsOptions = {
  sceneSlugRef: SceneSlugRef;
  setActiveScene: Dispatch<SetStateAction<Scene>>;
  setPlaylistStartTime: Dispatch<SetStateAction<number>>;
  setPlaylistTrackIndex: Dispatch<SetStateAction<number>>;
  setRuntimeScenes: Dispatch<SetStateAction<Record<SceneSlug, Scene>>>;
};

export function useRuntimeSceneManifests({
  sceneSlugRef,
  setActiveScene,
  setPlaylistStartTime,
  setPlaylistTrackIndex,
  setRuntimeScenes,
}: UseRuntimeSceneManifestsOptions) {
  useEffect(() => {
    let isCanceled = false;

    async function loadRuntimeManifests() {
      const result = await fetchRuntimeManifestBundle().catch(
        (): RuntimeManifestBundle => ({}),
      );
      const playlistManifest = normalizePlaylistManifest(
        result.playlists?.manifest,
      );
      const hotspotManifest = normalizeHotspotManifest(
        result.hotspots?.manifest,
      );
      const settingsManifest = normalizeSiteSettingsManifest(
        result.settings?.manifest,
      );
      const nextScenes = createScenes(
        playlistManifestToScenePlaylists(playlistManifest),
        hotspotManifestToSceneHotspots(hotspotManifest),
        settingsManifest,
      );
      const nextScene = nextScenes[sceneSlugRef.current] ?? nextScenes.construction;
      const nextPosition = getInitialPlaylistPosition(nextScene);

      if (!isCanceled) {
        setRuntimeScenes(nextScenes);
        setActiveScene(nextScene);
        setPlaylistTrackIndex(nextPosition.trackIndex);
        setPlaylistStartTime(nextPosition.currentTime);
      }
    }

    void loadRuntimeManifests();

    return () => {
      isCanceled = true;
    };
  }, [
    sceneSlugRef,
    setActiveScene,
    setPlaylistStartTime,
    setPlaylistTrackIndex,
    setRuntimeScenes,
  ]);
}
