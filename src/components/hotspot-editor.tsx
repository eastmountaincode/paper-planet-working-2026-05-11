"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import type {
  Hotspot,
  PercentPoint,
  PolygonHotspot,
  SceneSlug,
} from "@/lib/scenes";
import { sceneSlugs, scenes } from "@/lib/scenes";

const emptyPolygon = (scene: SceneSlug, index: number): PolygonHotspot => ({
  id: `${scene}-hotspot-${Date.now().toString(36)}-${index + 1}`,
  label: "New hotspot",
  shape: "polygon",
  points: [],
  action: {
    type: "navigate",
    target: scene === "construction" ? "hq" : "construction",
  },
});

const percent = (value: number) => Number(value.toFixed(2));

const pointsToString = (points: PercentPoint[]) =>
  points.map((point) => `${point.x},${point.y}`).join(" ");

const storageKey = (scene: SceneSlug) => `paper-planet-hotspot-drafts:${scene}`;

const emptyDraftsByScene = (): Record<SceneSlug, PolygonHotspot[]> => ({
  construction: [],
  hq: [],
});

const loadDraftsByScene = () => {
  const draftsByScene = emptyDraftsByScene();

  if (typeof window === "undefined") {
    return draftsByScene;
  }

  for (const slug of sceneSlugs) {
    const stored = window.localStorage.getItem(storageKey(slug));
    draftsByScene[slug] = stored
      ? (JSON.parse(stored) as PolygonHotspot[])
      : [];
  }

  return draftsByScene;
};

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) {
    return "0:00";
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");

  return `${minutes}:${remainingSeconds}`;
}

function getHotspotLabel(hotspot: Hotspot) {
  if (hotspot.action.type === "navigate") {
    return `goes to ${scenes[hotspot.action.target].title}`;
  }

  return `emails ${hotspot.action.email}`;
}

function normalizeDrawnPoints(points: PercentPoint[]) {
  if (points.length !== 2) {
    return points;
  }

  const [start, end] = points;
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);

  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

export function HotspotEditor() {
  const [sceneSlug, setSceneSlug] = useState<SceneSlug>("construction");
  const [draftsByScene, setDraftsByScene] = useState(loadDraftsByScene);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activePoints, setActivePoints] = useState<PercentPoint[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  const scene = scenes[sceneSlug];
  const drafts = draftsByScene[sceneSlug];
  const selectedDraft = drafts.find((draft) => draft.id === selectedId) ?? null;
  const aspectRatio = useMemo(
    () => `${scene.video.width} / ${scene.video.height}`,
    [scene.video.height, scene.video.width],
  );

  useEffect(() => {
    window.localStorage.setItem(storageKey(sceneSlug), JSON.stringify(drafts));
  }, [drafts, sceneSlug]);

  function setSceneDrafts(
    updater:
      | PolygonHotspot[]
      | ((currentDrafts: PolygonHotspot[]) => PolygonHotspot[]),
  ) {
    setDraftsByScene((currentByScene) => {
      const currentDrafts = currentByScene[sceneSlug];
      const nextDrafts =
        typeof updater === "function" ? updater(currentDrafts) : updater;

      return {
        ...currentByScene,
        [sceneSlug]: nextDrafts,
      };
    });
  }

  function pointFromEvent(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();

    return {
      x: percent(((event.clientX - rect.left) / rect.width) * 100),
      y: percent(((event.clientY - rect.top) / rect.height) * 100),
    };
  }

  function distance(a: PercentPoint, b: PercentPoint) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function handlePointerDown(event: PointerEvent<SVGSVGElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDrawing(true);
    setActivePoints([pointFromEvent(event)]);
    setCopyStatus("");
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (!isDrawing) {
      return;
    }

    const nextPoint = pointFromEvent(event);

    setActivePoints((points) => {
      const previousPoint = points.at(-1);

      if (previousPoint && distance(previousPoint, nextPoint) < 0.55) {
        return points;
      }

      return [...points, nextPoint];
    });
  }

  function handlePointerUp(event: PointerEvent<SVGSVGElement>) {
    if (!isDrawing) {
      return;
    }

    event.currentTarget.releasePointerCapture(event.pointerId);
    setIsDrawing(false);

    setActivePoints((points) => {
      if (points.length < 2) {
        return [];
      }

      const normalizedPoints = normalizeDrawnPoints(points);

      const nextDraft = {
        ...emptyPolygon(sceneSlug, drafts.length),
        points: normalizedPoints,
      };

      setSceneDrafts((currentDrafts) => [...currentDrafts, nextDraft]);
      setSelectedId(nextDraft.id);
      return [];
    });
  }

  function updateSelectedDraft(updates: Partial<PolygonHotspot>) {
    if (!selectedDraft) {
      return;
    }

    setSceneDrafts((currentDrafts) =>
      currentDrafts.map((draft) =>
        draft.id === selectedDraft.id ? { ...draft, ...updates } : draft,
      ),
    );
  }

  function updateSelectedAction(action: PolygonHotspot["action"]) {
    updateSelectedDraft({ action });
  }

  async function copyText(text: string, message: string) {
    await navigator.clipboard.writeText(text);
    setCopyStatus(message);
  }

  function copySelected() {
    if (!selectedDraft) {
      setCopyStatus("Select a draft hotspot first.");
      return;
    }

    void copyText(JSON.stringify(selectedDraft, null, 2), "Copied hotspot.");
  }

  function copyAll() {
    const allHotspots = [...scene.hotspots, ...drafts];
    void copyText(
      `hotspots: ${JSON.stringify(allHotspots, null, 2)}`,
      "Copied full hotspots array.",
    );
  }

  function clearDrafts() {
    setSceneDrafts([]);
    setSelectedId(null);
    setCopyStatus("Cleared local drafts.");
  }

  function seekTo(value: number) {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    video.currentTime = value;
    setCurrentTime(value);
  }

  function togglePlayback() {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    if (video.paused) {
      void video.play();
      setIsPlaying(true);
      return;
    }

    video.pause();
    setIsPlaying(false);
  }

  return (
    <main className="min-h-dvh bg-[#161410] text-[#f5efe2]">
      <div className="mx-auto grid min-h-dvh w-full max-w-[1720px] gap-5 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_390px]">
        <section className="flex min-w-0 flex-col gap-4">
          <nav className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href={`/rooms/${sceneSlug}?hotspots=1`}
              className="font-mono text-xs uppercase tracking-[0.24em] text-[#d9c9a3]"
            >
              Paper Planet Hotspot Tool
            </Link>
            <label className="flex items-center gap-2 text-sm text-[#f5efe2]/70">
              Scene
              <select
                value={sceneSlug}
                onChange={(event) => {
                  setSceneSlug(event.target.value as SceneSlug);
                  setSelectedId(null);
                  setActivePoints([]);
                  setIsDrawing(false);
                  setCopyStatus("");
                }}
                className="rounded-sm border border-[#f5efe2]/20 bg-[#242018] px-3 py-2 text-[#f5efe2] outline-none"
              >
                {sceneSlugs.map((slug) => (
                  <option key={slug} value={slug}>
                    {scenes[slug].title}
                  </option>
                ))}
              </select>
            </label>
          </nav>

          <div
            className="relative mx-auto w-full max-w-[min(100%,calc(100dvh-9rem))] overflow-hidden bg-black shadow-2xl shadow-black/45 touch-none"
            style={{ aspectRatio }}
          >
            <video
              key={scene.video.src}
              ref={videoRef}
              className="absolute inset-0 h-full w-full object-cover"
              src={scene.video.src}
              muted
              loop
              playsInline
              preload="metadata"
              onLoadedMetadata={(event) => {
                setDuration(event.currentTarget.duration);
                setCurrentTime(event.currentTarget.currentTime);
              }}
              onTimeUpdate={(event) =>
                setCurrentTime(event.currentTarget.currentTime)
              }
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            />

            <svg
              className="absolute inset-0 h-full w-full cursor-crosshair"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={() => {
                setIsDrawing(false);
                setActivePoints([]);
              }}
            >
              {scene.hotspots.map((hotspot) =>
                hotspot.shape === "rect" ? (
                  <rect
                    key={hotspot.id}
                    x={hotspot.rect.x}
                    y={hotspot.rect.y}
                    width={hotspot.rect.width}
                    height={hotspot.rect.height}
                    fill="rgba(247, 211, 106, 0.15)"
                    stroke="rgba(247, 211, 106, 0.9)"
                    strokeWidth="0.28"
                    vectorEffect="non-scaling-stroke"
                  />
                ) : (
                  <polygon
                    key={hotspot.id}
                    points={pointsToString(hotspot.points)}
                    fill="rgba(247, 211, 106, 0.15)"
                    stroke="rgba(247, 211, 106, 0.9)"
                    strokeWidth="0.28"
                    vectorEffect="non-scaling-stroke"
                  />
                ),
              )}

              {drafts.map((draft) => (
                <polygon
                  key={draft.id}
                  points={pointsToString(draft.points)}
                  fill={
                    draft.id === selectedId
                      ? "rgba(73, 222, 128, 0.26)"
                      : "rgba(56, 189, 248, 0.18)"
                  }
                  stroke={
                    draft.id === selectedId
                      ? "rgba(134, 239, 172, 1)"
                      : "rgba(56, 189, 248, 0.95)"
                  }
                  strokeWidth="0.32"
                  vectorEffect="non-scaling-stroke"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    setSelectedId(draft.id);
                  }}
                />
              ))}

              {activePoints.length > 1 ? (
                <polyline
                  points={pointsToString(activePoints)}
                  fill="none"
                  stroke="rgba(134, 239, 172, 1)"
                  strokeWidth="0.42"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
            </svg>
          </div>

          <div className="grid gap-3 border-t border-[#f5efe2]/10 pt-3 font-mono text-xs text-[#f5efe2]/70 sm:grid-cols-[auto_1fr_auto] sm:items-center">
            <button
              type="button"
              onClick={togglePlayback}
              className="rounded-sm border border-[#f5efe2]/20 px-3 py-2 text-[#f5efe2] transition hover:border-[#f5efe2]/50"
            >
              {isPlaying ? "Pause" : "Play"}
            </button>
            <input
              type="range"
              min={0}
              max={duration || scene.video.durationSeconds}
              step={0.1}
              value={currentTime}
              onChange={(event) => seekTo(Number(event.target.value))}
              className="w-full accent-[#d9c9a3]"
              aria-label="Video time"
            />
            <p>
              {formatTime(currentTime)} /{" "}
              {formatTime(duration || scene.video.durationSeconds)}
            </p>
          </div>
        </section>

        <aside className="flex min-h-0 flex-col gap-4 border border-[#f5efe2]/10 bg-black/20 p-4">
          <div>
            <h1 className="text-lg font-semibold">Draw Clickable Areas</h1>
            <p className="mt-2 text-sm leading-6 text-[#f5efe2]/70">
              Pause on the useful frame, draw around the target, then assign the
              action. Drafts save in this browser until copied into scene data.
            </p>
          </div>

          <div className="grid gap-2">
            <button
              type="button"
              onClick={copyAll}
              className="rounded-sm bg-[#d9c9a3] px-3 py-2 text-sm font-medium text-[#161410] transition hover:bg-[#f5efe2]"
            >
              Copy Scene Hotspots
            </button>
            <button
              type="button"
              onClick={copySelected}
              className="rounded-sm border border-[#f5efe2]/20 px-3 py-2 text-sm transition hover:border-[#f5efe2]/50"
            >
              Copy Selected Draft
            </button>
            <button
              type="button"
              onClick={clearDrafts}
              className="rounded-sm border border-[#f97316]/40 px-3 py-2 text-sm text-[#fdba74] transition hover:border-[#fdba74]"
            >
              Clear Drafts
            </button>
            {copyStatus ? (
              <p className="font-mono text-xs text-[#86efac]">{copyStatus}</p>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-auto border-t border-[#f5efe2]/10 pt-4">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-[#d9c9a3]">
              Drafts
            </h2>
            <div className="grid gap-2">
              {drafts.length ? (
                drafts.map((draft) => (
                  <button
                    key={draft.id}
                    type="button"
                    onClick={() => setSelectedId(draft.id)}
                    className={[
                      "rounded-sm border px-3 py-2 text-left text-sm transition",
                      draft.id === selectedId
                        ? "border-[#86efac] bg-[#86efac]/10"
                        : "border-[#f5efe2]/10 hover:border-[#f5efe2]/35",
                    ].join(" ")}
                  >
                    <span className="block font-medium">{draft.label}</span>
                    <span className="text-xs text-[#f5efe2]/55">
                      {draft.points.length} points, {getHotspotLabel(draft)}
                    </span>
                  </button>
                ))
              ) : (
                <p className="text-sm text-[#f5efe2]/55">No draft shapes yet.</p>
              )}
            </div>
          </div>

          {selectedDraft ? (
            <form className="grid gap-3 border-t border-[#f5efe2]/10 pt-4">
              <label className="grid gap-1 text-sm">
                ID
                <input
                  value={selectedDraft.id}
                  onChange={(event) => {
                    updateSelectedDraft({ id: event.target.value });
                    setSelectedId(event.target.value);
                  }}
                  className="rounded-sm border border-[#f5efe2]/15 bg-[#242018] px-3 py-2 outline-none focus:border-[#d9c9a3]"
                />
              </label>
              <label className="grid gap-1 text-sm">
                Label
                <input
                  value={selectedDraft.label}
                  onChange={(event) =>
                    updateSelectedDraft({ label: event.target.value })
                  }
                  className="rounded-sm border border-[#f5efe2]/15 bg-[#242018] px-3 py-2 outline-none focus:border-[#d9c9a3]"
                />
              </label>
              <label className="grid gap-1 text-sm">
                Action
                <select
                  value={selectedDraft.action.type}
                  onChange={(event) => {
                    if (event.target.value === "mailto") {
                      updateSelectedAction({
                        type: "mailto",
                        email: "paperplanetrecords@gmail.com",
                        subject: "Paper Planet Records",
                      });
                      return;
                    }

                    updateSelectedAction({
                      type: "navigate",
                      target: sceneSlug === "construction" ? "hq" : "construction",
                    });
                  }}
                  className="rounded-sm border border-[#f5efe2]/15 bg-[#242018] px-3 py-2 outline-none focus:border-[#d9c9a3]"
                >
                  <option value="navigate">Navigate to scene</option>
                  <option value="mailto">Open email prompt</option>
                </select>
              </label>

              {selectedDraft.action.type === "navigate" ? (
                <label className="grid gap-1 text-sm">
                  Destination
                  <select
                    value={selectedDraft.action.target}
                    onChange={(event) =>
                      updateSelectedAction({
                        type: "navigate",
                        target: event.target.value as SceneSlug,
                      })
                    }
                    className="rounded-sm border border-[#f5efe2]/15 bg-[#242018] px-3 py-2 outline-none focus:border-[#d9c9a3]"
                  >
                    {sceneSlugs.map((slug) => (
                      <option key={slug} value={slug}>
                        {scenes[slug].title}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <>
                  <label className="grid gap-1 text-sm">
                    Email
                    <input
                      value={selectedDraft.action.email}
                      onChange={(event) =>
                        updateSelectedAction({
                          type: "mailto",
                          email: event.target.value,
                          subject:
                            selectedDraft.action.type === "mailto"
                              ? selectedDraft.action.subject
                              : undefined,
                        })
                      }
                      className="rounded-sm border border-[#f5efe2]/15 bg-[#242018] px-3 py-2 outline-none focus:border-[#d9c9a3]"
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Subject
                    <input
                      value={selectedDraft.action.subject ?? ""}
                      onChange={(event) =>
                        updateSelectedAction({
                          type: "mailto",
                          email:
                            selectedDraft.action.type === "mailto"
                              ? selectedDraft.action.email
                              : "paperplanetrecords@gmail.com",
                          subject: event.target.value,
                        })
                      }
                      className="rounded-sm border border-[#f5efe2]/15 bg-[#242018] px-3 py-2 outline-none focus:border-[#d9c9a3]"
                    />
                  </label>
                </>
              )}
            </form>
          ) : null}
        </aside>
      </div>
    </main>
  );
}
