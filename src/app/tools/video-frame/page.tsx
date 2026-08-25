import type { Metadata } from "next";
import { VideoSafeZoneTool } from "@/components/video-safe-zone-tool";

export const metadata: Metadata = {
  title: "Video Frame Checker | Paper Planet",
  description:
    "Inspect Paper Planet video crops and safe interaction areas across screen sizes.",
};

export default function VideoFrameToolPage() {
  return <VideoSafeZoneTool />;
}
