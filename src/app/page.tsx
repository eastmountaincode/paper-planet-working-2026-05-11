import { Suspense } from "react";
import { RoomExperience } from "@/components/room-experience";

export default function Home() {
  return (
    <Suspense fallback={null}>
      <RoomExperience />
    </Suspense>
  );
}
