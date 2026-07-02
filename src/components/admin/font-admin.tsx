"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  defaultFontGlyphMetricAdjustment,
  fontGlyphDefinitions,
  type FontGlyphDefinition,
  type FontGlyphMetricAdjustment,
  type FontGlyphMetricsManifest,
} from "@/lib/font-glyph-metrics";

const defaultSample = [
  "Conito's Way",
  '"paper planet"',
  "Now playing",
  "album: Alpaulccino",
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  "abcdefghijklmnopqrstuvwxyz",
  "1234567890 ! ? . , : ; ' \" ( ) + - = / \\ < > @ # $",
].join("\n");

const dragUnitsPerPixel = 4;

function classNames(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function getMetric(
  manifest: FontGlyphMetricsManifest | null,
  glyph: FontGlyphDefinition,
) {
  return manifest?.glyphs[glyph.name] ?? defaultFontGlyphMetricAdjustment;
}

function metricHasAdjustment(metric: FontGlyphMetricAdjustment) {
  return (
    metric.xOffset !== defaultFontGlyphMetricAdjustment.xOffset ||
    metric.yOffset !== defaultFontGlyphMetricAdjustment.yOffset ||
    metric.scale !== defaultFontGlyphMetricAdjustment.scale ||
    metric.advanceOffset !== defaultFontGlyphMetricAdjustment.advanceOffset
  );
}

function toMetricNumber(value: number, decimals = 0) {
  return Number(value.toFixed(decimals));
}

type MetricInputProps = {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  value: number;
};

function MetricInput({
  label,
  max,
  min,
  onChange,
  step,
  value,
}: MetricInputProps) {
  return (
    <label className="grid gap-1 text-xs uppercase tracking-[0.14em] text-white/45">
      {label}
      <div className="grid grid-cols-[1fr_5.5rem] items-center gap-3">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="cursor-pointer accent-white"
        />
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="border border-white/15 bg-black px-2 py-1 text-right font-mono text-sm text-white outline-none focus:border-white/60"
        />
      </div>
    </label>
  );
}

export function FontAdmin() {
  const [sample, setSample] = useState(defaultSample);
  const [fontSize, setFontSize] = useState(48);
  const [manifest, setManifest] = useState<FontGlyphMetricsManifest | null>(
    null,
  );
  const [selectedGlyphName, setSelectedGlyphName] = useState(
    fontGlyphDefinitions[0].name,
  );
  const [status, setStatus] = useState("Loading glyph metrics...");
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const dragRef = useRef<{
    metric: FontGlyphMetricAdjustment;
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);

  const selectedGlyph = useMemo(
    () =>
      fontGlyphDefinitions.find((glyph) => glyph.name === selectedGlyphName) ??
      fontGlyphDefinitions[0],
    [selectedGlyphName],
  );
  const selectedMetric = getMetric(manifest, selectedGlyph);
  const adjustedCount = manifest ? Object.keys(manifest.glyphs).length : 0;

  useEffect(() => {
    let isCanceled = false;

    async function loadMetrics() {
      const response = await fetch("/api/admin/font-metrics", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Could not load glyph metrics.");
      }

      const result = (await response.json()) as {
        manifest: FontGlyphMetricsManifest;
      };

      if (!isCanceled) {
        setManifest(result.manifest);
        setStatus(`Loaded ${Object.keys(result.manifest.glyphs).length} adjusted glyph(s).`);
      }
    }

    void loadMetrics().catch((error: unknown) => {
      if (isCanceled) {
        return;
      }

      setStatus(error instanceof Error ? error.message : "Could not load metrics.");
    });

    return () => {
      isCanceled = true;
    };
  }, []);

  function updateSelectedMetric(
    patch: Partial<FontGlyphMetricAdjustment>,
    options: { decimals?: number } = {},
  ) {
    setManifest((current) => {
      if (!current) {
        return current;
      }

      const nextMetric = {
        ...defaultFontGlyphMetricAdjustment,
        ...current.glyphs[selectedGlyph.name],
        ...patch,
      };
      const normalizedMetric = {
        xOffset: toMetricNumber(nextMetric.xOffset),
        yOffset: toMetricNumber(nextMetric.yOffset),
        scale: toMetricNumber(nextMetric.scale, options.decimals ?? 3),
        advanceOffset: toMetricNumber(nextMetric.advanceOffset),
      };
      const nextGlyphs = { ...current.glyphs };

      if (metricHasAdjustment(normalizedMetric)) {
        nextGlyphs[selectedGlyph.name] = normalizedMetric;
      } else {
        delete nextGlyphs[selectedGlyph.name];
      }

      return { ...current, glyphs: nextGlyphs };
    });
    setIsDirty(true);
  }

  function resetSelectedGlyph() {
    setManifest((current) => {
      if (!current) {
        return current;
      }

      const nextGlyphs = { ...current.glyphs };
      delete nextGlyphs[selectedGlyph.name];

      return { ...current, glyphs: nextGlyphs };
    });
    setIsDirty(true);
  }

  async function saveMetrics() {
    if (!manifest) {
      return;
    }

    setIsSaving(true);
    setStatus("Saving glyph metrics...");

    try {
      const response = await fetch("/api/admin/font-metrics", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(manifest),
      });

      if (!response.ok) {
        throw new Error("Could not save glyph metrics.");
      }

      const result = (await response.json()) as {
        manifest: FontGlyphMetricsManifest;
      };

      setManifest(result.manifest);
      setIsDirty(false);
      setStatus(
        `Saved ${Object.keys(result.manifest.glyphs).length} adjusted glyph(s). Run npm run font:build to regenerate the font files.`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save metrics.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleEditorPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!manifest) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      metric: selectedMetric,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
  }

  function handleEditorPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    updateSelectedMetric({
      xOffset: drag.metric.xOffset + (event.clientX - drag.startX) * dragUnitsPerPixel,
      yOffset: drag.metric.yOffset - (event.clientY - drag.startY) * dragUnitsPerPixel,
    });
  }

  function handleEditorPointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  }

  return (
    <section className="grid gap-5">
      <div className="grid gap-1">
        <h2 className="text-lg font-semibold">Font</h2>
        <p className="text-sm text-white/55">
          Check the Paper Planet font and align individual glyph metrics against
          a regular Helvetica reference.
        </p>
      </div>

      <div className="grid gap-3 border border-white/10 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="grid gap-1 text-sm text-white/70">
            Test Text
            <span className="font-mono text-xs text-white/40">
              Straight apostrophe and quotes are included in the sample.
            </span>
          </label>
          <label className="flex items-center gap-3 text-sm text-white/60">
            Size
            <input
              type="range"
              min="24"
              max="96"
              value={fontSize}
              onChange={(event) => setFontSize(Number(event.target.value))}
              className="w-36 cursor-pointer accent-white"
            />
            <span className="w-10 text-right font-mono text-xs">
              {fontSize}px
            </span>
          </label>
        </div>

        <textarea
          value={sample}
          onChange={(event) => setSample(event.target.value)}
          spellCheck={false}
          className="min-h-40 resize-y border border-white/15 bg-black p-3 font-mono text-sm leading-6 text-white outline-none focus:border-white/60"
        />

        <div
          className="font-paper-planet min-h-56 whitespace-pre-wrap break-words border border-white/15 bg-black p-5 text-white"
          style={{ fontSize, lineHeight: 1.15 }}
        >
          {sample}
        </div>
      </div>

      <div className="grid gap-4 border border-white/10 p-4 lg:grid-cols-[23rem_1fr]">
        <div className="grid gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium uppercase tracking-[0.14em] text-white/50">
                Glyph Editor
              </h3>
              <p className="mt-1 font-mono text-xs text-white/40">
                {adjustedCount} adjusted / {fontGlyphDefinitions.length} glyphs
              </p>
            </div>
            <button
              type="button"
              onClick={saveMetrics}
              disabled={!manifest || !isDirty || isSaving}
              className="cursor-pointer border border-white/25 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isSaving ? "Saving..." : "Save Metrics"}
            </button>
          </div>

          <div
            role="application"
            aria-label={`Adjust ${selectedGlyph.label}`}
            onPointerDown={handleEditorPointerDown}
            onPointerMove={handleEditorPointerMove}
            onPointerUp={handleEditorPointerEnd}
            onPointerCancel={handleEditorPointerEnd}
            className="relative grid h-80 cursor-grab select-none place-items-center overflow-hidden border border-white/15 bg-black active:cursor-grabbing"
          >
            <div className="absolute left-0 right-0 top-1/2 border-t border-cyan-300/25" />
            <div className="absolute bottom-[27%] left-0 right-0 border-t border-white/20" />
            <div className="absolute bottom-[18%] left-0 right-0 border-t border-red-300/25" />
            <div className="absolute bottom-[18%] left-1/2 top-[14%] border-l border-white/10" />
            <span
              className="absolute text-[13rem] leading-none text-white/18"
              style={{ fontFamily: "Helvetica, Arial, sans-serif" }}
            >
              {selectedGlyph.char}
            </span>
            <Image
              src={`/api/admin/font-glyph?stem=${encodeURIComponent(selectedGlyph.fileStem)}`}
              alt=""
              width={320}
              height={320}
              draggable={false}
              unoptimized
              className="pointer-events-none absolute max-w-[80%] object-contain opacity-95"
              style={{
                height: "13rem",
                transform: `translate3d(${selectedMetric.xOffset / dragUnitsPerPixel}px, ${
                  -selectedMetric.yOffset / dragUnitsPerPixel
                }px, 0) scale(${selectedMetric.scale})`,
              }}
            />
          </div>

          <div className="grid gap-3">
            <MetricInput
              label="X"
              min={-320}
              max={320}
              step={2}
              value={selectedMetric.xOffset}
              onChange={(value) => updateSelectedMetric({ xOffset: value })}
            />
            <MetricInput
              label="Y"
              min={-420}
              max={420}
              step={2}
              value={selectedMetric.yOffset}
              onChange={(value) => updateSelectedMetric({ yOffset: value })}
            />
            <MetricInput
              label="Scale"
              min={0.2}
              max={2.4}
              step={0.01}
              value={selectedMetric.scale}
              onChange={(value) =>
                updateSelectedMetric({ scale: value }, { decimals: 3 })
              }
            />
            <MetricInput
              label="Spacing"
              min={-320}
              max={420}
              step={2}
              value={selectedMetric.advanceOffset}
              onChange={(value) => updateSelectedMetric({ advanceOffset: value })}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-xs text-white/45">{status}</p>
            <button
              type="button"
              onClick={resetSelectedGlyph}
              disabled={!manifest || !metricHasAdjustment(selectedMetric)}
              className="cursor-pointer border border-red-300/35 px-3 py-2 text-sm text-red-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Reset Glyph
            </button>
          </div>
        </div>

        <div className="grid content-start gap-3">
          <h3 className="text-sm font-medium uppercase tracking-[0.14em] text-white/50">
            Glyph Check
          </h3>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2">
            {fontGlyphDefinitions.map((glyph) => {
              const metric = getMetric(manifest, glyph);
              const isSelected = glyph.name === selectedGlyph.name;
              const isAdjusted = metricHasAdjustment(metric);

              return (
                <button
                  type="button"
                  key={glyph.name}
                  onClick={() => setSelectedGlyphName(glyph.name)}
                  className={classNames(
                    "grid min-h-20 cursor-pointer place-items-center border bg-black p-2 text-left",
                    isSelected ? "border-white" : "border-white/10",
                    isAdjusted ? "text-white" : "text-white/70",
                  )}
                >
                  <span className="font-paper-planet text-5xl leading-none">
                    {glyph.char}
                  </span>
                  <span className="mt-2 font-mono text-[0.65rem] text-white/40">
                    {glyph.label}
                  </span>
                  {isAdjusted ? (
                    <span className="font-mono text-[0.6rem] uppercase text-cyan-200/70">
                      adjusted
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
