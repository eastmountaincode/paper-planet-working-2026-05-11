import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FrameDemo, type FrameDemoId } from "@/components/frame-demo";

export const metadata: Metadata = {
  title: "Video Safe-Zone Demo | Paper Planet",
  description: "Resize the window to inspect the Paper Planet video safe zone.",
};

const DEMOS = new Set<FrameDemoId>(["home", "green-room", "scale-down"]);

export default async function FrameDemoPage({
  params,
}: {
  params: Promise<{ demo: string }>;
}) {
  const { demo } = await params;

  if (!DEMOS.has(demo as FrameDemoId)) {
    notFound();
  }

  return <FrameDemo demo={demo as FrameDemoId} />;
}
