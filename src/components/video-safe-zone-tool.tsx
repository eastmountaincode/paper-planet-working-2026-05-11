"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
  type SyntheticEvent,
} from "react";
import {
  containsRect,
  formatAspect,
  formatPixels,
  getSpecMargins,
  getVisibleSourceRect,
  scaleSpecRect,
  VIDEO_FRAME_SPECS,
  VIEWPORT_PRESETS,
  type SourceRect,
} from "@/lib/video-frame-specs";

type LoadedVideo = {
  duration: number;
  height: number;
  name: string;
  size: number;
  url: string;
  width: number;
};

type ViewMode = "source" | "preview";

function percent(value: number, total: number) {
  return `${(value / Math.max(total, 1)) * 100}%`;
}

function rectStyle(
  rect: SourceRect,
  sourceWidth: number,
  sourceHeight: number,
): CSSProperties {
  return {
    left: percent(rect.x, sourceWidth),
    top: percent(rect.y, sourceHeight),
    width: percent(rect.width, sourceWidth),
    height: percent(rect.height, sourceHeight),
  };
}

function previewRectStyle(
  rect: SourceRect,
  visibleRect: SourceRect,
): CSSProperties {
  return {
    left: percent(rect.x - visibleRect.x, visibleRect.width),
    top: percent(rect.y - visibleRect.y, visibleRect.height),
    width: percent(rect.width, visibleRect.width),
    height: percent(rect.height, visibleRect.height),
  };
}

function formatDuration(duration: number) {
  if (!Number.isFinite(duration) || duration <= 0) {
    return "--:--";
  }

  const minutes = Math.floor(duration / 60);
  const seconds = Math.floor(duration % 60)
    .toString()
    .padStart(2, "0");

  return `${minutes}:${seconds}`;
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 MB";
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function writeClipboardText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  }
}

function CropMasks({
  rect,
  sourceHeight,
  sourceWidth,
}: {
  rect: SourceRect;
  sourceHeight: number;
  sourceWidth: number;
}) {
  const right = sourceWidth - rect.x - rect.width;
  const bottom = sourceHeight - rect.y - rect.height;
  const maskClass = "absolute bg-slate-950/62 backdrop-saturate-50";

  return (
    <>
      <div
        className={`${maskClass} inset-x-0 top-0`}
        style={{ height: percent(rect.y, sourceHeight) }}
      />
      <div
        className={`${maskClass} inset-x-0 bottom-0`}
        style={{ height: percent(bottom, sourceHeight) }}
      />
      <div
        className={`${maskClass} left-0`}
        style={{
          top: percent(rect.y, sourceHeight),
          width: percent(rect.x, sourceWidth),
          height: percent(rect.height, sourceHeight),
        }}
      />
      <div
        className={`${maskClass} right-0`}
        style={{
          top: percent(rect.y, sourceHeight),
          width: percent(right, sourceWidth),
          height: percent(rect.height, sourceHeight),
        }}
      />
    </>
  );
}

export function VideoSafeZoneTool() {
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [video, setVideo] = useState<LoadedVideo | null>(null);
  const [viewportAspect, setViewportAspect] = useState(0.46);
  const [viewMode, setViewMode] = useState<ViewMode>("source");
  const [isDragging, setIsDragging] = useState(false);
  const [copyStatus, setCopyStatus] = useState("Copy spec");

  const spec =
    video?.height && video.height > video.width
      ? VIDEO_FRAME_SPECS["portrait-export"]
      : VIDEO_FRAME_SPECS["landscape-export"];
  const sourceWidth = video?.width || spec.videoWidth;
  const sourceHeight = video?.height || spec.videoHeight;
  const visibleRect = useMemo(
    () =>
      getVisibleSourceRect(sourceWidth, sourceHeight, viewportAspect),
    [sourceHeight, sourceWidth, viewportAspect],
  );
  const safeRect = useMemo(
    () => scaleSpecRect(spec.safeRect, spec, sourceWidth, sourceHeight),
    [sourceHeight, sourceWidth, spec],
  );
  const safeZoneVisible = containsRect(visibleRect, safeRect);
  const margins = getSpecMargins(spec);
  const dimensionsMatch =
    !video?.width ||
    (video.width === spec.videoWidth && video.height === spec.videoHeight);
  const activePreset = VIEWPORT_PRESETS.find(
    (preset) => Math.abs(preset.aspect - viewportAspect) < 0.001,
  );

  useEffect(() => {
    return () => {
      if (video?.url) {
        URL.revokeObjectURL(video.url);
      }
    };
  }, [video?.url]);

  const loadFile = (file: File | undefined) => {
    if (!file || (!file.type.startsWith("video/") && !file.name.match(/\.(mp4|mov|m4v|webm)$/i))) {
      return;
    }

    const url = URL.createObjectURL(file);
    setVideo({
      duration: 0,
      height: 0,
      name: file.name,
      size: file.size,
      url,
      width: 0,
    });
  };

  const handleLoadedMetadata = (event: SyntheticEvent<HTMLVideoElement>) => {
    const element = event.currentTarget;
    const width = element.videoWidth;
    const height = element.videoHeight;

    setVideo((current) =>
      current
        ? {
            ...current,
            duration: element.duration,
            height,
            width,
          }
        : null,
    );
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    loadFile(event.target.files?.[0]);
    event.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsDragging(false);
    loadFile(event.dataTransfer.files?.[0]);
  };

  const copySpec = async () => {
    const text = [
      `Paper Planet video spec: ${spec.label}`,
      `Video: ${spec.videoWidth} x ${spec.videoHeight}px`,
      `Safe interaction area: ${spec.safeRect.width} x ${spec.safeRect.height}px`,
      `Margins: ${margins.left}px left / ${margins.right}px right / ${margins.top}px top / ${margins.bottom}px bottom`,
      `Supported viewport aspect: ${formatAspect(spec.minViewportAspect)} to ${formatAspect(spec.maxViewportAspect)}`,
      "Keep every clickable area, title, and required visual cue inside the safe interaction area. Ambient action may extend outside it.",
    ].join("\n");

    try {
      const copied = await writeClipboardText(text);

      if (!copied) {
        throw new Error("Clipboard unavailable");
      }

      setCopyStatus("Copied");
      window.setTimeout(() => setCopyStatus("Copy spec"), 1600);
    } catch {
      setCopyStatus("Copy failed");
      window.setTimeout(() => setCopyStatus("Copy spec"), 1600);
    }
  };

  const clearVideo = () => {
    videoRef.current?.pause();
    setVideo(null);
  };

  const sourceFrameStyle: CSSProperties = {
    aspectRatio: `${sourceWidth} / ${sourceHeight}`,
  };
  const previewFrameStyle: CSSProperties = {
    aspectRatio: `${viewportAspect}`,
  };
  const frameStyle = viewMode === "source" ? sourceFrameStyle : previewFrameStyle;
  const frameLabel =
    viewMode === "source"
      ? `${formatPixels(sourceWidth)} × ${formatPixels(sourceHeight)} source`
      : `${activePreset?.label ?? "Custom viewport"} · ${formatAspect(viewportAspect)}`;

  return (
    <main
      className="h-dvh overflow-y-auto bg-[#f3f1eb] text-slate-950"
      onDragEnter={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) {
          setIsDragging(false);
        }
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        className="hidden"
        type="file"
        accept="video/*,.mp4,.mov,.m4v,.webm"
        onChange={handleFileChange}
      />

      <header className="border-b border-slate-950/15 bg-[#f8f7f3] px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <h1 className="text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">
            Video frame checker
          </h1>
          <div className="flex flex-wrap gap-2">
            {video ? (
              <button
                type="button"
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium shadow-sm hover:bg-slate-50"
                onClick={clearVideo}
              >
                Remove video
              </button>
            ) : null}
            <button
              type="button"
              className="rounded-lg bg-slate-950 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
              onClick={() => inputRef.current?.click()}
            >
              {video ? "Choose another video" : "Choose video"}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-4 p-4 sm:p-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0 self-start rounded-2xl border border-slate-950/15 bg-white shadow-sm">
          <div className="border-b border-slate-950/10 p-3 sm:p-4">
            <div className="flex rounded-lg bg-slate-100 p-1">
              {(["source", "preview"] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={viewMode === mode}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    viewMode === mode
                      ? "bg-white text-slate-950 shadow-sm"
                      : "text-slate-600 hover:text-slate-950"
                  }`}
                  onClick={() => setViewMode(mode)}
                >
                  {mode === "source" ? "Source frame" : "Viewport preview"}
                </button>
              ))}
            </div>
          </div>

          <div
            className={`relative flex min-h-[520px] items-center justify-center overflow-hidden p-4 transition sm:p-8 ${
              isDragging ? "bg-cyan-50" : "bg-[#20242b]"
            }`}
          >
            <div
              className="relative flex max-h-[70dvh] max-w-full overflow-hidden rounded-md bg-slate-950 shadow-2xl ring-1 ring-white/15"
              style={{
                ...frameStyle,
                width:
                  viewMode === "source"
                    ? `min(100%, calc(70dvh * ${sourceWidth / sourceHeight}))`
                    : `min(100%, calc(70dvh * ${viewportAspect}))`,
                maxHeight: "70dvh",
              }}
            >
              {video ? (
                <video
                  ref={videoRef}
                  className={`absolute inset-0 size-full bg-black ${
                    viewMode === "source" ? "object-contain" : "object-cover"
                  }`}
                  src={video.url}
                  controls
                  playsInline
                  preload="metadata"
                  aria-label={`${video.name} preview`}
                  onLoadedMetadata={handleLoadedMetadata}
                />
              ) : (
                <button
                  type="button"
                  className="absolute inset-0 flex size-full flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_45%_35%,#3b4654,#111827_70%)] p-8 text-center text-white"
                  onClick={() => inputRef.current?.click()}
                >
                  <span className="grid size-12 place-items-center rounded-full border border-white/30 bg-white/10 text-2xl">
                    +
                  </span>
                  <span className="text-base font-semibold">Drop a video here</span>
                  <span className="max-w-56 text-sm leading-5 text-white/60">
                    or choose an MP4, MOV, M4V, or WebM from this computer
                  </span>
                </button>
              )}

              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                {viewMode === "source" ? (
                  <>
                    <CropMasks
                      rect={visibleRect}
                      sourceHeight={sourceHeight}
                      sourceWidth={sourceWidth}
                    />
                    <div
                      className="absolute border-2 border-cyan-300 shadow-[inset_0_0_0_1px_rgba(8,47,73,0.65)]"
                      style={rectStyle(
                        visibleRect,
                        sourceWidth,
                        sourceHeight,
                      )}
                    />
                    <div
                      className="absolute border-2 border-amber-300 bg-amber-300/10 shadow-[inset_0_0_0_1px_rgba(69,26,3,0.65)]"
                      style={rectStyle(safeRect, sourceWidth, sourceHeight)}
                    />
                  </>
                ) : (
                  <div
                    className={`absolute border-2 bg-amber-300/10 shadow-[inset_0_0_0_1px_rgba(69,26,3,0.7)] ${
                      safeZoneVisible ? "border-amber-300" : "border-red-400"
                    }`}
                    style={previewRectStyle(safeRect, visibleRect)}
                  />
                )}

                <div className="absolute left-2 top-2 rounded bg-slate-950/75 px-2 py-1 font-mono text-[10px] text-white backdrop-blur-sm">
                  {frameLabel}
                </div>
                <div
                  className={`absolute right-2 top-2 rounded px-2 py-1 font-mono text-[10px] font-semibold ${
                    safeZoneVisible
                      ? "bg-emerald-400 text-emerald-950"
                      : "bg-red-500 text-white"
                  }`}
                >
                  {safeZoneVisible ? "SAFE AREA VISIBLE" : "SAFE AREA CLIPPED"}
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 border-t border-slate-950/10 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <div className="mb-2 flex items-end justify-between gap-3">
                <label
                  htmlFor="aspect-ratio"
                  className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500"
                >
                  Simulated viewport
                </label>
                <span className="font-mono text-sm font-semibold">
                  {formatAspect(viewportAspect)} w/h
                </span>
              </div>
              <input
                id="aspect-ratio"
                className="w-full accent-slate-950"
                type="range"
                min="0.46"
                max="2"
                step="0.01"
                value={viewportAspect}
                onChange={(event) =>
                  setViewportAspect(Number(event.target.value))
                }
              />
            </div>
            <div className="flex flex-wrap gap-1.5 lg:max-w-[510px] lg:justify-end">
              {VIEWPORT_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  title={`${preset.label} (${preset.detail})`}
                  className={`rounded-md border px-2.5 py-1.5 text-xs font-medium ${
                    activePreset?.label === preset.label
                      ? "border-slate-950 bg-slate-950 text-white"
                      : "border-slate-300 bg-white text-slate-600 hover:border-slate-500 hover:text-slate-950"
                  }`}
                  onClick={() => setViewportAspect(preset.aspect)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-slate-950/15 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Dimensions</h2>
              <button
                type="button"
                className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
                onClick={copySpec}
              >
                {copyStatus}
              </button>
            </div>
            <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2.5 text-sm">
              <dt className="text-slate-500">Expected video</dt>
              <dd className="font-mono font-semibold">
                {spec.videoWidth} × {spec.videoHeight}
              </dd>
              <dt className="text-slate-500">Safe area</dt>
              <dd className="font-mono font-semibold text-amber-700">
                {spec.safeRect.width} × {spec.safeRect.height}
              </dd>
              <dt className="text-slate-500">Side margins</dt>
              <dd className="font-mono">
                {margins.left} / {margins.right}
              </dd>
              <dt className="text-slate-500">Top / bottom</dt>
              <dd className="font-mono">
                {margins.top} / {margins.bottom}
              </dd>
              <dt className="text-slate-500">Visible now</dt>
              <dd className="font-mono">
                {formatPixels(visibleRect.width)} × {formatPixels(visibleRect.height)}
              </dd>
            </dl>

            <div
              aria-live="polite"
              className={`mt-4 rounded-lg border p-3 text-xs leading-5 ${
                safeZoneVisible
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-red-200 bg-red-50 text-red-900"
              }`}
            >
              {safeZoneVisible
                ? `The full interaction area survives this ${formatAspect(viewportAspect)} viewport.`
                : `This ${formatAspect(viewportAspect)} viewport clips required content. Change the export, safe area, or source switch point.`}
            </div>
          </section>

          {video ? (
            <section className="rounded-2xl border border-slate-950/15 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold">Loaded file</h2>
              <p className="mt-2 truncate text-sm font-medium" title={video.name}>
                {video.name}
              </p>
              <p className="mt-1 font-mono text-xs text-slate-500">
                {video.width && video.height
                  ? `${video.width} × ${video.height} · ${formatDuration(video.duration)} · ${formatFileSize(video.size)}`
                  : `Reading metadata · ${formatFileSize(video.size)}`}
              </p>
              <p
                className={`mt-3 rounded-lg px-3 py-2 text-xs leading-5 ${
                  dimensionsMatch
                    ? "bg-emerald-50 text-emerald-900"
                    : "bg-amber-50 text-amber-950"
                }`}
              >
                {!video.width
                  ? "Reading this file’s dimensions."
                  : dimensionsMatch
                  ? `This file matches the ${spec.label.toLowerCase()} dimensions.`
                  : `This file does not match ${spec.videoWidth} × ${spec.videoHeight}. The overlay is scaled proportionally for inspection.`}
              </p>
            </section>
          ) : null}

        </aside>
      </div>
    </main>
  );
}
