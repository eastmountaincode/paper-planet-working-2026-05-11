"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AudioAdmin } from "@/components/admin/audio-admin";
import { FontAdmin } from "@/components/admin/font-admin";

type AdminTab = "audio" | "hotspots" | "font" | "settings";

const tabs: { id: AdminTab; label: string }[] = [
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
  const [activeTab, setActiveTab] = useState<AdminTab>("audio");

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.refresh();
  }

  return (
    <main className="admin-cursors h-dvh overflow-y-auto bg-neutral-950 text-white">
      <header className="border-b border-white/10 bg-black">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-white/45">
              Paper Planet
            </p>
            <h1 className="text-xl font-semibold">Admin</h1>
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

      <div className="mx-auto w-full max-w-7xl px-4 py-5">
        <nav className="flex gap-1 border-b border-white/10">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={classNames(
                "px-3 py-2 text-sm transition",
                activeTab === tab.id
                  ? "border-b border-white text-white"
                  : "text-white/55 hover:text-white",
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="py-5">
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
          {activeTab === "settings" ? (
            <section className="grid gap-2">
              <h2 className="text-lg font-semibold">Settings</h2>
              <p className="text-sm text-white/60">No settings yet.</p>
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}
