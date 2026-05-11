import type { Metadata } from "next";
import { HotspotEditor } from "@/components/hotspot-editor";

export const metadata: Metadata = {
  title: "Hotspot Tool | Paper Planet",
};

export default function HotspotToolPage() {
  return <HotspotEditor />;
}
