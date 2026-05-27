"use client";

import { useMemo, useState } from "react";

const defaultSample = [
  "Conito's Way",
  '"paper planet"',
  "Now playing",
  "album: Alpaulccino",
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  "abcdefghijklmnopqrstuvwxyz",
  "1234567890 ! ? . , : ; ' \" ( ) + - = / \\ < > @ # $",
].join("\n");

const glyphSample = `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890!?.,:;'\"()+-=/\\<>@#$`;

export function FontAdmin() {
  const [sample, setSample] = useState(defaultSample);
  const [fontSize, setFontSize] = useState(48);

  const glyphs = useMemo(() => [...glyphSample], []);

  return (
    <section className="grid gap-5">
      <div className="grid gap-1">
        <h2 className="text-lg font-semibold">Font</h2>
        <p className="text-sm text-white/55">
          Type sample text here to check the Paper Planet font spacing and
          missing glyphs.
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

      <div className="grid gap-3">
        <h3 className="text-sm font-medium uppercase tracking-[0.14em] text-white/50">
          Glyph Check
        </h3>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2">
          {glyphs.map((glyph, index) => (
            <div
              key={`${glyph}-${index}`}
              className="grid min-h-20 place-items-center border border-white/10 bg-black p-2"
            >
              <span className="font-paper-planet text-5xl leading-none text-white">
                {glyph}
              </span>
              <span className="mt-2 font-mono text-[0.65rem] text-white/40">
                {glyph === " " ? "space" : glyph}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
