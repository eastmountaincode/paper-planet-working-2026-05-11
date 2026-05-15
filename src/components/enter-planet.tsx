"use client";

import { useRouter } from "next/navigation";
import { markPlanetEntered } from "@/lib/entry-state";

export function EnterPlanet() {
  const router = useRouter();

  function enter() {
    markPlanetEntered();
    router.push("/rooms/construction");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-black text-white">
      <button
        type="button"
        onClick={enter}
        className="border border-white px-8 py-4 font-mono text-sm uppercase tracking-[0.22em] text-white transition hover:bg-white hover:text-black focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-4 focus-visible:ring-offset-black"
      >
        Enter Planet
      </button>
    </main>
  );
}
