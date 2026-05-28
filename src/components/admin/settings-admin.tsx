"use client";

import { useEffect, useMemo, useState } from "react";
import {
  clampVolume,
  createStaticSiteSettingsManifest,
  normalizeSiteSettingsManifest,
  settingsRoomSlugs,
  settingsRoomTitles,
  type RoomAudioSettings,
  type SiteSettingsManifest,
} from "@/lib/site-settings";

type SettingsResponse = {
  manifest: SiteSettingsManifest;
  source: "r2" | "static";
};

function classNames(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatPercent(volume: number) {
  return `${Math.round(volume * 100)}%`;
}

function updateRoomSettings(
  manifest: SiteSettingsManifest,
  room: (typeof settingsRoomSlugs)[number],
  updates: Partial<RoomAudioSettings>,
): SiteSettingsManifest {
  return {
    ...manifest,
    rooms: {
      ...manifest.rooms,
      [room]: {
        ...manifest.rooms[room],
        ...updates,
      },
    },
  };
}

export function SettingsAdmin() {
  const [manifest, setManifest] = useState(createStaticSiteSettingsManifest);
  const [source, setSource] = useState<"r2" | "static">("static");
  const [status, setStatus] = useState("Loading settings...");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const totalMixLabel = useMemo(() => {
    const construction = manifest.rooms.construction;
    const hq = manifest.rooms.hq;

    return `Construction ${formatPercent(
      construction.roomAudioVolume,
    )}/${formatPercent(construction.playlistVolume)} / HQ ${formatPercent(
      hq.roomAudioVolume,
    )}/${formatPercent(hq.playlistVolume)}`;
  }, [manifest]);

  useEffect(() => {
    let isCanceled = false;

    async function loadSettings() {
      setError("");

      try {
        const response = await fetch("/api/admin/settings", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Could not load settings.");
        }

        const result = (await response.json()) as SettingsResponse;

        if (!isCanceled) {
          setManifest(normalizeSiteSettingsManifest(result.manifest));
          setSource(result.source);
          setStatus(
            `${result.source === "r2" ? "R2 settings" : "Static fallback"} / updated ${
              result.manifest.updatedAt
            }`,
          );
        }
      } catch (loadError) {
        if (!isCanceled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load settings.",
          );
          setStatus("Static fallback");
        }
      }
    }

    void loadSettings();

    return () => {
      isCanceled = true;
    };
  }, []);

  function updateVolume(
    room: (typeof settingsRoomSlugs)[number],
    key: keyof RoomAudioSettings,
    value: string,
  ) {
    const nextValue = clampVolume(Number(value));

    if (!Number.isFinite(nextValue)) {
      return;
    }

    setManifest((current) =>
      updateRoomSettings(current, room, {
        [key]: Number(nextValue.toFixed(2)),
      }),
    );
  }

  async function saveSettings() {
    setError("");
    setIsSaving(true);

    try {
      const response = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(manifest),
      });

      if (!response.ok) {
        throw new Error("Could not publish settings.");
      }

      const result = (await response.json()) as SettingsResponse;
      const nextManifest = normalizeSiteSettingsManifest(result.manifest);

      setManifest(nextManifest);
      setSource(result.source);
      setStatus(`R2 settings / updated ${nextManifest.updatedAt}`);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not publish settings.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Settings</h2>
          <p className="mt-1 font-mono text-sm text-white/45">
            {source === "r2" ? "R2 settings" : "Static fallback"} / {totalMixLabel}
          </p>
        </div>
        <button
          type="button"
          onClick={saveSettings}
          disabled={isSaving}
          className="cursor-pointer bg-white px-3 py-2 text-sm font-medium text-black hover:bg-white/85 disabled:cursor-not-allowed disabled:bg-white/30"
        >
          {isSaving ? "Publishing..." : "Publish Settings"}
        </button>
      </div>

      <div className="grid gap-4">
        {settingsRoomSlugs.map((room) => {
          const roomSettings = manifest.rooms[room];

          return (
            <section
              key={room}
              className="grid gap-4 border border-white/15 bg-black p-4"
            >
              <div>
                <h3 className="font-semibold">{settingsRoomTitles[room]}</h3>
                <p className="mt-1 text-sm text-white/55">
                  Adjust the room/video audio against the music playlist.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <VolumeControl
                  label="Room/video audio"
                  value={roomSettings.roomAudioVolume}
                  onChange={(value) =>
                    updateVolume(room, "roomAudioVolume", value)
                  }
                />
                <VolumeControl
                  label="Playlist audio"
                  value={roomSettings.playlistVolume}
                  onChange={(value) => updateVolume(room, "playlistVolume", value)}
                />
              </div>
            </section>
          );
        })}
      </div>

      <p className="font-mono text-sm text-white/45">{status}</p>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
    </section>
  );
}

function VolumeControl({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: number;
}) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="flex items-center justify-between gap-3">
        <span className="text-white/80">{label}</span>
        <span className="font-mono text-white/55">{formatPercent(value)}</span>
      </span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="cursor-pointer accent-white"
      />
      <input
        type="number"
        min="0"
        max="1"
        step="0.01"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={classNames(
          "w-24 border border-white/20 bg-black px-2 py-1 font-mono text-white outline-none",
          "focus:border-white",
        )}
      />
    </label>
  );
}
