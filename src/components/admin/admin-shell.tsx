"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type KeyboardEvent } from "react";
import { AudioAdmin } from "@/components/admin/audio-admin";
import { FontAdmin } from "@/components/admin/font-admin";
import { RoomOverviewAdmin } from "@/components/admin/room-overview-admin";
import { SettingsAdmin } from "@/components/admin/settings-admin";

type AdminTab = "overview" | "audio" | "hotspots" | "font" | "settings";

const tabs: { id: AdminTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "audio", label: "Audio" },
  { id: "hotspots", label: "Hotspots" },
  { id: "font", label: "Font" },
  { id: "settings", label: "Settings" },
];

function classNames(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function AdminShell() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.refresh();
  }

  function handleTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    let nextIndex = index;

    if (event.key === "ArrowRight") {
      nextIndex = (index + 1) % tabs.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = tabs.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    const nextTab = tabs[nextIndex];

    setActiveTab(nextTab.id);
    event.currentTarget.parentElement
      ?.querySelector<HTMLButtonElement>(`#admin-tab-${nextTab.id}`)
      ?.focus();
  }

  return (
    <main className="admin-cursors h-dvh overflow-y-auto bg-neutral-950 text-white">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[90rem] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-white/45">
              Paper Planet
            </p>
            <h1 className="text-xl font-semibold">Admin</h1>
            <p className="mt-1 text-sm text-white/45">
              Rooms, audio, hotspots, and publishing
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="border border-white/20 px-3 py-2 text-sm text-white/70 transition hover:border-white/60 hover:text-white"
            >
              View Site
            </Link>
            <button
              type="button"
              onClick={logout}
              className="border border-white/20 px-3 py-2 text-sm text-white/70 transition hover:border-white/60 hover:text-white"
            >
              Log Out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[90rem] px-4 py-5 sm:px-6">
        <nav
          className="flex gap-1 overflow-x-auto border-b border-white/10"
          aria-label="Admin sections"
          role="tablist"
        >
          {tabs.map((tab, index) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
              id={`admin-tab-${tab.id}`}
              role="tab"
              aria-controls={`admin-panel-${tab.id}`}
              aria-selected={activeTab === tab.id}
              tabIndex={activeTab === tab.id ? 0 : -1}
              className={classNames(
                "shrink-0 px-3 py-2.5 text-sm transition",
                activeTab === tab.id
                  ? "border-b border-white text-white"
                  : "text-white/55 hover:text-white",
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div
          id={`admin-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`admin-tab-${activeTab}`}
          className="py-6"
        >
          {activeTab === "overview" ? <RoomOverviewAdmin /> : null}
          {activeTab === "audio" ? <AudioAdmin /> : null}
          {activeTab === "hotspots" ? (
            <section className="grid gap-4">
              <h2 className="text-lg font-semibold">Hotspots</h2>
              <p className="max-w-2xl text-sm leading-6 text-white/60">
                Hotspots publish to the R2 manifest used by the live site. The
                repo JSON is only the fallback seed.
              </p>
              <Link
                href="/tools/hotspots"
                className="w-fit bg-white px-3 py-2 text-sm font-medium text-black transition hover:bg-white/85"
              >
                Open Hotspot Editor
              </Link>
            </section>
          ) : null}
          {activeTab === "font" ? <FontAdmin /> : null}
          {activeTab === "settings" ? <SettingsAdmin /> : null}
        </div>
      </div>
    </main>
  );
}
