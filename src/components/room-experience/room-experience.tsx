"use client";

import { useSearchParams } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
} from "react";
import { useEntryState } from "@/components/entry-provider";
import { scenes as staticScenes } from "@/lib/scenes";
import { CreditsModal } from "./credits-modal";
import { DevPanel } from "./dev-panel";
import { EnterGate } from "./enter-gate";
import { LoadingOverlay } from "./loading-overlay";
import { MetadataToast } from "./metadata-toast";
import { RoomStage } from "./room-stage";
import {
  clampSafeSquareRatio,
  DEFAULT_SAFE_SQUARE_SHORT_SIDE_RATIO,
} from "./safe-square";
import type {
  PointerPosition,
  RoomExperienceProps,
} from "./types";
import { useDevPanelAccess } from "./use-dev-panel-access";
import { useLoadingPreview } from "./use-loading-preview";
import { usePlaylistMetadataToast } from "./use-playlist-metadata-toast";
import { useRoomVideoController } from "./use-room-video-controller";
import { useRoomEntryControls } from "./use-room-entry-controls";
import { useRoomNavigation } from "./use-room-navigation";
import { useRuntimeSceneManifests } from "./use-runtime-scene-manifests";
import { useSceneFrame } from "./use-scene-frame";
import { useScenePlaylistController } from "./use-scene-playlist-controller";
import { useStageGestures } from "./use-stage-gestures";
import {
  classNames,
  devOutline,
} from "./ui";

export function RoomExperience({ scene: initialScene }: RoomExperienceProps) {
  const [runtimeScenes, setRuntimeScenes] = useState(staticScenes);
  const [scene, setActiveScene] = useState(initialScene);
  const searchParams = useSearchParams();
  const {
    hasEntered,
    markEntered,
    playRoomPlaylistTrack,
    playlistGain,
    playlistStatus,
    primeRoomPlaylistTrack,
    resumeRoomPlaylistAudio,
    setActivePlaylistRoom,
    setRoomPlaylistAudioLevel,
    setVideoAudioLevel,
    stopRoomPlaylistAudio,
    unlockRoomPlaylists,
    videoGain,
  } = useEntryState();
  const sceneSlugRef = useRef(initialScene.slug);
  const {
    debugHotspots,
    devBorders,
    devPanelOpen,
    helperShortcutEnabled,
    toggleDevPanel,
  } = useDevPanelAccess(searchParams);
  const [pointerPosition, setPointerPosition] =
    useState<PointerPosition | null>(null);
  const [videoAudioMuted, setVideoAudioMuted] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [fullBleedPreview, setFullBleedPreview] = useState(false);
  const [safeSquareVisible, setSafeSquareVisible] = useState(false);
  const [safeSquareRatio, setSafeSquareRatio] = useState(
    DEFAULT_SAFE_SQUARE_SHORT_SIDE_RATIO,
  );
  const [landscapeSimulationActive, setLandscapeSimulationActive] =
    useState(false);
  const fadeOutInProgressRef = useRef(false);
  const [audioTransitionMuted, setAudioTransitionMuted] = useState(false);
  const {
    handleStagePointerDown,
    handleStagePointerEnd,
    handleStagePointerMove,
    resetStageTransform,
    stageRef,
    stageTransformStyle,
  } = useStageGestures({
    debugHotspots,
    onDebugPointerChange: setPointerPosition,
  });

  const syncedPlayback = scene.video.sync?.enabled ?? false;
  const videoAudioEnabled = scene.video.audio?.enabled ?? false;
  const videoVolume = scene.video.audio?.volume ?? 0.8;
  const videoAudioActive =
    hasEntered && videoAudioEnabled && !videoAudioMuted && !audioTransitionMuted;
  const {
    activePlaylistTrack,
    getRoomPlaylistUnlockOptions,
    playPlaylistForScene,
    playlistAudioActive,
    playlistAudioMuted,
    playlistEnabled,
    playlistTrackIndex,
    playlistTracks,
    playlistVolume,
    primeScenePlaylist,
    resumeActivePlaylistAudio,
    setPlaylistAudioMuted,
    setPlaylistStartTime,
    setPlaylistTrackIndex,
  } = useScenePlaylistController({
    audioTransitionMuted,
    hasEntered,
    playRoomPlaylistTrack,
    playlistStatus,
    primeRoomPlaylistTrack,
    resumeRoomPlaylistAudio,
    runtimeScenes,
    scene,
    sceneSlugRef,
    setActivePlaylistRoom,
    setAudioError,
    stopRoomPlaylistAudio,
  });
  const {
    handleVariantVideoReady,
    muteAllVideosForTransition,
    playVisibleVideoOnEnter,
    recordVisibleVideoTime,
    resetVideoForSceneSwitch,
    resolvedSceneViewport,
    sceneViewport,
    setIsExiting,
    setVideoElement,
    syncVideoElementTime,
    toggleVisibleVideoAudio,
    transitionActive,
    videoElementStatus,
    visibleSceneViewport,
  } = useRoomVideoController({
    audioTransitionMuted,
    fadeOutInProgressRef,
    resumeActivePlaylistAudio,
    scene,
    setAudioError,
    setAudioTransitionMuted,
    setVideoAudioLevel,
    syncedPlayback,
    videoAudioActive,
    videoAudioEnabled,
    videoVolume,
  });
  const {
    enterPlanet,
    togglePlaylistAudio,
    toggleVideoAudio,
  } = useRoomEntryControls({
    getRoomPlaylistUnlockOptions,
    hasEntered,
    markEntered,
    playVisibleVideoOnEnter,
    resumeActivePlaylistAudio,
    setAudioError,
    setPlaylistAudioMuted,
    setVideoAudioMuted,
    toggleVisibleVideoAudio,
    unlockRoomPlaylists,
    videoAudioMuted,
  });
  const {
    activeVideoSource,
    orderedHotspots,
    safeSquareMetrics,
    stageFrameStyle,
    viewportSize,
  } = useSceneFrame(
    scene,
    sceneViewport,
    visibleSceneViewport,
    fullBleedPreview,
    safeSquareRatio,
    landscapeSimulationActive,
  );
  const { loadingPreviewVisible, showLoadingPreview } = useLoadingPreview();
  const {
    metadataToast,
    showMetadataToast,
    showPlaylistMetadataToast,
  } = usePlaylistMetadataToast({
    activePlaylistTrack,
    playlistAudioActive,
    playlistTrackIndex,
    sceneSlug: scene.slug,
  });
  useRuntimeSceneManifests({
    sceneSlugRef,
    setActiveScene,
    setPlaylistStartTime,
    setPlaylistTrackIndex,
    setRuntimeScenes,
  });
  const {
    getActionHref,
    handleHotspotActionClick,
    handleSceneNavigation,
    primeHotspotAction,
  } = useRoomNavigation({
    currentScene: scene,
    fadeOutInProgressRef,
    hasEntered,
    muteAllVideosForTransition,
    playPlaylistForScene,
    playlistAudioMuted,
    playlistVolume,
    primeScenePlaylist,
    resetStageTransform,
    resetVideoForSceneSwitch,
    runtimeScenes,
    setActiveScene,
    setAudioError,
    setAudioTransitionMuted,
    setCreditsOpen,
    setIsExiting,
    setPlaylistStartTime,
    setPlaylistTrackIndex,
    setPointerPosition,
    setRoomPlaylistAudioLevel,
    setVideoAudioLevel,
    videoVolume,
  });

  const loadingOverlayActive = transitionActive || loadingPreviewVisible;

  useEffect(() => {
    sceneSlugRef.current = scene.slug;
  }, [scene.slug]);

  useEffect(() => {
    if (!creditsOpen) {
      return undefined;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCreditsOpen(false);
      }
    };

    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [creditsOpen]);

  return (
    <main
      className={classNames(
        "relative h-dvh overflow-hidden overscroll-none bg-black text-white",
        devOutline(devBorders, 0),
      )}
    >
      {activePlaylistTrack && !hasEntered ? (
        <link
          rel="preload"
          href={activePlaylistTrack.src}
          as="audio"
          crossOrigin="anonymous"
        />
      ) : null}
      <RoomStage
        debugHotspots={debugHotspots}
        devBorders={devBorders}
        fullBleedPreview={fullBleedPreview}
        landscapeSimulationActive={landscapeSimulationActive}
        getActionHref={getActionHref}
        onHotspotActionClick={handleHotspotActionClick}
        onPrimeHotspotAction={primeHotspotAction}
        onStagePointerCancel={handleStagePointerEnd}
        onStagePointerDown={handleStagePointerDown}
        onStagePointerMove={handleStagePointerMove}
        onStagePointerUp={handleStagePointerEnd}
        onVideoLoadedMetadata={(element, isVisible) => {
          const muted = !isVisible || !videoAudioActive || !videoAudioEnabled;

          element.volume = muted ? 0 : videoVolume;
          element.muted = muted;
          syncVideoElementTime(element);
        }}
        onVideoTimeUpdate={recordVisibleVideoTime}
        onVideoVariantReady={handleVariantVideoReady}
        orderedHotspots={orderedHotspots}
        resolvedSceneViewport={resolvedSceneViewport}
        safeSquareMetrics={safeSquareMetrics}
        safeSquareVisible={safeSquareVisible}
        scene={scene}
        sceneViewport={sceneViewport}
        setVideoElement={setVideoElement}
        stageFrameStyle={stageFrameStyle}
        stageRef={stageRef}
        stageTransformStyle={stageTransformStyle}
        videoAudioActive={videoAudioActive}
        videoAudioEnabled={videoAudioEnabled}
      />

      <LoadingOverlay
        devBorders={devBorders}
        loadingOverlayActive={loadingOverlayActive}
        transitionActive={transitionActive}
      />

      {!hasEntered ? (
        <EnterGate
          activePlaylistTrack={activePlaylistTrack}
          devBorders={devBorders}
          onEnter={enterPlanet}
          onPrimePlaylistTrack={primeRoomPlaylistTrack}
          sceneSlug={scene.slug}
        />
      ) : null}

      {metadataToast ? <MetadataToast toast={metadataToast} /> : null}

      {creditsOpen ? (
        <CreditsModal onClose={() => setCreditsOpen(false)} />
      ) : null}

      {helperShortcutEnabled && devPanelOpen ? (
        <DevPanel
          activePlaylistTrack={activePlaylistTrack}
          activeVideoSource={activeVideoSource}
          audioError={audioError}
          browserViewport={viewportSize}
          debugHotspots={debugHotspots}
          devBorders={devBorders}
          devPanelOpen={devPanelOpen}
          fullBleedPreview={fullBleedPreview}
          hasEntered={hasEntered}
          landscapeSimulationActive={landscapeSimulationActive}
          onEnter={enterPlanet}
          onNavigate={handleSceneNavigation}
          onPrimeScene={primeScenePlaylist}
          onShowLoading={showLoadingPreview}
          onShowMetadata={showMetadataToast}
          onShowPlaylistMetadata={showPlaylistMetadataToast}
          onToggleFullBleedPreview={() =>
            setFullBleedPreview((current) => !current)
          }
          onToggleLandscapeSimulation={() =>
            setLandscapeSimulationActive((current) => !current)
          }
          onTogglePanel={toggleDevPanel}
          onTogglePlaylistAudio={togglePlaylistAudio}
          onToggleSafeSquare={() =>
            setSafeSquareVisible((current) => !current)
          }
          onToggleVideoAudio={toggleVideoAudio}
          onSafeSquareRatioChange={(value) =>
            setSafeSquareRatio(clampSafeSquareRatio(value))
          }
          playlistAudioActive={playlistAudioActive}
          playlistEnabled={playlistEnabled}
          playlistGain={playlistGain}
          playlistStatus={playlistStatus}
          playlistTrackIndex={playlistTrackIndex}
          playlistTracks={playlistTracks}
          pointerPosition={pointerPosition}
          runtimeScenes={runtimeScenes}
          safeSquareMetrics={safeSquareMetrics}
          safeSquareRatio={safeSquareRatio}
          safeSquareVisible={safeSquareVisible}
          scene={scene}
          sceneViewport={sceneViewport}
          videoAudioActive={videoAudioActive}
          videoAudioEnabled={videoAudioEnabled}
          videoElementStatus={videoElementStatus}
          videoGain={videoGain}
          videoVolume={videoVolume}
        />
      ) : null}
    </main>
  );
}
