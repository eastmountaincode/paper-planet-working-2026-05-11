"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import enterHotspotsData from "@/lib/enter-hotspots.json";
import type {
  Hotspot,
  HotspotAction,
  PercentPoint,
  PolygonHotspot,
  SceneSlug,
} from "@/lib/scenes";
import { sceneSlugs, scenes } from "@/lib/scenes";

type HotspotTarget = SceneSlug | "enter";

const hotspotTargets: HotspotTarget[] = ["enter", ...sceneSlugs];
const targetLabels: Record<HotspotTarget, string> = {
  enter: "Enter Page",
  construction: scenes.construction.title,
  hq: scenes.hq.title,
};
const enterHotspots = enterHotspotsData as Hotspot[];
const enterArtwork = {
  src: "/enter/paper-planet-enter.webp",
  width: 1173,
  height: 868,
};

const editorStorageKey = (target: HotspotTarget) =>
  `paper-planet-hotspots-v2:${target}`;
const hiddenStorageKey = (target: HotspotTarget) =>
  `paper-planet-hotspots-hidden:${target}`;
const legacyDraftStorageKey = (target: HotspotTarget) =>
  `paper-planet-hotspot-drafts:${target}`;

const emptyHotspotsByTarget = (): Record<HotspotTarget, Hotspot[]> => ({
  enter: [],
  construction: [],
  hq: [],
});

const emptyHiddenIdsByTarget = (): Record<HotspotTarget, string[]> => ({
  enter: [],
  construction: [],
  hq: [],
});

const percent = (value: number) => Number(value.toFixed(2));

const pointsToString = (points: PercentPoint[]) =>
  points.map((point) => `${point.x},${point.y}`).join(" ");

function createHotspotId(target: HotspotTarget) {
  const fallbackId = `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : fallbackId;

  return `${target}-hotspot-${id}`;
}

function createPolygonHotspot(target: HotspotTarget): PolygonHotspot {
  return {
    id: createHotspotId(target),
    label: target === "enter" ? "Enter Paper Planet" : "New hotspot",
    zIndex: 0,
    shape: "polygon",
    points: [],
    action: {
      type: "navigate",
      target: target === "construction" ? "hq" : "construction",
    },
  };
}

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

function getHotspotActionLabel(hotspot: Hotspot) {
  if (hotspot.action.type === "navigate") {
    return `goes to ${scenes[hotspot.action.target].title}`;
  }

  return `emails ${hotspot.action.email}`;
}

function getHotspotPointCount(hotspot: Hotspot) {
  return hotspot.shape === "polygon" ? hotspot.points.length : 4;
}

function getHotspotZIndex(hotspot: Hotspot) {
  return hotspot.zIndex ?? 0;
}

function sortHotspotsByZOrder(hotspots: Hotspot[]) {
  return [...hotspots].sort(
    (a, b) => getHotspotZIndex(a) - getHotspotZIndex(b),
  );
}

function sortHotspotsFrontFirst(hotspots: Hotspot[]) {
  return [...hotspots].sort(
    (a, b) => getHotspotZIndex(b) - getHotspotZIndex(a),
  );
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

function hotspotSignature(hotspot: Hotspot) {
  return JSON.stringify({
    shape: hotspot.shape,
    zIndex: getHotspotZIndex(hotspot),
    action: hotspot.action,
    geometry:
      hotspot.shape === "polygon"
        ? hotspot.points
        : {
            x: hotspot.rect.x,
            y: hotspot.rect.y,
            width: hotspot.rect.width,
            height: hotspot.rect.height,
          },
  });
}

function withUniqueHotspotIds(target: HotspotTarget, hotspots: Hotspot[]) {
  const ids = new Set<string>();

  return hotspots.map((hotspot) => {
    if (!ids.has(hotspot.id)) {
      ids.add(hotspot.id);
      return hotspot;
    }

    const nextHotspot = {
      ...hotspot,
      id: createHotspotId(target),
    } as Hotspot;

    ids.add(nextHotspot.id);
    return nextHotspot;
  });
}

function dedupeHotspots(target: HotspotTarget, hotspots: Hotspot[]) {
  const signatureIndexes = new Map<string, number>();
  const uniqueHotspots: Hotspot[] = [];

  for (const hotspot of hotspots) {
    const signature = hotspotSignature(hotspot);
    const existingIndex = signatureIndexes.get(signature);

    if (existingIndex !== undefined) {
      const existingHotspot = uniqueHotspots[existingIndex];

      if (
        existingHotspot.label === "New hotspot" &&
        hotspot.label !== "New hotspot"
      ) {
        uniqueHotspots[existingIndex] = hotspot;
      }

      continue;
    }

    signatureIndexes.set(signature, uniqueHotspots.length);
    uniqueHotspots.push(hotspot);
  }

  return withUniqueHotspotIds(target, uniqueHotspots);
}

function parseStoredHotspots(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as Hotspot[]) : null;
  } catch {
    return null;
  }
}

function parseStoredHiddenIds(value: string | null) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function loadHotspotsByTarget() {
  const hotspotsByTarget = emptyHotspotsByTarget();

  hotspotsByTarget.enter = enterHotspots;
  for (const slug of sceneSlugs) {
    hotspotsByTarget[slug] = scenes[slug].hotspots;
  }

  return hotspotsByTarget;
}

function loadStoredHotspotsByTarget() {
  const hotspotsByTarget = loadHotspotsByTarget();

  if (typeof window === "undefined") {
    return hotspotsByTarget;
  }

  for (const target of hotspotTargets) {
    const storedHotspots = parseStoredHotspots(
      window.localStorage.getItem(editorStorageKey(target)),
    );

    if (storedHotspots) {
      hotspotsByTarget[target] = dedupeHotspots(target, storedHotspots);
      continue;
    }

    const legacyDrafts = parseStoredHotspots(
      window.localStorage.getItem(legacyDraftStorageKey(target)),
    );

    hotspotsByTarget[target] = dedupeHotspots(target, [
      ...hotspotsByTarget[target],
      ...(legacyDrafts ?? []),
    ]);
  }

  return hotspotsByTarget;
}

function loadHiddenIdsByTarget() {
  return emptyHiddenIdsByTarget();
}

function loadStoredHiddenIdsByTarget() {
  const hiddenIdsByTarget = emptyHiddenIdsByTarget();

  if (typeof window === "undefined") {
    return hiddenIdsByTarget;
  }

  for (const target of hotspotTargets) {
    hiddenIdsByTarget[target] = parseStoredHiddenIds(
      window.localStorage.getItem(hiddenStorageKey(target)),
    );
  }

  return hiddenIdsByTarget;
}

function serializeHotspots(hotspots: Hotspot[]) {
  return JSON.stringify(hotspots, null, 2);
}

type HotspotEditorSidebarProps = {
  target: HotspotTarget;
  hotspots: Hotspot[];
  hotspotsFrontFirst: Hotspot[];
  hiddenIds: string[];
  selectedId: string | null;
  selectedHotspot: Hotspot | null;
  status: string;
  onSaveToAppFile: () => void;
  onCopySceneHotspots: () => void;
  onCopySelected: () => void;
  onResetToAppHotspots: () => void;
  onClearHotspots: () => void;
  onSelectHotspot: (id: string) => void;
  onToggleHidden: (id: string) => void;
  onDeleteHotspot: (id: string) => void;
  onUpdateSelectedHotspot: (updates: Partial<Hotspot>) => void;
  onUpdateSelectedAction: (action: HotspotAction) => void;
  onMoveSelectedZIndex: (direction: "back" | "front") => void;
};

function HotspotEditorSidebar({
  target,
  hotspots,
  hotspotsFrontFirst,
  hiddenIds,
  selectedId,
  selectedHotspot,
  status,
  onSaveToAppFile,
  onCopySceneHotspots,
  onCopySelected,
  onResetToAppHotspots,
  onClearHotspots,
  onSelectHotspot,
  onToggleHidden,
  onDeleteHotspot,
  onUpdateSelectedHotspot,
  onUpdateSelectedAction,
  onMoveSelectedZIndex,
}: HotspotEditorSidebarProps) {
  const isEnterTarget = target === "enter";

  return (
    <aside className="min-h-0 overflow-y-auto overscroll-contain bg-black p-4">
      <div className="border-b border-white/15 pb-4">
        <h1 className="text-lg font-semibold">Hotspot Editor</h1>
        <p className="mt-2 text-sm leading-6 text-white/65">
          Draw on the media to create a clickable area. Select a hotspot to
          rename it, change its action, hide it, delete it, or save the current
          target back into the app.
        </p>
      </div>

      <div className="grid gap-2 border-b border-white/15 py-4">
        <button
          type="button"
          onClick={onSaveToAppFile}
          className="bg-white px-3 py-2 text-sm font-medium text-black transition hover:bg-white/85"
        >
          Save Hotspots to App
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCopySceneHotspots}
            className="border border-white/25 px-3 py-2 text-sm transition hover:border-white"
          >
            Copy Scene JSON
          </button>
          <button
            type="button"
            onClick={onCopySelected}
            className="border border-white/25 px-3 py-2 text-sm transition hover:border-white"
          >
            Copy Selected JSON
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onResetToAppHotspots}
            className="border border-white/25 px-3 py-2 text-sm transition hover:border-white"
          >
            Reset to App
          </button>
          <button
            type="button"
            onClick={onClearHotspots}
            className="border border-white/25 px-3 py-2 text-sm transition hover:border-white"
          >
              Clear Target
          </button>
        </div>
        {status ? <p className="font-mono text-xs text-white/70">{status}</p> : null}
      </div>

      <div className="border-b border-white/15 py-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-white/70">
          Hotspots
        </h2>
        <div className="grid gap-2">
          {hotspots.length ? (
            hotspotsFrontFirst.map((hotspot) => {
              const isHidden = hiddenIds.includes(hotspot.id);

              return (
                <div
                  key={hotspot.id}
                  className={[
                    "grid gap-2 border p-3 text-sm transition",
                    hotspot.id === selectedId
                      ? "border-white bg-white/10"
                      : "border-white/15",
                  ].join(" ")}
                >
                  <button
                    type="button"
                    onClick={() => onSelectHotspot(hotspot.id)}
                    className="text-left"
                  >
                    <span className="block font-medium">{hotspot.label}</span>
                    <span className="text-xs text-white/55">
                      {hotspot.shape}, {getHotspotPointCount(hotspot)} points,
                      z {getHotspotZIndex(hotspot)},{" "}
                      {isEnterTarget
                        ? "enters Paper Planet"
                        : getHotspotActionLabel(hotspot)}
                    </span>
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => onToggleHidden(hotspot.id)}
                      className="border border-white/20 px-2 py-1 text-xs transition hover:border-white"
                    >
                      {isHidden ? "Show" : "Hide"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteHotspot(hotspot.id)}
                      className="border border-white/20 px-2 py-1 text-xs transition hover:border-white"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-sm text-white/55">No hotspots yet.</p>
          )}
        </div>
      </div>

      {selectedHotspot ? (
        <form className="grid gap-3 py-4">
          <label className="grid gap-1 text-sm">
            ID
            <input
              value={selectedHotspot.id}
              onChange={(event) =>
                onUpdateSelectedHotspot({ id: event.target.value })
              }
              className="border border-white/20 bg-black px-3 py-2 outline-none focus:border-white"
            />
          </label>
          <label className="grid gap-1 text-sm">
            Label
            <input
              value={selectedHotspot.label}
              onChange={(event) =>
                onUpdateSelectedHotspot({ label: event.target.value })
              }
              className="border border-white/20 bg-black px-3 py-2 outline-none focus:border-white"
            />
          </label>
          <label className="grid gap-1 text-sm">
            Z order
            <input
              type="number"
              step={1}
              value={getHotspotZIndex(selectedHotspot)}
              onChange={(event) =>
                onUpdateSelectedHotspot({
                  zIndex: Number(event.target.value) || 0,
                })
              }
              className="border border-white/20 bg-black px-3 py-2 outline-none focus:border-white"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onMoveSelectedZIndex("back")}
              className="border border-white/20 px-3 py-2 text-sm transition hover:border-white"
            >
              Send Back
            </button>
            <button
              type="button"
              onClick={() => onMoveSelectedZIndex("front")}
              className="border border-white/20 px-3 py-2 text-sm transition hover:border-white"
            >
              Bring Front
            </button>
          </div>
	          {isEnterTarget ? (
	            <p className="text-sm text-white/55">
	              This hotspot enters Paper Planet. Its action is fixed.
	            </p>
	          ) : (
	            <>
	              <label className="grid gap-1 text-sm">
	                Action
	                <select
	                  value={selectedHotspot.action.type}
	                  onChange={(event) => {
	                    if (event.target.value === "mailto") {
	                      onUpdateSelectedAction({
	                        type: "mailto",
	                        email: "paperplanetrecords@gmail.com",
	                        subject: "Paper Planet Records",
	                      });
	                      return;
	                    }

	                    onUpdateSelectedAction({
	                      type: "navigate",
	                      target: target === "construction" ? "hq" : "construction",
	                    });
	                  }}
	                  className="border border-white/20 bg-black px-3 py-2 outline-none focus:border-white"
	                >
	                  <option value="navigate">Navigate to scene</option>
	                  <option value="mailto">Open email prompt</option>
	                </select>
	              </label>

	              {selectedHotspot.action.type === "navigate" ? (
	                <label className="grid gap-1 text-sm">
	                  Destination
	                  <select
	                    value={selectedHotspot.action.target}
	                    onChange={(event) =>
	                      onUpdateSelectedAction({
	                        type: "navigate",
	                        target: event.target.value as SceneSlug,
	                      })
	                    }
	                    className="border border-white/20 bg-black px-3 py-2 outline-none focus:border-white"
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
	                      value={selectedHotspot.action.email}
	                      onChange={(event) =>
	                        onUpdateSelectedAction({
	                          type: "mailto",
	                          email: event.target.value,
	                          subject:
	                            selectedHotspot.action.type === "mailto"
	                              ? selectedHotspot.action.subject
	                              : undefined,
	                        })
	                      }
	                      className="border border-white/20 bg-black px-3 py-2 outline-none focus:border-white"
	                    />
	                  </label>
	                  <label className="grid gap-1 text-sm">
	                    Subject
	                    <input
	                      value={selectedHotspot.action.subject ?? ""}
	                      onChange={(event) =>
	                        onUpdateSelectedAction({
	                          type: "mailto",
	                          email:
	                            selectedHotspot.action.type === "mailto"
	                              ? selectedHotspot.action.email
	                              : "paperplanetrecords@gmail.com",
	                          subject: event.target.value,
	                        })
	                      }
	                      className="border border-white/20 bg-black px-3 py-2 outline-none focus:border-white"
	                    />
	                  </label>
	                </>
	              )}
	            </>
	          )}
        </form>
      ) : (
        <p className="py-4 text-sm text-white/55">Select a hotspot to edit it.</p>
      )}
    </aside>
  );
}

export function HotspotEditor() {
  const [target, setTarget] = useState<HotspotTarget>("enter");
  const [hotspotsByTarget, setHotspotsByTarget] = useState(loadHotspotsByTarget);
  const [hiddenIdsByTarget, setHiddenIdsByTarget] = useState(
    loadHiddenIdsByTarget,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activePoints, setActivePoints] = useState<PercentPoint[]>([]);
  const [status, setStatus] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [storageReady, setStorageReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isDrawingRef = useRef(false);

  const scene = target === "enter" ? null : scenes[target];
  const hotspots = hotspotsByTarget[target];
  const hiddenIds = hiddenIdsByTarget[target];
  const selectedHotspot =
    hotspots.find((hotspot) => hotspot.id === selectedId) ?? null;
  const orderedHotspots = useMemo(
    () => sortHotspotsByZOrder(hotspots),
    [hotspots],
  );
  const hotspotsFrontFirst = useMemo(
    () => sortHotspotsFrontFirst(hotspots),
    [hotspots],
  );
  const aspectRatio = useMemo(
    () =>
      target === "enter"
        ? `${enterArtwork.width} / ${enterArtwork.height}`
        : `${scene?.video.width ?? 1} / ${scene?.video.height ?? 1}`,
    [scene?.video.height, scene?.video.width, target],
  );

  useEffect(() => {
    const loadStorageTimeout = window.setTimeout(() => {
      setHotspotsByTarget(loadStoredHotspotsByTarget());
      setHiddenIdsByTarget(loadStoredHiddenIdsByTarget());
      setStorageReady(true);
    }, 0);

    return () => {
      window.clearTimeout(loadStorageTimeout);
    };
  }, []);

  useEffect(() => {
    if (!storageReady) {
      return;
    }

    window.localStorage.setItem(
      editorStorageKey(target),
      JSON.stringify(hotspots),
    );
  }, [hotspots, storageReady, target]);

  useEffect(() => {
    if (!storageReady) {
      return;
    }

    window.localStorage.setItem(
      hiddenStorageKey(target),
      JSON.stringify(hiddenIds),
    );
  }, [hiddenIds, storageReady, target]);

  function setTargetHotspots(
    updater: Hotspot[] | ((currentHotspots: Hotspot[]) => Hotspot[]),
  ) {
    setHotspotsByTarget((currentByTarget) => {
      const currentHotspots = currentByTarget[target];
      const nextHotspots =
        typeof updater === "function" ? updater(currentHotspots) : updater;

      return {
        ...currentByTarget,
        [target]: dedupeHotspots(target, nextHotspots),
      };
    });
  }

  function setTargetHiddenIds(
    updater: string[] | ((currentHiddenIds: string[]) => string[]),
  ) {
    setHiddenIdsByTarget((currentByTarget) => {
      const currentHiddenIds = currentByTarget[target];
      const nextHiddenIds =
        typeof updater === "function" ? updater(currentHiddenIds) : updater;

      return {
        ...currentByTarget,
        [target]: Array.from(new Set(nextHiddenIds)),
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
    if (event.button !== 0) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    isDrawingRef.current = true;
    setActivePoints([pointFromEvent(event)]);
    setStatus("");
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (!isDrawingRef.current) {
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

  function finishDrawing(points: PercentPoint[]) {
    if (points.length < 2) {
      return [];
    }

    const normalizedPoints = normalizeDrawnPoints(points);
    const nextZIndex =
      hotspots.length > 0
        ? Math.max(...hotspots.map((hotspot) => getHotspotZIndex(hotspot))) + 1
        : 0;
    const nextHotspot: PolygonHotspot = {
      ...createPolygonHotspot(target),
      points: normalizedPoints,
      zIndex: nextZIndex,
    };

    setTargetHotspots((currentHotspots) => [...currentHotspots, nextHotspot]);
    setSelectedId(nextHotspot.id);
    setStatus("Hotspot created. Name it, choose an action, then save.");

    return [];
  }

  function handlePointerUp(event: PointerEvent<SVGSVGElement>) {
    if (!isDrawingRef.current) {
      return;
    }

    event.currentTarget.releasePointerCapture(event.pointerId);
    isDrawingRef.current = false;
    setActivePoints(finishDrawing);
  }

  function cancelDrawing() {
    isDrawingRef.current = false;
    setActivePoints([]);
  }

  function updateSelectedHotspot(updates: Partial<Hotspot>) {
    if (!selectedHotspot) {
      return;
    }

    setTargetHotspots((currentHotspots) =>
      currentHotspots.map((hotspot) =>
        hotspot.id === selectedHotspot.id
          ? ({ ...hotspot, ...updates } as Hotspot)
          : hotspot,
      ),
    );

    if (typeof updates.id === "string") {
      setSelectedId(updates.id);
    }
  }

  function updateSelectedAction(action: HotspotAction) {
    updateSelectedHotspot({ action });
  }

  function deleteHotspot(id: string) {
    setTargetHotspots((currentHotspots) =>
      currentHotspots.filter((hotspot) => hotspot.id !== id),
    );
    setTargetHiddenIds((currentHiddenIds) =>
      currentHiddenIds.filter((hiddenId) => hiddenId !== id),
    );

    if (selectedId === id) {
      setSelectedId(null);
    }

    setStatus("Hotspot deleted.");
  }

  function clearHotspots() {
    setTargetHotspots([]);
    setTargetHiddenIds([]);
    setSelectedId(null);
    setStatus("All hotspots removed from this target in the editor.");
  }

  function resetToAppHotspots() {
    setTargetHotspots(target === "enter" ? enterHotspots : scenes[target].hotspots);
    setTargetHiddenIds([]);
    setSelectedId(null);
    setStatus("Reset this target to the hotspots currently saved in the app.");
  }

  function toggleHidden(id: string) {
    setTargetHiddenIds((currentHiddenIds) =>
      currentHiddenIds.includes(id)
        ? currentHiddenIds.filter((hiddenId) => hiddenId !== id)
        : [...currentHiddenIds, id],
    );
  }

  function moveSelectedZIndex(direction: "back" | "front") {
    if (!selectedHotspot) {
      return;
    }

    const zIndexes = hotspots.map((hotspot) => getHotspotZIndex(hotspot));
    const currentZIndex = getHotspotZIndex(selectedHotspot);
    const nextZIndex =
      direction === "front"
        ? Math.max(currentZIndex + 1, ...zIndexes) + 1
        : Math.min(currentZIndex - 1, ...zIndexes) - 1;

    updateSelectedHotspot({ zIndex: nextZIndex });
  }

  async function copyText(text: string, message: string) {
    await navigator.clipboard.writeText(text);
    setStatus(message);
  }

  function copySelected() {
    if (!selectedHotspot) {
      setStatus("Select a hotspot first.");
      return;
    }

    void copyText(serializeHotspots([selectedHotspot]), "Copied selected JSON.");
  }

  function copySceneHotspots() {
    void copyText(serializeHotspots(hotspots), "Copied target hotspots JSON.");
  }

  async function saveToAppFile() {
    setStatus("Saving...");

    const response = await fetch("/api/dev/hotspots", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        target,
        hotspots,
      }),
    });

    const result = (await response.json()) as { error?: string; count?: number };

    if (!response.ok) {
      setStatus(result.error ?? "Save failed.");
      return;
    }

    setStatus(`Saved ${result.count ?? hotspots.length} hotspot(s) to the app.`);
  }

  function seekTo(value: number) {
    const video = videoRef.current;

    if (!video || !scene) {
      return;
    }

    video.currentTime = value;
    setCurrentTime(value);
  }

  function togglePlayback() {
    const video = videoRef.current;

    if (!video || !scene) {
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

  function renderHotspotShape(hotspot: Hotspot) {
    if (hiddenIds.includes(hotspot.id)) {
      return null;
    }

    const isSelected = hotspot.id === selectedId;
    const fill = isSelected ? "rgba(255,255,255,0.32)" : "rgba(255,255,255,0.14)";
    const stroke = isSelected ? "rgba(255,255,255,1)" : "rgba(255,255,255,0.78)";

    const pointerProps = {
      onPointerDown: (event: PointerEvent<SVGElement>) => {
        event.stopPropagation();
        setSelectedId(hotspot.id);
        setStatus("");
      },
    };

    return hotspot.shape === "rect" ? (
      <rect
        key={hotspot.id}
        x={hotspot.rect.x}
        y={hotspot.rect.y}
        width={hotspot.rect.width}
        height={hotspot.rect.height}
        fill={fill}
        stroke={stroke}
        strokeWidth="0.3"
        vectorEffect="non-scaling-stroke"
        {...pointerProps}
      />
    ) : (
      <polygon
        key={hotspot.id}
        points={pointsToString(hotspot.points)}
        fill={fill}
        stroke={stroke}
        strokeWidth="0.3"
        vectorEffect="non-scaling-stroke"
        {...pointerProps}
      />
    );
  }

  return (
    <main className="h-dvh overflow-hidden bg-black text-white">
      <div className="grid h-dvh w-full grid-rows-[minmax(0,1fr)_minmax(18rem,42dvh)] gap-px overflow-hidden bg-neutral-800 lg:grid-cols-[minmax(0,1fr)_400px] lg:grid-rows-1">
        <section className="flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto overscroll-contain bg-black p-4">
          <nav className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href={target === "enter" ? "/" : `/rooms/${target}?hotspots=1`}
              className="font-mono text-xs uppercase tracking-[0.18em] text-white/70 hover:text-white"
            >
              Paper Planet Hotspots
            </Link>
            <label className="flex items-center gap-2 text-sm text-white/70">
              Target
              <select
                value={target}
                onChange={(event) => {
                  setTarget(event.target.value as HotspotTarget);
                  setSelectedId(null);
                  setActivePoints([]);
                  cancelDrawing();
                  setStatus("");
                }}
                className="border border-white/25 bg-black px-3 py-2 text-white outline-none focus:border-white"
              >
                {hotspotTargets.map((slug) => (
                  <option key={slug} value={slug}>
                    {targetLabels[slug]}
                  </option>
                ))}
              </select>
            </label>
          </nav>

          <div
            className="relative mx-auto w-full max-w-[min(100%,calc(100dvh-9rem))] touch-none overflow-hidden bg-black"
            style={{ aspectRatio }}
          >
            {target === "enter" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="absolute inset-0 h-full w-full object-contain"
                src={enterArtwork.src}
                alt=""
                draggable={false}
              />
            ) : scene ? (
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
            ) : null}

            <svg
              className="absolute inset-0 h-full w-full cursor-crosshair"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={cancelDrawing}
            >
              {orderedHotspots.map((hotspot) => renderHotspotShape(hotspot))}

              {activePoints.length > 1 ? (
                <polyline
                  points={pointsToString(activePoints)}
                  fill="none"
                  stroke="rgba(255,255,255,1)"
                  strokeWidth="0.42"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
            </svg>
          </div>

          {scene ? (
            <div className="grid gap-3 border-t border-white/15 pt-3 font-mono text-xs text-white/70 sm:grid-cols-[auto_1fr_auto] sm:items-center">
              <button
                type="button"
                onClick={togglePlayback}
                className="border border-white/25 px-3 py-2 text-white transition hover:border-white"
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
                className="w-full accent-white"
                aria-label="Video time"
              />
              <p>
                {formatTime(currentTime)} /{" "}
                {formatTime(duration || scene.video.durationSeconds)}
              </p>
            </div>
          ) : null}
        </section>

        <HotspotEditorSidebar
          target={target}
          hotspots={hotspots}
          hotspotsFrontFirst={hotspotsFrontFirst}
          hiddenIds={hiddenIds}
          selectedId={selectedId}
          selectedHotspot={selectedHotspot}
          status={status}
          onSaveToAppFile={() => void saveToAppFile()}
          onCopySceneHotspots={copySceneHotspots}
          onCopySelected={copySelected}
          onResetToAppHotspots={resetToAppHotspots}
          onClearHotspots={clearHotspots}
          onSelectHotspot={(id) => {
            setSelectedId(id);
            setStatus("");
          }}
          onToggleHidden={toggleHidden}
          onDeleteHotspot={deleteHotspot}
          onUpdateSelectedHotspot={updateSelectedHotspot}
          onUpdateSelectedAction={updateSelectedAction}
          onMoveSelectedZIndex={moveSelectedZIndex}
        />
      </div>
    </main>
  );
}
