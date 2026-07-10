"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import {
  createStaticHotspotManifest,
  hotspotSceneSlugs,
  normalizeHotspotManifest,
  type HotspotManifest,
} from "@/lib/hotspot-manifest";
import {
  createStaticPlaylistManifest,
  normalizePlaylistManifest,
} from "@/lib/playlist-manifest";
import { scenes, type Hotspot, type SceneSlug } from "@/lib/scenes";
import {
  createStaticSiteSettingsManifest,
  normalizeSiteSettingsManifest,
} from "@/lib/site-settings";

type ManifestSource = "r2" | "static";

type ManifestSources = {
  hotspots: ManifestSource;
  playlists: ManifestSource;
  settings: ManifestSource;
};

type RoomNodeData = {
  connections: number;
  desktopHotspots: number;
  enabledTracks: number;
  mobileHotspots: number;
  playlistVolume: number;
  roomAudioVolume: number;
  slug: SceneSlug;
  title: string;
};

type RoomNode = Node<RoomNodeData, "room">;

type RoomConnection = {
  source: SceneSlug;
  target: SceneSlug;
};

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function getNavigationTargets(hotspots: Hotspot[]) {
  return hotspots.flatMap((hotspot) =>
    hotspot.action.type === "navigate" ? [hotspot.action.target] : [],
  );
}

function deriveConnections(manifest: HotspotManifest) {
  const connections = new Map<string, RoomConnection>();

  for (const source of hotspotSceneSlugs) {
    const roomHotspots = manifest.scenes[source];
    const targets = [
      ...getNavigationTargets(roomHotspots.desktop),
      ...getNavigationTargets(roomHotspots.mobile),
      ...getNavigationTargets(
        (scenes[source].overlays ?? []).map((overlay) => ({
          id: overlay.id,
          label: overlay.label,
          shape: "rect" as const,
          rect: { x: 0, y: 0, width: 0, height: 0 },
          action: overlay.action,
        })),
      ),
    ];

    for (const target of targets) {
      connections.set(`${source}->${target}`, { source, target });
    }
  }

  return [...connections.values()];
}

function createRoomEdges(connections: RoomConnection[]): Edge[] {
  const remaining = new Map(
    connections.map((connection) => [
      `${connection.source}->${connection.target}`,
      connection,
    ]),
  );
  const edges: Edge[] = [];

  for (const connection of connections) {
    const key = `${connection.source}->${connection.target}`;

    if (!remaining.has(key)) {
      continue;
    }

    const reverseKey = `${connection.target}->${connection.source}`;
    const isBidirectional = remaining.has(reverseKey);

    remaining.delete(key);

    if (isBidirectional) {
      remaining.delete(reverseKey);
    }

    edges.push({
      id: isBidirectional
        ? [connection.source, connection.target].sort().join("<->")
        : key,
      source: connection.source,
      target: connection.target,
      type: "smoothstep",
      animated: false,
      label: isBidirectional ? "2-way" : undefined,
      markerStart: isBidirectional
        ? { type: MarkerType.ArrowClosed, color: "#737373" }
        : undefined,
      markerEnd: { type: MarkerType.ArrowClosed, color: "#a3a3a3" },
      style: { stroke: "#737373", strokeWidth: 1.5 },
      labelStyle: {
        fill: "#a3a3a3",
        fontFamily: "var(--font-geist-mono)",
        fontSize: 10,
      },
      labelBgStyle: { fill: "#0a0a0a", fillOpacity: 0.92 },
      labelBgPadding: [5, 3],
      labelBgBorderRadius: 2,
    });
  }

  return edges;
}

function RoomGraphNode({ data }: NodeProps<RoomNode>) {
  return (
    <article className="w-60 border border-white/20 bg-neutral-950 text-white shadow-xl shadow-black/30">
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-neutral-950 !bg-neutral-500"
      />
      <div className="border-b border-white/10 px-3 py-2.5">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
          {data.slug}
        </p>
        <h3 className="mt-1 text-sm font-semibold text-white">{data.title}</h3>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 px-3 py-3 text-xs">
        <div>
          <dt className="text-white/40">Connections</dt>
          <dd className="mt-0.5 font-mono text-white/80">{data.connections}</dd>
        </div>
        <div>
          <dt className="text-white/40">Active tracks</dt>
          <dd className="mt-0.5 font-mono text-white/80">{data.enabledTracks}</dd>
        </div>
        <div>
          <dt className="text-white/40">Desktop spots</dt>
          <dd className="mt-0.5 font-mono text-white/80">
            {data.desktopHotspots}
          </dd>
        </div>
        <div>
          <dt className="text-white/40">Mobile spots</dt>
          <dd className="mt-0.5 font-mono text-white/80">
            {data.mobileHotspots}
          </dd>
        </div>
      </dl>
      <div className="flex items-center justify-between border-t border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-white/45">
        <span>Room {formatPercent(data.roomAudioVolume)}</span>
        <span>Playlist {formatPercent(data.playlistVolume)}</span>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-neutral-950 !bg-neutral-400"
      />
    </article>
  );
}

const nodeTypes = { room: RoomGraphNode };

export function RoomOverviewAdmin() {
  const [hotspotManifest, setHotspotManifest] = useState(
    createStaticHotspotManifest,
  );
  const [playlistManifest, setPlaylistManifest] = useState(
    createStaticPlaylistManifest,
  );
  const [settingsManifest, setSettingsManifest] = useState(
    createStaticSiteSettingsManifest,
  );
  const [sources, setSources] = useState<ManifestSources>({
    hotspots: "static",
    playlists: "static",
    settings: "static",
  });
  const [status, setStatus] = useState("Loading live room data...");
  const [compactLayout, setCompactLayout] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 639px)");
    const updateLayout = () => setCompactLayout(mediaQuery.matches);

    updateLayout();
    mediaQuery.addEventListener("change", updateLayout);

    return () => mediaQuery.removeEventListener("change", updateLayout);
  }, []);

  useEffect(() => {
    let canceled = false;

    async function loadRoomData() {
      try {
        const response = await fetch("/api/runtime", { cache: "no-store" });

        if (!response.ok) {
          throw new Error("Could not load the live room manifests.");
        }

        const result = (await response.json()) as {
          hotspots?: { manifest?: unknown; source?: ManifestSource };
          playlists?: { manifest?: unknown; source?: ManifestSource };
          settings?: { manifest?: unknown; source?: ManifestSource };
        };
        const hotspotsResult = result.hotspots ?? {};
        const playlistsResult = result.playlists ?? {};
        const settingsResult = result.settings ?? {};

        if (!canceled) {
          const nextHotspots = normalizeHotspotManifest(
            hotspotsResult.manifest,
          );

          setHotspotManifest(nextHotspots);
          setPlaylistManifest(
            normalizePlaylistManifest(playlistsResult.manifest),
          );
          setSettingsManifest(normalizeSiteSettingsManifest(settingsResult.manifest));
          setSources({
            hotspots: hotspotsResult.source === "r2" ? "r2" : "static",
            playlists: playlistsResult.source === "r2" ? "r2" : "static",
            settings: settingsResult.source === "r2" ? "r2" : "static",
          });
          setStatus(`Updated ${nextHotspots.updatedAt}`);
        }
      } catch (error) {
        if (!canceled) {
          setStatus(
            error instanceof Error
              ? `${error.message} Showing static fallback.`
              : "Showing static fallback.",
          );
        }
      }
    }

    void loadRoomData();

    return () => {
      canceled = true;
    };
  }, []);

  const { edges, nodes } = useMemo(() => {
    const connections = deriveConnections(hotspotManifest);
    const connectionCounts = new Map<SceneSlug, Set<SceneSlug>>();
    const columns = compactLayout ? 1 : hotspotSceneSlugs.length > 4 ? 3 : 2;
    const rowGap = compactLayout ? 190 : 230;

    for (const slug of hotspotSceneSlugs) {
      connectionCounts.set(slug, new Set());
    }

    for (const connection of connections) {
      connectionCounts.get(connection.source)?.add(connection.target);
      connectionCounts.get(connection.target)?.add(connection.source);
    }

    const roomNodes: RoomNode[] = hotspotSceneSlugs.map((slug, index) => ({
      id: slug,
      type: "room",
      position: {
        x: (index % columns) * 340,
        y: Math.floor(index / columns) * rowGap,
      },
      data: {
        connections: connectionCounts.get(slug)?.size ?? 0,
        desktopHotspots: hotspotManifest.scenes[slug].desktop.length,
        enabledTracks: playlistManifest.rooms[slug].tracks.filter(
          (track) => track.enabled,
        ).length,
        mobileHotspots: hotspotManifest.scenes[slug].mobile.length,
        playlistVolume: settingsManifest.rooms[slug].playlistVolume,
        roomAudioVolume: settingsManifest.rooms[slug].roomAudioVolume,
        slug,
        title: scenes[slug].title,
      },
    }));

    return {
      edges: createRoomEdges(connections),
      nodes: roomNodes,
    };
  }, [compactLayout, hotspotManifest, playlistManifest, settingsManifest]);

  const graphHeight = compactLayout
    ? Math.max(840, nodes.length * 190 + 80)
    : undefined;
  const liveSourceCount = Object.values(sources).filter(
    (source) => source === "r2",
  ).length;
  const sourceLabel =
    liveSourceCount === 3
      ? "3/3 R2 manifests"
      : liveSourceCount === 0
        ? "Static fallback"
        : `${liveSourceCount}/3 R2 / partial fallback`;

  return (
    <section className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-white/40">
            Room system
          </p>
          <h2 className="mt-1 text-xl font-semibold">Overview</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
            Connections come from the published desktop and mobile hotspot
            manifest plus room overlays. Repeated paths are combined.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/?debug=true"
            className="border border-white/20 px-3 py-2 text-sm text-white/70 transition hover:border-white/50 hover:text-white"
          >
            Preview Rooms
          </Link>
          <Link
            href="/tools/hotspots"
            className="bg-white px-3 py-2 text-sm font-medium text-black transition hover:bg-white/85"
          >
            Edit Hotspots
          </Link>
        </div>
      </div>

      <div className="overflow-hidden border border-white/15 bg-black">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5">
          <p className="font-mono text-xs uppercase tracking-[0.13em] text-white/45">
            {nodes.length} rooms / {edges.length} connection groups
          </p>
          <p className="font-mono text-[11px] text-white/35">
            {sourceLabel} / {status}
          </p>
        </div>
        <div
          className="h-[34rem] w-full sm:h-[38rem]"
          style={graphHeight ? { height: graphHeight } : undefined}
        >
          <ReactFlow
            key={compactLayout ? "compact" : "wide"}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            nodesFocusable={false}
            edgesFocusable={false}
            elementsSelectable={false}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.45}
            maxZoom={1.5}
            colorMode="dark"
            aria-label="Paper Planet room connection overview"
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={22}
              size={1}
              color="#292929"
            />
            <Controls showInteractive={false} />
            {nodes.length > 6 ? (
              <MiniMap pannable zoomable nodeColor="#404040" maskColor="#050505cc" />
            ) : null}
          </ReactFlow>
        </div>
      </div>
    </section>
  );
}
