"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { FFmpeg } from "@ffmpeg/ffmpeg";
import {
  createBatchId,
  createTrackId,
  getFolderAlbum,
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

function getRelativePath(file: File) {
  return file.webkitRelativePath || file.name;
}

function getInputProps(folder: boolean) {
  return folder
    ? ({
        directory: "",
        webkitdirectory: "",
      } as Record<string, string>)
    : {};
}

async function getFfmpeg() {
  if (!ffmpegPromise) {
    ffmpegPromise = Promise.all([
      import("@ffmpeg/ffmpeg"),
      import("@ffmpeg/util"),
    ]).then(async ([ffmpegModule]) => {
      const ffmpeg = new ffmpegModule.FFmpeg();
      await ffmpeg.load();
      return ffmpeg;
    });
  }

  return ffmpegPromise;
}

async function readTextFile(ffmpeg: FFmpeg, path: string) {
  const fileData = await ffmpeg.readFile(path, "utf8");

  return typeof fileData === "string"
    ? fileData
    : new TextDecoder().decode(fileData);
}

async function normalizeMp3(
  file: File,
  onProgress: (progress: number) => void,
): Promise<NormalizedAudio> {
  const [{ fetchFile }] = await Promise.all([import("@ffmpeg/util")]);
  const ffmpeg = await getFfmpeg();
  const id = createTrackId();
  const inputName = `${id}-input.mp3`;
  const outputName = `${id}-output.mp3`;
  const durationName = `${id}-duration.txt`;
  const progressHandler = ({ progress }: { progress: number }) => {
    if (Number.isFinite(progress)) {
      onProgress(Math.max(0, Math.min(0.95, progress)));
    }
  };

  ffmpeg.on("progress", progressHandler);

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
      throw new Error(`ffmpeg exited with code ${exitCode}`);
    }

    await ffmpeg.ffprobe([
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      outputName,
      "-o",
      durationName,
    ]);

    const durationSeconds = Number.parseFloat(
      (await readTextFile(ffmpeg, durationName)).trim(),
    );
    const outputData = await ffmpeg.readFile(outputName);

    if (!(outputData instanceof Uint8Array)) {
      throw new Error("ffmpeg did not return audio bytes.");
    }

    const outputBuffer = outputData.buffer.slice(
      outputData.byteOffset,
      outputData.byteOffset + outputData.byteLength,
    ) as ArrayBuffer;

    onProgress(1);

    return {
      blob: new Blob([outputBuffer], { type: "audio/mpeg" }),
      durationSeconds: Number.isFinite(durationSeconds)
        ? Number(durationSeconds.toFixed(3))
        : 0,
    };
  } finally {
    ffmpeg.off("progress", progressHandler);
    await Promise.allSettled([
      ffmpeg.deleteFile(inputName),
      ffmpeg.deleteFile(outputName),
      ffmpeg.deleteFile(durationName),
    ]);
  }
}

function moveTrack(
  tracks: PlaylistManifestTrack[],
  trackId: string,
  direction: -1 | 1,
) {
  const index = tracks.findIndex((track) => track.id === trackId);
  const nextIndex = index + direction;

  if (index < 0 || nextIndex < 0 || nextIndex >= tracks.length) {
    return tracks;
  }

  const nextTracks = [...tracks];
  const [track] = nextTracks.splice(index, 1);
  nextTracks.splice(nextIndex, 0, track);

  return nextTracks;
}

export function AudioAdmin() {
  const folderInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [manifest, setManifest] = useState<PlaylistManifest | null>(null);
  const [source, setSource] = useState<"r2" | "static">("static");
  const [selectedRoom, setSelectedRoom] = useState<SceneSlug>("construction");
  const [replaceOnUpload, setReplaceOnUpload] = useState(false);
  const [status, setStatus] = useState("Loading playlists...");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadRows, setUploadRows] = useState<UploadRow[]>([]);

  const room = manifest?.rooms[selectedRoom] ?? null;
  const totalDuration = useMemo(
    () =>
      room?.tracks
        .filter((track) => track.enabled)
        .reduce((total, track) => total + track.durationSeconds, 0) ?? 0,
    [room?.tracks],
  );

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
        setStatus(
          result.source === "r2"
            ? "Loaded published playlist manifest."
            : "Loaded static fallback manifest.",
        );
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

  function updateSelectedRoomTracks(
    updater:
      | PlaylistManifestTrack[]
      | ((tracks: PlaylistManifestTrack[]) => PlaylistManifestTrack[]),
  ) {
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

  async function publishManifest(nextManifest = manifest) {
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

    setIsSaving(false);

    if (!response.ok) {
      const result = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      setStatus(result?.error ?? "Publish failed.");
      return;
    }

    const result = (await response.json()) as PlaylistResponse;
    setManifest(result.manifest);
    setSource("r2");
    setStatus("Playlist manifest published.");
  }

  function updateTrack(trackId: string, updates: Partial<PlaylistManifestTrack>) {
    updateSelectedRoomTracks((tracks) =>
      tracks.map((track) =>
        track.id === trackId ? { ...track, ...updates } : track,
      ),
    );
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

    setUploadRows(rows);
    setIsUploading(true);
    setStatus(`Preparing ${files.length} MP3 file(s). Keep this tab open.`);

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const row = rows[index];
      const relativePath = getRelativePath(file);

      try {
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

        const uploadResponse = await fetch(upload.url, {
          method: "PUT",
          headers: upload.headers,
          body: normalized.blob,
        });

        if (!uploadResponse.ok) {
          throw new Error(`R2 upload failed with ${uploadResponse.status}`);
        }

        uploadedTracks.push({
          id: createTrackId(),
          title: stripTrackNumber(file.name),
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
        updateUploadRow(row.id, {
          message: error instanceof Error ? error.message : "Upload failed",
          status: "error",
        });
      }
    }

    setIsUploading(false);

    if (uploadedTracks.length === 0) {
      setStatus("No tracks were uploaded.");
      return;
    }

    const nextManifest: PlaylistManifest = {
      ...manifest,
      rooms: {
        ...manifest.rooms,
        [selectedRoom]: {
          ...manifest.rooms[selectedRoom],
          tracks: replaceOnUpload
            ? uploadedTracks
            : [...manifest.rooms[selectedRoom].tracks, ...uploadedTracks],
        },
      },
    };

    setManifest(nextManifest);
    await publishManifest(nextManifest);
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
        </div>
        <button
          type="button"
          disabled={isSaving || isUploading}
          onClick={() => void publishManifest()}
          className="bg-white px-3 py-2 text-sm font-medium text-black transition hover:bg-white/85 disabled:cursor-not-allowed disabled:bg-white/30"
        >
          {isSaving ? "Publishing..." : "Publish Changes"}
        </button>
      </div>

      <div className="grid gap-3 border border-white/10 bg-black p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-white/70">
            Room
            <select
              value={selectedRoom}
              onChange={(event) => setSelectedRoom(event.target.value as SceneSlug)}
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
          <label className="flex items-center gap-2 text-sm text-white/70">
            <input
              type="checkbox"
              checked={replaceOnUpload}
              onChange={(event) => setReplaceOnUpload(event.target.checked)}
              className="size-4 accent-white"
            />
            Replace this room on upload
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isUploading}
            onClick={() => folderInputRef.current?.click()}
            className="border border-white/25 px-3 py-2 text-sm transition hover:border-white disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/35"
          >
            Upload Folder
          </button>
          <button
            type="button"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            className="border border-white/25 px-3 py-2 text-sm transition hover:border-white disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/35"
          >
            Upload Files
          </button>
          <input
            ref={folderInputRef}
            type="file"
            accept=".mp3,audio/mpeg"
            multiple
            className="hidden"
            onChange={handleFileInput}
            {...getInputProps(true)}
          />
          <input
            ref={fileInputRef}
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
                    {row.message}
                  </span>
                </div>
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

        <div className="overflow-x-auto border border-white/10">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead className="bg-white/5 text-left text-xs uppercase tracking-[0.12em] text-white/45">
              <tr>
                <th className="px-3 py-2 font-medium">Order</th>
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Album</th>
                <th className="px-3 py-2 font-medium">Duration</th>
                <th className="px-3 py-2 font-medium">Key</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {room.tracks.map((track, index) => (
                <tr key={track.id} className="border-t border-white/10">
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
                          updateSelectedRoomTracks((tracks) =>
                            moveTrack(tracks, track.id, -1),
                          )
                        }
                        className="border border-white/15 px-2 py-1 text-xs text-white/70 hover:border-white/50 hover:text-white"
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateSelectedRoomTracks((tracks) =>
                            moveTrack(tracks, track.id, 1),
                          )
                        }
                        className="border border-white/15 px-2 py-1 text-xs text-white/70 hover:border-white/50 hover:text-white"
                      >
                        Down
                      </button>
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
                        onClick={() =>
                          updateSelectedRoomTracks((tracks) =>
                            tracks.filter((item) => item.id !== track.id),
                          )
                        }
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
