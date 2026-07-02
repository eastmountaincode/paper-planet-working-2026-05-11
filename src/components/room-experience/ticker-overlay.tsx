"use client";

import { useEffect, useRef, useState } from "react";
import type { SceneTicker } from "@/lib/scenes";
import { classNames, devOutline } from "./ui";

type BottomTicker = Extract<SceneTicker, { position: "bottom" }>;
type CenterTicker = Extract<SceneTicker, { position: "center" }>;

type SyncedTickerProps = {
  ticker: BottomTicker;
  devBorders: boolean;
};

type CenterTickerProps = {
  ticker: CenterTicker;
  devBorders: boolean;
};

type SceneTickerOverlayProps = {
  ticker: SceneTicker;
  devBorders: boolean;
};

const TICKER_GAP_PIXELS = 96;

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function TickerText({ text }: { text: string }) {
  const characters = Array.from(text);

  return (
    <>
      {characters.map((character, index) => (
        <span
          // Every ticker copy must have identical wave phase for a seamless wrap.
          key={`${character}-${index}`}
          className="paper-planet-ticker-letter inline-block"
          style={{
            animationDelay: `${index * -0.07}s`,
          }}
        >
          {character === " " ? "\u00A0" : character}
        </span>
      ))}
    </>
  );
}

function CenterTickerText({ text }: { text: string }) {
  return <TickerText text={text} />;
}

function SyncedTicker({ ticker, devBorders }: SyncedTickerProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const firstCopyRef = useRef<HTMLSpanElement>(null);
  const secondCopyRef = useRef<HTMLSpanElement>(null);
  const [copyCount, setCopyCount] = useState(4);

  useEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    const firstCopy = firstCopyRef.current;
    const secondCopy = secondCopyRef.current;

    if (!viewport || !track || !firstCopy || !secondCopy) {
      return;
    }

    let animationFrame = 0;
    let itemWidth = secondCopy.offsetLeft - firstCopy.offsetLeft;

    const measure = () => {
      itemWidth = secondCopy.offsetLeft - firstCopy.offsetLeft;
      const nextCopyCount = Math.max(
        3,
        Math.ceil(viewport.clientWidth / Math.max(itemWidth, 1)) + 3,
      );

      setCopyCount((current) =>
        current === nextCopyCount ? current : nextCopyCount,
      );
    };

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(viewport);
    resizeObserver.observe(firstCopy);
    resizeObserver.observe(secondCopy);
    measure();

    const tick = () => {
      const seconds = Date.now() / 1000 + (ticker.epochOffsetSeconds ?? 0);
      const offset =
        (seconds * ticker.speedPixelsPerSecond) % Math.max(itemWidth, 1);

      track.style.transform = `translate3d(${-offset}px, 0, 0)`;
      animationFrame = window.requestAnimationFrame(tick);
    };

    tick();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
    };
  }, [ticker.epochOffsetSeconds, ticker.speedPixelsPerSecond]);

  return (
    <div
      ref={viewportRef}
      className={classNames(
        "pointer-events-none absolute inset-x-0 bottom-0 z-20 overflow-hidden py-1 text-white sm:py-2",
        devOutline(devBorders, 5),
      )}
      aria-label={ticker.text}
    >
      <div
        ref={trackRef}
        className="flex w-max whitespace-nowrap will-change-transform"
      >
        {Array.from({ length: copyCount }).map((_, index) => (
          <span
            key={index}
            ref={
              index === 0
                ? firstCopyRef
                : index === 1
                  ? secondCopyRef
                  : undefined
            }
            className="font-paper-planet block shrink-0 text-xl leading-none text-white [text-shadow:0_2px_8px_rgba(0,0,0,0.95)] sm:text-3xl"
            style={{ marginRight: TICKER_GAP_PIXELS }}
            aria-hidden={index > 0}
          >
            <TickerText text={ticker.text} />
          </span>
        ))}
      </div>
    </div>
  );
}

function CenterTicker({ ticker, devBorders }: CenterTickerProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const messageInterval =
    ticker.messageIntervalSeconds ?? ticker.cycleSeconds / ticker.messages.length;

  useEffect(() => {
    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    let animationFrame = 0;
    let viewportWidth = viewport.clientWidth;
    let messageWidths = ticker.messages.map(
      (_, index) => messageRefs.current[index]?.offsetWidth ?? 0,
    );
    const cycleSeconds = Math.max(ticker.cycleSeconds, 1);
    const intervalSeconds = Math.max(messageInterval, 0.1);
    const travelSeconds = Math.min(
      cycleSeconds,
      Math.max(1, intervalSeconds * 0.825),
    );

    const measure = () => {
      viewportWidth = viewport.clientWidth;
      messageWidths = ticker.messages.map(
        (_, index) => messageRefs.current[index]?.offsetWidth ?? 0,
      );
    };

    const tick = () => {
      const seconds = Date.now() / 1000 + (ticker.epochOffsetSeconds ?? 0);

      ticker.messages.forEach((_, index) => {
        const element = messageRefs.current[index];

        if (!element) {
          return;
        }

        const phase = positiveModulo(
          seconds - index * intervalSeconds,
          cycleSeconds,
        );

        if (phase > travelSeconds) {
          element.style.opacity = "0";
          element.style.visibility = "hidden";
          return;
        }

        const progress = phase / travelSeconds;
        const startX = viewportWidth * 1.1;
        const endX = -(messageWidths[index] || element.offsetWidth) * 1.05;
        const x = startX + (endX - startX) * progress;
        const rotation = -1.4 + 2.4 * progress;

        element.style.opacity = "1";
        element.style.visibility = "visible";
        element.style.transform = `translate3d(${x.toFixed(
          2,
        )}px, -50%, 0) rotate(${rotation.toFixed(3)}deg)`;
      });

      animationFrame = window.requestAnimationFrame(tick);
    };

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(viewport);
    messageRefs.current.forEach((element) => {
      if (element) {
        resizeObserver.observe(element);
      }
    });

    measure();
    tick();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
    };
  }, [
    messageInterval,
    ticker.cycleSeconds,
    ticker.epochOffsetSeconds,
    ticker.messages,
  ]);

  return (
    <div
      ref={viewportRef}
      className={classNames(
        "pointer-events-none absolute inset-x-0 top-[58%] z-20 h-[34dvh] min-h-36 -translate-y-1/2 overflow-hidden text-white",
        devOutline(devBorders, 5),
      )}
      aria-label={ticker.messages.join(" ")}
    >
      {ticker.messages.map((message, index) => (
        <div
          key={message}
          ref={(element) => {
            messageRefs.current[index] = element;
          }}
          className="absolute left-0 top-1/2 w-max whitespace-nowrap font-paper-planet text-[clamp(1.55rem,4.8vw,3.8rem)] leading-none text-white opacity-0 will-change-transform"
          style={{
            visibility: "hidden",
          }}
          aria-hidden={index > 0}
        >
          <CenterTickerText text={message} />
        </div>
      ))}
    </div>
  );
}

export function SceneTickerOverlay({
  ticker,
  devBorders,
}: SceneTickerOverlayProps) {
  return ticker.position === "center" ? (
    <CenterTicker ticker={ticker} devBorders={devBorders} />
  ) : (
    <SyncedTicker ticker={ticker} devBorders={devBorders} />
  );
}
