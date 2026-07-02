export type PlaylistMetadataToast = {
  id: number;
  title: string;
  artist?: string;
  album?: string;
  frame: PlaylistMetadataFrame;
};

export type PlaylistMetadataFrame = {
  path: string;
};

type MetadataToastProps = {
  toast: PlaylistMetadataToast;
};

function hashString(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createSeededRandom(seed: number) {
  let value = seed || 1;

  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);

    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function createMetadataFramePath(seed: number) {
  const random = createSeededRandom(seed);
  const jitter = (amount: number) => (random() * 2 - 1) * amount;
  const points = [
    { x: 3 + jitter(1.7), y: 9 + jitter(2.1) },
    { x: 17 + jitter(2.8), y: 5 + jitter(1.6) },
    { x: 38 + jitter(2.4), y: 4 + jitter(1.4) },
    { x: 62 + jitter(2.4), y: 4 + jitter(1.4) },
    { x: 84 + jitter(2.8), y: 5 + jitter(1.6) },
    { x: 97 + jitter(1.7), y: 9 + jitter(2.1) },
    { x: 99 + jitter(1.4), y: 28 + jitter(2.8) },
    { x: 98 + jitter(1.5), y: 56 + jitter(2.8) },
    { x: 97 + jitter(1.7), y: 90 + jitter(2.1) },
    { x: 82 + jitter(2.8), y: 96 + jitter(1.7) },
    { x: 58 + jitter(2.4), y: 97 + jitter(1.3) },
    { x: 38 + jitter(2.4), y: 97 + jitter(1.3) },
    { x: 16 + jitter(2.8), y: 96 + jitter(1.7) },
    { x: 3 + jitter(1.7), y: 90 + jitter(2.1) },
    { x: 1 + jitter(1.4), y: 61 + jitter(2.8) },
    { x: 2 + jitter(1.5), y: 31 + jitter(2.8) },
  ];
  const midpoint = (
    first: (typeof points)[number],
    second: (typeof points)[number],
  ) => ({
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  });
  const start = midpoint(points.at(-1) ?? points[0], points[0]);
  const curves = points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    const end = midpoint(point, next);

    return `Q ${point.x.toFixed(2)} ${point.y.toFixed(2)} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
  });

  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} ${curves.join(" ")} Z`;
}

export function createPlaylistMetadataFrame(
  seedText: string,
): PlaylistMetadataFrame {
  return {
    path: createMetadataFramePath(hashString(seedText)),
  };
}

export function MetadataToast({ toast }: MetadataToastProps) {
  return (
    <div
      key={toast.id}
      className="pointer-events-none fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-[45] flex justify-center sm:bottom-6"
      role="status"
      aria-live="polite"
    >
      <div className="paper-planet-metadata-toast font-paper-planet relative isolate max-w-[min(42rem,calc(100vw-1.5rem))] px-5 py-2.5 text-center text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.68)] sm:px-6">
        <svg
          className="pointer-events-none absolute -inset-1 -z-10 h-[calc(100%+0.5rem)] w-[calc(100%+0.5rem)] overflow-visible"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d={toast.frame.path}
            fill="rgba(0, 0, 0, 0.86)"
            stroke="rgba(255, 255, 255, 0.78)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.25"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <p className="text-[1.05rem] leading-[1.18] text-white/62 sm:text-[1.32rem]">
          Now playing
        </p>
        <p className="text-balance break-words text-[clamp(1rem,3.35vw,1.68rem)] leading-[1.16] text-white">
          {toast.title}
        </p>
        {toast.artist ? (
          <p className="mt-0.5 text-balance break-words text-[0.96rem] leading-[1.16] text-white/72 sm:text-[1.2rem]">
            artist: {toast.artist}
          </p>
        ) : null}
        {toast.album ? (
          <p className="mt-0.5 text-balance break-words text-[0.96rem] leading-[1.16] text-white/72 sm:text-[1.2rem]">
            album: {toast.album}
          </p>
        ) : null}
      </div>
    </div>
  );
}
