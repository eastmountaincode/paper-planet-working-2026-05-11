"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import type { FFmpeg } from "@ffmpeg/ffmpeg";
import {
  createBatchId,
  createTrackId,
  getFolderAlbum,
  normalizePlaylistManifest,
  roomSlugs,
  roomTitles,
  stripTrackNumber,
  type PlaylistManifest,
  type PlaylistManifestTrack,
  type SceneSlug,
} from "@/lib/playlist-manifest";

type PlaylistResponse = {
  manifest: PlaylistManifest;
  source: "r2" | "static";
};

type UploadUrlResponse = {
  headers: Record<string, string>;
  key: string;
  publicUrl: string;
  url: string;
};

type DeleteAudioResponse = {
  deletedKeys: string[];
  failedKeys: string[];
};

type UploadRow = {
  fileName: string;
  id: string;
  message: string;
  progress: number;
  status: "queued" | "preparing" | "uploading" | "done" | "error";
};

type NormalizedAudio = {
  blob: Blob;
  durationSeconds: number;
};

type UploadedTrackMetadata = {
  artist?: string;
};

type DropPlacement = "before" | "after";

const playlistDraftStorageKey = "paper-planet-admin-playlist-draft-v1";
const directUploadAttempts = 3;
const dragHandleDots = ["dot-1", "dot-2", "dot-3", "dot-4", "dot-5", "dot-6"];
let ffmpegPromise: Promise<FFmpeg> | null = null;
const fileCollator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

function classNames(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0:00";
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60)
    .toString()
    .padStart(2, "0");

  return `${minutes}:${remainingSeconds}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }

  return "Unknown error";
}

function getRelativePath(file: File) {
  return file.webkitRelativePath || file.name;
}

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function readSynchsafeInteger(bytes: Uint8Array, offset: number) {
  return (
    ((bytes[offset] ?? 0) << 21) |
    ((bytes[offset + 1] ?? 0) << 14) |
    ((bytes[offset + 2] ?? 0) << 7) |
    (bytes[offset + 3] ?? 0)
  );
}

function readBigEndianInteger(bytes: Uint8Array, offset: number) {
  return (
    ((bytes[offset] ?? 0) << 24) |
    ((bytes[offset + 1] ?? 0) << 16) |
    ((bytes[offset + 2] ?? 0) << 8) |
    (bytes[offset + 3] ?? 0)
  ) >>> 0;
}

function decodeId3TextFrame(frameData: Uint8Array) {
  const encoding = frameData[0] ?? 0;
  const textData = frameData.slice(1);

  let text = "";

  try {
    if (encoding === 1) {
      if (textData[0] === 0xfe && textData[1] === 0xff) {
        text = new TextDecoder("utf-16be").decode(textData.slice(2));
      } else if (textData[0] === 0xff && textData[1] === 0xfe) {
        text = new TextDecoder("utf-16le").decode(textData.slice(2));
      } else {
        text = new TextDecoder("utf-16le").decode(textData);
      }
    } else if (encoding === 2) {
      text = new TextDecoder("utf-16be").decode(textData);
    } else {
      const decoder = new TextDecoder(encoding === 3 ? "utf-8" : "windows-1252");
      text = decoder.decode(textData);
    }
  } catch {
    text = new TextDecoder().decode(textData);
  }

  return text.replace(/\0/g, "").trim() || undefined;
}

async function extractUploadedTrackMetadata(
  file: File,
): Promise<UploadedTrackMetadata> {
  const header = new Uint8Array(await file.slice(0, 10).arrayBuffer());

  if (
    header.length < 10 ||
    header[0] !== 0x49 ||
    header[1] !== 0x44 ||
    header[2] !== 0x33
  ) {
    return {};
  }

  const majorVersion = header[3] ?? 0;
  const tagSize = readSynchsafeInteger(header, 6);
  const bytes = new Uint8Array(await file.slice(10, 10 + tagSize).arrayBuffer());
  let offset = 0;

  while (offset + 10 <= bytes.length) {
    const frameId = String.fromCharCode(
      bytes[offset] ?? 0,
      bytes[offset + 1] ?? 0,
      bytes[offset + 2] ?? 0,
      bytes[offset + 3] ?? 0,
    );

    if (!/^[A-Z0-9]{4}$/.test(frameId)) {
      break;
    }

    const frameSize =
      majorVersion === 4
        ? readSynchsafeInteger(bytes, offset + 4)
        : readBigEndianInteger(bytes, offset + 4);

    if (frameSize <= 0 || offset + 10 + frameSize > bytes.length) {
      break;
    }

    if (frameId === "TPE1") {
      return {
        artist: decodeId3TextFrame(bytes.slice(offset + 10, offset + 10 + frameSize)),
      };
    }

    offset += 10 + frameSize;
  }

  return {};
}

function readPlaylistDraft() {
  try {
    const draft = window.localStorage.getItem(playlistDraftStorageKey);

    if (!draft) {
      return null;
    }

    const parsed = JSON.parse(draft) as {
      manifest?: unknown;
      pendingDeleteKeys?: unknown;
    };
    const pendingDeleteKeys = Array.isArray(parsed.pendingDeleteKeys)
      ? parsed.pendingDeleteKeys.filter((key): key is string => typeof key === "string")
      : [];

    return {
      manifest: normalizePlaylistManifest(parsed.manifest),
      pendingDeleteKeys,
    };
  } catch {
    window.localStorage.removeItem(playlistDraftStorageKey);
    return null;
  }
}

function writePlaylistDraft(
  manifest: PlaylistManifest,
  pendingDeleteKeys: Set<string>,
) {
  window.localStorage.setItem(
    playlistDraftStorageKey,
    JSON.stringify({
      manifest,
      pendingDeleteKeys: [...pendingDeleteKeys],
      savedAt: new Date().toISOString(),
    }),
  );
}

function clearPlaylistDraft() {
  window.localStorage.removeItem(playlistDraftStorageKey);
}

function getTrackKeys(tracks: PlaylistManifestTrack[]) {
  return tracks.map((track) => track.key).filter(Boolean);
}

function getReferencedTrackKeys(manifest: PlaylistManifest) {
  const keys = new Set<string>();

  roomSlugs.forEach((slug) => {
    manifest.rooms[slug].tracks.forEach((track) => {
      keys.add(track.key);
    });
  });

  return keys;
}

async function getFfmpeg() {
  if (!ffmpegPromise) {
    ffmpegPromise = Promise.all([
      import("@ffmpeg/ffmpeg"),
      import("@ffmpeg/util"),
    ]).then(async ([ffmpegModule]) => {
      const ffmpeg = new ffmpegModule.FFmpeg();
      const ffmpegCoreBaseUrl = new URL(
        "/vendor/ffmpeg-core/",
        window.location.href,
      )
        .toString()
        .replace(/\/$/, "");

      await ffmpeg.load({
        classWorkerURL: `${ffmpegCoreBaseUrl}/worker.js`,
        coreURL: `${ffmpegCoreBaseUrl}/ffmpeg-core.js`,
        wasmURL: `${ffmpegCoreBaseUrl}/ffmpeg-core.wasm`,
      });
      return ffmpeg;
    });
  }

  return ffmpegPromise;
}

async function getAudioDuration(blob: Blob) {
  return new Promise<number>((resolve) => {
    const audio = document.createElement("audio");
    const objectUrl = URL.createObjectURL(blob);

    const finish = (durationSeconds: number) => {
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(objectUrl);
      resolve(Number.isFinite(durationSeconds) ? Number(durationSeconds.toFixed(3)) : 0);
    };

    audio.preload = "metadata";
    audio.onloadedmetadata = () => finish(audio.duration);
    audio.onerror = () => finish(0);
    audio.src = objectUrl;
  });
}

async function normalizeMp3(
  file: File,
  onProgress: (progress: number) => void,
): Promise<NormalizedAudio> {
  const [{ fetchFile }] = await Promise.all([import("@ffmpeg/util")]);
  const ffmpeg = await getFfmpeg().catch((error: unknown) => {
    throw new Error(`Could not load audio normalizer: ${getErrorMessage(error)}`);
  });
  const id = createTrackId();
  const inputName = `${id}-input.mp3`;
  const outputName = `${id}-output.mp3`;
  const ffmpegLogs: string[] = [];
  const progressHandler = ({ progress }: { progress: number }) => {
    if (Number.isFinite(progress)) {
      onProgress(Math.max(0, Math.min(0.95, progress)));
    }
  };
  const logHandler = ({ message }: { message: string }) => {
    const trimmedMessage = message.trim();

    if (trimmedMessage) {
      ffmpegLogs.push(trimmedMessage);
    }
  };

  ffmpeg.on("progress", progressHandler);
  ffmpeg.on("log", logHandler);

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file));
    const exitCode = await ffmpeg.exec([
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      inputName,
      "-map",
      "0:a:0",
      "-vn",
      "-ac",
      "2",
      "-ar",
      "44100",
      "-codec:a",
      "libmp3lame",
      "-b:a",
      "256k",
      "-write_xing",
      "1",
      "-id3v2_version",
      "3",
      outputName,
    ]);

    if (exitCode !== 0) {
      const logTail = ffmpegLogs.slice(-3).join(" ");

      throw new Error(
        `ffmpeg exited with code ${exitCode}${logTail ? `: ${logTail}` : ""}`,
      );
    }
    const outputData = await ffmpeg.readFile(outputName);

    if (!(outputData instanceof Uint8Array)) {
      throw new Error("ffmpeg did not return audio bytes.");
    }

    const outputBuffer = outputData.buffer.slice(
      outputData.byteOffset,
      outputData.byteOffset + outputData.byteLength,
    ) as ArrayBuffer;
    const blob = new Blob([outputBuffer], { type: "audio/mpeg" });
    const durationSeconds = await getAudioDuration(blob);

    onProgress(1);

    return {
      blob,
      durationSeconds,
    };
  } finally {
    ffmpeg.off("progress", progressHandler);
    ffmpeg.off("log", logHandler);
    await Promise.allSettled([
      ffmpeg.deleteFile(inputName),
      ffmpeg.deleteFile(outputName),
    ]);
  }
}

function reorderTrack(
  tracks: PlaylistManifestTrack[],
  draggedTrackId: string,
  targetTrackId: string,
  placement: DropPlacement,
) {
  const fromIndex = tracks.findIndex((track) => track.id === draggedTrackId);
  const targetIndex = tracks.findIndex((track) => track.id === targetTrackId);

  if (fromIndex < 0 || targetIndex < 0 || draggedTrackId === targetTrackId) {
    return tracks;
  }

  const nextTracks = [...tracks];
  const [track] = nextTracks.splice(fromIndex, 1);
  const adjustedTargetIndex = nextTracks.findIndex(
    (item) => item.id === targetTrackId,
  );

  if (adjustedTargetIndex < 0) {
    return tracks;
  }

  nextTracks.splice(
    placement === "after" ? adjustedTargetIndex + 1 : adjustedTargetIndex,
    0,
    track,
  );

  return nextTracks;
}

function getDropPlacement(event: DragEvent<HTMLElement>): DropPlacement {
  const rect = event.currentTarget.getBoundingClientRect();

  return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
}

function syncFormValues(source: Element, clone: Element) {
  const sourceFields = source.querySelectorAll("input, select, textarea");
  const cloneFields = clone.querySelectorAll("input, select, textarea");

  sourceFields.forEach((sourceField, index) => {
    const cloneField = cloneFields[index];

    if (
      sourceField instanceof HTMLInputElement &&
      cloneField instanceof HTMLInputElement
    ) {
      if (sourceField.type === "checkbox" || sourceField.type === "radio") {
        cloneField.checked = sourceField.checked;
      } else {
        cloneField.value = sourceField.value;
      }

      return;
    }

    if (
      sourceField instanceof HTMLSelectElement &&
      cloneField instanceof HTMLSelectElement
    ) {
      cloneField.value = sourceField.value;
      return;
    }

    if (
      sourceField instanceof HTMLTextAreaElement &&
      cloneField instanceof HTMLTextAreaElement
    ) {
      cloneField.value = sourceField.value;
    }
  });
}

function createTrackRowDragImage(rowElement: HTMLTableRowElement) {
  const rowRect = rowElement.getBoundingClientRect();
  const table = document.createElement("table");
  const tbody = document.createElement("tbody");
  const rowClone = rowElement.cloneNode(true) as HTMLTableRowElement;
  const originalCells = Array.from(rowElement.cells);
  const clonedCells = Array.from(rowClone.cells);

  syncFormValues(rowElement, rowClone);

  table.style.position = "fixed";
  table.style.left = "-10000px";
  table.style.top = "-10000px";
  table.style.width = `${rowRect.width}px`;
  table.style.borderCollapse = "collapse";
  table.style.tableLayout = "fixed";
  table.style.background = "rgba(18, 18, 18, 0.98)";
  table.style.boxShadow =
    "0 16px 40px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.2)";
  table.style.color = "white";
  table.style.opacity = "0.98";
  table.style.pointerEvents = "none";
  table.style.zIndex = "2147483647";

  rowClone.style.background = "rgba(18, 18, 18, 0.98)";

  clonedCells.forEach((cell, index) => {
    const cellRect = originalCells[index]?.getBoundingClientRect();

    cell.style.width = cellRect ? `${cellRect.width}px` : "";
    cell.style.background = "rgba(18, 18, 18, 0.98)";
    cell.style.borderTop = "0";
  });

  table.appendChild(tbody);
  tbody.appendChild(rowClone);
  document.body.appendChild(table);

  return {
    element: table,
    offsetX: 18,
    offsetY: rowRect.height / 2,
    remove: () => table.remove(),
  };
}

export function AudioAdmin() {
  const audioInputRef = useRef<HTMLInputElement>(null);
  const selectAllTracksRef = useRef<HTMLInputElement>(null);
  const [manifest, setManifest] = useState<PlaylistManifest | null>(null);
  const [source, setSource] = useState<"r2" | "static">("static");
  const [selectedRoom, setSelectedRoom] = useState<SceneSlug>("construction");
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [draggedTrackId, setDraggedTrackId] = useState<string | null>(null);
  const [dragTarget, setDragTarget] = useState<{
    id: string;
    placement: DropPlacement;
  } | null>(null);
  const [status, setStatus] = useState("Loading playlists...");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pendingDeleteKeys, setPendingDeleteKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [uploadRows, setUploadRows] = useState<UploadRow[]>([]);

  const room = manifest?.rooms[selectedRoom] ?? null;
  const totalDuration = useMemo(
    () =>
      room?.tracks
        .filter((track) => track.enabled)
        .reduce((total, track) => total + track.durationSeconds, 0) ?? 0,
    [room?.tracks],
  );
  const currentTrackIds = useMemo(
    () => room?.tracks.map((track) => track.id) ?? [],
    [room?.tracks],
  );
  const selectedTrackCount = useMemo(
    () =>
      currentTrackIds.filter((trackId) => selectedTrackIds.has(trackId)).length,
    [currentTrackIds, selectedTrackIds],
  );
  const allTracksSelected =
    currentTrackIds.length > 0 && selectedTrackCount === currentTrackIds.length;
  const someTracksSelected = selectedTrackCount > 0;

  useEffect(() => {
    if (selectAllTracksRef.current) {
      selectAllTracksRef.current.indeterminate =
        someTracksSelected && !allTracksSelected;
    }
  }, [allTracksSelected, someTracksSelected]);

  useEffect(() => {
    let isCanceled = false;

    async function loadPlaylists() {
      const response = await fetch("/api/admin/playlists", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Could not load playlists.");
      }

      const result = (await response.json()) as PlaylistResponse;

      if (!isCanceled) {
        setManifest(result.manifest);
        setSource(result.source);
        setHasUnsavedChanges(false);

        const draftManifest = readPlaylistDraft();

        if (draftManifest) {
          setManifest(draftManifest.manifest);
          setPendingDeleteKeys(new Set(draftManifest.pendingDeleteKeys));
          setHasUnsavedChanges(true);
          setStatus(
            "Loaded local draft with unpublished changes. Publish Changes to make it live.",
          );
        } else {
          setPendingDeleteKeys(new Set());
          setStatus(
            result.source === "r2"
              ? "Loaded published playlist manifest."
              : "Loaded static fallback manifest.",
          );
        }
      }
    }

    void loadPlaylists().catch((error: unknown) => {
      if (!isCanceled) {
        setStatus(error instanceof Error ? error.message : "Load failed.");
      }
    });

    return () => {
      isCanceled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasUnsavedChanges || !manifest) {
      return;
    }

    writePlaylistDraft(manifest, pendingDeleteKeys);
  }, [hasUnsavedChanges, manifest, pendingDeleteKeys]);

  useEffect(() => {
    if (!hasUnsavedChanges) {
      return;
    }

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  function updateSelectedRoomTracks(
    updater:
      | PlaylistManifestTrack[]
      | ((tracks: PlaylistManifestTrack[]) => PlaylistManifestTrack[]),
  ) {
    setHasUnsavedChanges(true);
    setManifest((current) => {
      if (!current) {
        return current;
      }

      const currentTracks = current.rooms[selectedRoom].tracks;
      const nextTracks =
        typeof updater === "function" ? updater(currentTracks) : updater;

      return {
        ...current,
        rooms: {
          ...current.rooms,
          [selectedRoom]: {
            ...current.rooms[selectedRoom],
            tracks: nextTracks,
          },
        },
      };
    });
  }

  async function deletePendingAudioObjects(
    nextManifest: PlaylistManifest,
    deleteKeys = pendingDeleteKeys,
  ) {
    const referencedKeys = getReferencedTrackKeys(nextManifest);
    const keys = [...deleteKeys].filter((key) => !referencedKeys.has(key));

    if (keys.length === 0) {
      return { deletedKeys: [], failedKeys: [] } satisfies DeleteAudioResponse;
    }

    const response = await fetch("/api/admin/audio/delete", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ keys }),
    });

    const result = (await response.json().catch(() => null)) as
      | (Partial<DeleteAudioResponse> & { error?: string })
      | null;

    if (!response.ok) {
      throw new Error(result?.error ?? "R2 audio cleanup failed.");
    }

    return {
      deletedKeys: result?.deletedKeys ?? [],
      failedKeys: result?.failedKeys ?? [],
    } satisfies DeleteAudioResponse;
  }

  async function publishManifest(
    nextManifest = manifest,
    deleteKeys = pendingDeleteKeys,
  ) {
    if (!nextManifest) {
      return;
    }

    setIsSaving(true);
    setStatus("Publishing playlist manifest...");

    const response = await fetch("/api/admin/playlists", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(nextManifest),
    });

    if (!response.ok) {
      const result = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      setIsSaving(false);
      setStatus(result?.error ?? "Publish failed.");
      return;
    }

    const result = (await response.json()) as PlaylistResponse;
    let cleanup: DeleteAudioResponse;

    try {
      cleanup = await deletePendingAudioObjects(result.manifest, deleteKeys);
    } catch (error) {
      setIsSaving(false);
      setManifest(result.manifest);
      setSource("r2");
      setPendingDeleteKeys(new Set(deleteKeys));
      setHasUnsavedChanges(true);
      setStatus(
        `Playlist manifest published, but R2 audio cleanup failed: ${getErrorMessage(
          error,
        )}`,
      );
      return;
    }

    setIsSaving(false);

    if (cleanup.failedKeys.length > 0) {
      setManifest(result.manifest);
      setSource("r2");
      setPendingDeleteKeys(new Set(cleanup.failedKeys));
      setHasUnsavedChanges(true);
      setStatus(
        `Playlist manifest published, but ${cleanup.failedKeys.length} R2 file${
          cleanup.failedKeys.length === 1 ? "" : "s"
        } could not be deleted. Try Publish Changes again to retry cleanup.`,
      );
      return;
    }

    setManifest(result.manifest);
    setSource("r2");
    setPendingDeleteKeys(new Set());
    setHasUnsavedChanges(false);
    clearPlaylistDraft();
    setStatus(
      cleanup.deletedKeys.length > 0
        ? `Playlist manifest published. Deleted ${cleanup.deletedKeys.length} R2 file${
            cleanup.deletedKeys.length === 1 ? "" : "s"
          }.`
        : "Playlist manifest published.",
    );
  }

  async function discardLocalDraft() {
    clearPlaylistDraft();
    setHasUnsavedChanges(false);
    setStatus("Reloading published playlist manifest...");

    const response = await fetch("/api/admin/playlists", {
      cache: "no-store",
    });

    if (!response.ok) {
      setStatus("Could not reload published playlist manifest.");
      return;
    }

    const result = (await response.json()) as PlaylistResponse;

    setManifest(result.manifest);
    setSource(result.source);
    setPendingDeleteKeys(new Set());
    setStatus(
      result.source === "r2"
        ? "Discarded local draft and reloaded published playlist manifest."
        : "Discarded local draft and reloaded static fallback manifest.",
    );
  }

  function updateTrack(trackId: string, updates: Partial<PlaylistManifestTrack>) {
    updateSelectedRoomTracks((tracks) =>
      tracks.map((track) =>
        track.id === trackId ? { ...track, ...updates } : track,
      ),
    );
  }

  function toggleTrackSelection(trackId: string, checked: boolean) {
    setSelectedTrackIds((current) => {
      const next = new Set(current);

      if (checked) {
        next.add(trackId);
      } else {
        next.delete(trackId);
      }

      return next;
    });
  }

  function selectAllTracks() {
    setSelectedTrackIds(new Set(currentTrackIds));
  }

  function clearTrackSelection() {
    setSelectedTrackIds(new Set());
  }

  function updateSelectedTracks(updates: Partial<PlaylistManifestTrack>) {
    if (!someTracksSelected) {
      return;
    }

    updateSelectedRoomTracks((tracks) =>
      tracks.map((track) =>
        selectedTrackIds.has(track.id) ? { ...track, ...updates } : track,
      ),
    );

    setStatus(
      `Updated ${selectedTrackCount} selected track${
        selectedTrackCount === 1 ? "" : "s"
      }. Publish Changes to make it live.`,
    );
  }

  function removeTracks(trackIds: Set<string>) {
    if (trackIds.size === 0 || !room) {
      return;
    }

    const tracksToRemove = room.tracks.filter((track) => trackIds.has(track.id));
    const trackCount = tracksToRemove.length;

    if (trackCount === 0) {
      return;
    }

    const confirmed = window.confirm(
      `Remove ${trackCount} track${trackCount === 1 ? "" : "s"} from ${
        roomTitles[selectedRoom]
      }? The playlist change will be saved as a draft now, and the matching R2 audio file${
        trackCount === 1 ? "" : "s"
      } will be deleted when you publish.`,
    );

    if (!confirmed) {
      return;
    }

    setPendingDeleteKeys((current) => {
      const next = new Set(current);

      getTrackKeys(tracksToRemove).forEach((key) => next.add(key));

      return next;
    });
    updateSelectedRoomTracks((tracks) =>
      tracks.filter((track) => !trackIds.has(track.id)),
    );
    clearTrackSelection();
    setStatus(
      `Removed ${trackCount} track${
        trackCount === 1 ? "" : "s"
      } from the draft. Publish Changes to delete unused R2 file${
        trackCount === 1 ? "" : "s"
      } and make it live.`,
    );
  }

  function removeSelectedTracks() {
    removeTracks(new Set(selectedTrackIds));
  }

  function resetTrackDrag() {
    setDraggedTrackId(null);
    setDragTarget(null);
  }

  function handleTrackDragStart(
    event: DragEvent<HTMLButtonElement>,
    trackId: string,
  ) {
    if (isSaving || isUploading) {
      event.preventDefault();
      return;
    }

    const rowElement = event.currentTarget.closest("tr");

    if (rowElement) {
      const dragImage = createTrackRowDragImage(rowElement);

      event.dataTransfer.setDragImage(
        dragImage.element,
        dragImage.offsetX,
        dragImage.offsetY,
      );
      window.setTimeout(dragImage.remove, 0);
    }

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", trackId);
    setDraggedTrackId(trackId);
  }

  function handleTrackDragOver(
    event: DragEvent<HTMLTableRowElement>,
    targetTrackId: string,
  ) {
    if (!draggedTrackId || draggedTrackId === targetTrackId) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragTarget({
      id: targetTrackId,
      placement: getDropPlacement(event),
    });
  }

  function handleTrackDrop(
    event: DragEvent<HTMLTableRowElement>,
    targetTrackId: string,
  ) {
    event.preventDefault();

    if (!draggedTrackId || draggedTrackId === targetTrackId) {
      resetTrackDrag();
      return;
    }

    const placement = getDropPlacement(event);

    updateSelectedRoomTracks((tracks) =>
      reorderTrack(tracks, draggedTrackId, targetTrackId, placement),
    );
    setStatus("Track order updated. Publish Changes to make it live.");
    resetTrackDrag();
  }

  async function getUploadUrl(batchId: string, relativePath: string) {
    const response = await fetch("/api/admin/audio/upload-url", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        batchId,
        relativePath,
        room: selectedRoom,
      }),
    });

    if (!response.ok) {
      const result = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new Error(result?.error ?? "Could not create upload URL.");
    }

    return (await response.json()) as UploadUrlResponse;
  }

  async function uploadNormalizedAudio(
    upload: UploadUrlResponse,
    blob: Blob,
    onRetry: (attempt: number) => void,
  ) {
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= directUploadAttempts; attempt += 1) {
      try {
        const uploadResponse = await fetch(upload.url, {
          method: "PUT",
          headers: upload.headers,
          body: blob,
        });

        if (uploadResponse.ok) {
          return;
        }

        const responseText = await uploadResponse.text().catch(() => "");
        lastError = new Error(
          `R2 upload failed with ${uploadResponse.status}${
            responseText ? `: ${responseText.slice(0, 240)}` : ""
          }`,
        );
      } catch (error) {
        lastError = error;
      }

      if (attempt < directUploadAttempts) {
        onRetry(attempt + 1);
        await wait(650 * attempt);
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(getErrorMessage(lastError));
  }

  function updateUploadRow(id: string, updates: Partial<UploadRow>) {
    setUploadRows((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...updates } : row)),
    );
  }

  async function processFiles(fileList: FileList | null) {
    if (!manifest || !fileList || isUploading) {
      return;
    }

    const files = Array.from(fileList)
      .filter((file) => /\.mp3$/i.test(file.name))
      .sort((first, second) =>
        fileCollator.compare(getRelativePath(first), getRelativePath(second)),
      );

    if (files.length === 0) {
      setStatus("Choose one or more MP3 files.");
      return;
    }

    const batchId = createBatchId();
    const rows = files.map((file) => ({
      fileName: getRelativePath(file),
      id: createTrackId(),
      message: "Queued",
      progress: 0,
      status: "queued" as const,
    }));
    const uploadedTracks: PlaylistManifestTrack[] = [];
    const failures: string[] = [];

    setUploadRows(rows);
    setIsUploading(true);
    setStatus(`Preparing ${files.length} MP3 file(s). Keep this tab open.`);

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const row = rows[index];
      const relativePath = getRelativePath(file);

      try {
        const uploadedMetadata = await extractUploadedTrackMetadata(file);

        updateUploadRow(row.id, {
          message: `Normalizing ${formatBytes(file.size)}`,
          progress: 0.05,
          status: "preparing",
        });

        const normalized = await normalizeMp3(file, (progress) => {
          updateUploadRow(row.id, {
            progress: Math.max(0.05, progress * 0.75),
          });
        });
        const upload = await getUploadUrl(batchId, relativePath);

        updateUploadRow(row.id, {
          message: `Uploading ${formatBytes(normalized.blob.size)}`,
          progress: 0.8,
          status: "uploading",
        });

        await uploadNormalizedAudio(upload, normalized.blob, (attempt) => {
          updateUploadRow(row.id, {
            message: `Retrying upload ${attempt}/${directUploadAttempts}`,
            progress: 0.8,
            status: "uploading",
          });
        });

        uploadedTracks.push({
          id: createTrackId(),
          title: stripTrackNumber(file.name),
          ...(uploadedMetadata.artist ? { artist: uploadedMetadata.artist } : {}),
          ...(getFolderAlbum(relativePath)
            ? { album: getFolderAlbum(relativePath) }
            : {}),
          key: upload.key,
          src: upload.key,
          durationSeconds: normalized.durationSeconds,
          enabled: true,
          originalFileName: file.name,
          uploadedAt: new Date().toISOString(),
        });

        updateUploadRow(row.id, {
          message: "Done",
          progress: 1,
          status: "done",
        });
      } catch (error) {
        const message = getErrorMessage(error);

        console.warn("[paper-planet-admin] Audio upload failed", {
          error: message,
          file: relativePath,
          room: selectedRoom,
        });
        failures.push(`${relativePath}: ${message}`);
        updateUploadRow(row.id, {
          message,
          status: "error",
        });
      }
    }

    setIsUploading(false);

    if (uploadedTracks.length === 0) {
      setStatus(
        failures.length > 0
          ? `No tracks were uploaded. First error: ${failures[0]}`
          : "No tracks were uploaded.",
      );
      return;
    }

    const nextPendingDeleteKeys = new Set(pendingDeleteKeys);

    const nextManifest: PlaylistManifest = {
      ...manifest,
      rooms: {
        ...manifest.rooms,
        [selectedRoom]: {
          ...manifest.rooms[selectedRoom],
          tracks: [...manifest.rooms[selectedRoom].tracks, ...uploadedTracks],
        },
      },
    };

    setHasUnsavedChanges(true);
    setPendingDeleteKeys(nextPendingDeleteKeys);
    setManifest(nextManifest);
    await publishManifest(nextManifest, nextPendingDeleteKeys);
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    void processFiles(event.target.files);
    event.target.value = "";
  }

  if (!manifest || !room) {
    return (
      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">Audio</h2>
        <p className="text-sm text-white/60">{status}</p>
      </section>
    );
  }

  return (
    <section className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Audio</h2>
          <p className="font-mono text-xs text-white/45">
            {source === "r2" ? "R2 manifest" : "Static fallback"} / updated{" "}
            {manifest.updatedAt}
          </p>
          {hasUnsavedChanges ? (
            <p className="mt-1 font-mono text-xs text-amber-200">
              Unsaved local draft
              {pendingDeleteKeys.size > 0
                ? ` / ${pendingDeleteKeys.size} R2 delete${
                    pendingDeleteKeys.size === 1 ? "" : "s"
                  } pending`
                : ""}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {hasUnsavedChanges ? (
            <button
              type="button"
              disabled={isSaving || isUploading}
              onClick={() => void discardLocalDraft()}
              className="border border-white/25 px-3 py-2 text-sm text-white/75 hover:border-white hover:text-white disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/35"
            >
              Discard Draft
            </button>
          ) : null}
          <button
            type="button"
            disabled={isSaving || isUploading || (!hasUnsavedChanges && source === "r2")}
            onClick={() => void publishManifest()}
            className="bg-white px-3 py-2 text-sm font-medium text-black transition hover:bg-white/85 disabled:cursor-not-allowed disabled:bg-white/30"
          >
            {isSaving ? "Publishing..." : "Publish Changes"}
          </button>
        </div>
      </div>

      <div className="grid gap-3 border border-white/10 bg-black p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-white/70">
            Room
            <select
              value={selectedRoom}
              onChange={(event) => {
                setSelectedRoom(event.target.value as SceneSlug);
                clearTrackSelection();
              }}
              disabled={isUploading}
              className="border border-white/20 bg-black px-3 py-2 text-white outline-none focus:border-white"
            >
              {roomSlugs.map((slug) => (
                <option key={slug} value={slug}>
                  {roomTitles[slug]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isUploading}
            onClick={() => audioInputRef.current?.click()}
            className="border border-white/25 px-3 py-2 text-sm transition hover:border-white disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/35"
          >
            Upload Audio
          </button>
          <input
            ref={audioInputRef}
            type="file"
            accept=".mp3,audio/mpeg"
            multiple
            className="hidden"
            onChange={handleFileInput}
          />
        </div>

        <p className="text-sm text-white/60">{status}</p>

        {uploadRows.length > 0 ? (
          <div className="grid gap-2">
            {uploadRows.map((row) => (
              <div key={row.id} className="grid gap-1 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="truncate">{row.fileName}</span>
                  <span
                    className={classNames(
                      "shrink-0 font-mono text-xs uppercase",
                      row.status === "error" ? "text-red-300" : "text-white/45",
                    )}
                  >
                    {row.status === "error" ? "Failed" : row.message}
                  </span>
                </div>
                {row.status === "error" ? (
                  <p className="font-mono text-xs leading-relaxed text-red-200">
                    {row.message}
                  </p>
                ) : null}
                <div className="h-1.5 overflow-hidden bg-white/10">
                  <div
                    className={classNames(
                      "h-full transition-all",
                      row.status === "error" ? "bg-red-300" : "bg-white",
                    )}
                    style={{ width: `${Math.round(row.progress * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold">{roomTitles[selectedRoom]}</h3>
          <p className="font-mono text-xs text-white/45">
            {room.tracks.filter((track) => track.enabled).length}/
            {room.tracks.length} active / {formatDuration(totalDuration)}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border border-white/10 bg-white/[0.03] px-3 py-2">
          <p className="font-mono text-xs text-white/55">
            {someTracksSelected
              ? `${selectedTrackCount} selected`
              : `${room.tracks.length} tracks`}
          </p>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              disabled={currentTrackIds.length === 0 || allTracksSelected}
              onClick={selectAllTracks}
              className="border border-white/15 px-2 py-1 text-xs text-white/70 hover:border-white/50 hover:text-white disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/30"
            >
              Select all
            </button>
            <button
              type="button"
              disabled={!someTracksSelected}
              onClick={clearTrackSelection}
              className="border border-white/15 px-2 py-1 text-xs text-white/70 hover:border-white/50 hover:text-white disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/30"
            >
              Clear
            </button>
            <button
              type="button"
              disabled={!someTracksSelected || isSaving || isUploading}
              onClick={() => updateSelectedTracks({ enabled: true })}
              className="border border-white/15 px-2 py-1 text-xs text-white/70 hover:border-white/50 hover:text-white disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/30"
            >
              Enable
            </button>
            <button
              type="button"
              disabled={!someTracksSelected || isSaving || isUploading}
              onClick={() => updateSelectedTracks({ enabled: false })}
              className="border border-white/15 px-2 py-1 text-xs text-white/70 hover:border-white/50 hover:text-white disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/30"
            >
              Disable
            </button>
            <button
              type="button"
              disabled={!someTracksSelected || isSaving || isUploading}
              onClick={removeSelectedTracks}
              className="border border-red-300/30 px-2 py-1 text-xs text-red-200 hover:border-red-200 disabled:cursor-not-allowed disabled:border-red-300/10 disabled:text-red-200/30"
            >
              Remove
            </button>
          </div>
        </div>

        <div className="overflow-x-auto border border-white/10">
          <table className="w-full min-w-[1040px] border-collapse text-sm">
            <thead className="bg-white/5 text-left text-xs uppercase tracking-[0.12em] text-white/45">
              <tr>
                <th className="w-10 px-3 py-2 font-medium">
                  <input
                    ref={selectAllTracksRef}
                    type="checkbox"
                    checked={allTracksSelected}
                    disabled={currentTrackIds.length === 0}
                    onChange={(event) =>
                      event.target.checked
                        ? selectAllTracks()
                        : clearTrackSelection()
                    }
                    className="size-4 accent-white disabled:opacity-30"
                    aria-label={`Select all ${roomTitles[selectedRoom]} tracks`}
                  />
                </th>
                <th className="w-12 px-3 py-2 font-medium">Sort</th>
                <th className="px-3 py-2 font-medium">Order</th>
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Artist</th>
                <th className="px-3 py-2 font-medium">Album</th>
                <th className="px-3 py-2 font-medium">Duration</th>
                <th className="px-3 py-2 font-medium">Key</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {room.tracks.map((track, index) => (
                <tr
                  key={track.id}
                  onDragOver={(event) => handleTrackDragOver(event, track.id)}
	                  onDrop={(event) => handleTrackDrop(event, track.id)}
	                  className={classNames(
	                    "border-t border-white/10 transition-none",
	                    !track.enabled && "bg-white/[0.025] opacity-45",
	                    selectedTrackIds.has(track.id) && "bg-white/[0.06]",
	                    draggedTrackId === track.id && "opacity-45",
                    dragTarget?.id === track.id &&
                      dragTarget.placement === "before" &&
                      "shadow-[inset_0_2px_0_rgba(255,255,255,0.75)]",
                    dragTarget?.id === track.id &&
                      dragTarget.placement === "after" &&
                      "shadow-[inset_0_-2px_0_rgba(255,255,255,0.75)]",
                  )}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedTrackIds.has(track.id)}
                      onChange={(event) =>
                        toggleTrackSelection(track.id, event.target.checked)
                      }
                      className="size-4 accent-white"
                      aria-label={`Select ${track.title}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      draggable={!isSaving && !isUploading}
                      onDragStart={(event) =>
                        handleTrackDragStart(event, track.id)
                      }
                      onDragEnd={resetTrackDrag}
                      disabled={isSaving || isUploading}
                      className="flex size-7 cursor-grab items-center justify-center border border-transparent text-white/45 hover:text-white/75 active:cursor-grabbing disabled:cursor-not-allowed disabled:text-white/20"
                      aria-label={`Drag ${track.title} to reorder`}
                      title="Drag to reorder"
                    >
                      <span
                        className="grid grid-cols-2 gap-x-1 gap-y-0.5"
                        aria-hidden="true"
                      >
                        {dragHandleDots.map((dot) => (
                          <span
                            key={dot}
                            className="size-1 rounded-full bg-current"
                          />
                        ))}
                      </span>
                    </button>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-white/50">
                    {index + 1}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={track.title}
                      onChange={(event) =>
                        updateTrack(track.id, { title: event.target.value })
                      }
                      className="w-full border border-white/10 bg-black px-2 py-1 text-white outline-none focus:border-white/50"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={track.artist ?? ""}
                      onChange={(event) =>
                        updateTrack(track.id, {
                          artist: event.target.value || undefined,
                        })
                      }
                      className="w-full border border-white/10 bg-black px-2 py-1 text-white outline-none focus:border-white/50"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={track.album ?? ""}
                      onChange={(event) =>
                        updateTrack(track.id, {
                          album: event.target.value || undefined,
                        })
                      }
                      className="w-full border border-white/10 bg-black px-2 py-1 text-white outline-none focus:border-white/50"
                    />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-white/55">
                    {formatDuration(track.durationSeconds)}
                  </td>
                  <td className="max-w-[18rem] truncate px-3 py-2 font-mono text-xs text-white/45">
                    {track.key}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          updateTrack(track.id, { enabled: !track.enabled })
                        }
                        className="border border-white/15 px-2 py-1 text-xs text-white/70 hover:border-white/50 hover:text-white"
                      >
                        {track.enabled ? "Disable" : "Enable"}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeTracks(new Set([track.id]))}
                        className="border border-red-300/30 px-2 py-1 text-xs text-red-200 hover:border-red-200"
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
