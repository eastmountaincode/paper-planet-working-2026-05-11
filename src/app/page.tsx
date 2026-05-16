import { Suspense } from "react";
import { RoomExperience } from "@/components/room-experience";
import { scenes } from "@/lib/scenes";

export default function Home() {
  return (
    <Suspense fallback={null}>
      <RoomExperience scene={scenes.construction} />
    </Suspense>
  );
}
